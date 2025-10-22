import { db } from "../config/db";
import { MutedUser, MuteFilters } from "../lib/types/moderation";
import { getAuthenticatedAtprotoAgent } from "./atproto";

/**
 * Mutes a user by adding them to the remote list and local DB
 * Uses write-through cache pattern: remote first, then local
 * Stores record_key for fast unmute operations
 */
export async function muteUser(
	did: string,
	reason: string | null = null,
	mutedBy: string,
	tags: string[] | null = null,
): Promise<{ success: boolean; error?: string }> {
	try {
		// Step 1: Write to remote list first
		const agent = await getAuthenticatedAtprotoAgent();
		const response = await agent.com.atproto.repo.createRecord({
			repo: process.env.MUTE_LIST_ADMIN_DID!,
			collection: "app.bsky.graph.listitem",
			record: {
				subject: did,
				list: process.env.MUTE_LIST_URI!,
				createdAt: new Date().toISOString(),
			},
		});

		// Extract record key from response URI
		const recordKey = response.data.uri.split("/").pop()!;

		// Step 2: If remote write succeeds, update local DB with record_key
		await db("muted_users")
			.insert({
				did,
				reason,
				muted_by: mutedBy,
				tags,
				record_key: recordKey,
				sync_status: "synced",
				last_synced_at: new Date(),
			})
			.onConflict("did")
			.merge({
				reason,
				muted_by: mutedBy,
				tags,
				record_key: recordKey,
				sync_status: "synced",
				last_synced_at: new Date(),
			});

		return { success: true };
	} catch (error) {
		// If remote write fails, still add to local DB as 'pending'
		try {
			await db("muted_users")
				.insert({
					did,
					reason,
					muted_by: mutedBy,
					tags,
					record_key: null, // No record key if remote write failed
					sync_status: "pending",
				})
				.onConflict("did")
				.merge({
					reason,
					muted_by: mutedBy,
					tags,
					record_key: null,
					sync_status: "pending",
				});

			return {
				success: false,
				error: `Remote write failed, queued for sync: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		} catch (dbError) {
			console.error("Critical: Both remote and DB writes failed:", error, dbError);
			return {
				success: false,
				error: "Both remote and local writes failed",
			};
		}
	}
}

/**
 * Unmutes a user by removing them from the remote list and local DB
 * Uses stored record_key for O(1) deletion with fallback to search
 */
export async function unmuteUser(
	did: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const agent = await getAuthenticatedAtprotoAgent();

		// Step 1: Try fast path using stored record_key
		const localRecord = await db("muted_users").where("did", did).first();

		if (localRecord?.record_key) {
			try {
				await agent.com.atproto.repo.deleteRecord({
					repo: process.env.MUTE_LIST_ADMIN_DID!,
					collection: "app.bsky.graph.listitem",
					rkey: localRecord.record_key,
				});

				// Success - remove from DB
				await db("muted_users").where("did", did).delete();
				return { success: true };
			} catch (error) {
				// Record key is stale/invalid - fall back to search
				console.warn(`Stored record_key failed for ${did}, falling back to search:`, error);
			}
		}

		// Step 2: Fallback - search through list records
		const listRecords = await agent.com.atproto.repo.listRecords({
			repo: process.env.MUTE_LIST_ADMIN_DID!,
			collection: "app.bsky.graph.listitem",
		});

		const targetRecord = listRecords.data.records.find(
			(record: any) =>
				record.value.subject === did &&
				record.value.list === process.env.MUTE_LIST_URI!,
		);

		if (targetRecord) {
			const rkey = targetRecord.uri.split("/").pop()!;

			// Delete using found record key
			await agent.com.atproto.repo.deleteRecord({
				repo: process.env.MUTE_LIST_ADMIN_DID!,
				collection: "app.bsky.graph.listitem",
				rkey,
			});

			// Update our stored record_key for future use (if record still exists)
			if (localRecord) {
				await db("muted_users").where("did", did).update({ record_key: rkey });
			}
		}

		// Step 3: Remove from local DB regardless
		await db("muted_users").where("did", did).delete();

		return { success: true };
	} catch (error) {
		console.error("Error unmuting user:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Checks if a user is muted by querying the local DB
 * Includes both 'synced' and 'pending' records for immediate UX
 */
export async function checkMuted(did: string): Promise<boolean> {
	try {
		const record = await db("muted_users")
			.where("did", did)
			.whereIn("sync_status", ["synced", "pending"])
			.first();

		return !!record;
	} catch (error) {
		console.error("Error checking mute status:", error);
		return false;
	}
}

/**
 * Retrieves muted users with optional filtering and pagination
 */
export async function getMutedUsers(filters: MuteFilters = {}): Promise<{
	users: MutedUser[];
	total: number;
}> {
	try {
		let query = db("muted_users").select("*");

		// Apply filters
		if (filters.did) {
			query = query.where("did", filters.did);
		}
		if (filters.muted_by) {
			query = query.where("muted_by", filters.muted_by);
		}
		if (filters.sync_status) {
			query = query.where("sync_status", filters.sync_status);
		}
		if (filters.tag) {
			query = query.whereRaw("? = ANY(tags)", [filters.tag]);
		}

		// Get total count
		const totalQuery = query.clone();
		const [{ count }] = await totalQuery.count("did as count");
		const total = Number(count);

		// Apply pagination
		if (filters.limit) {
			query = query.limit(filters.limit);
		}
		if (filters.offset) {
			query = query.offset(filters.offset);
		}

		const users = await query.orderBy("muted_at", "desc");

		return { users, total };
	} catch (error) {
		console.error("Error fetching muted users:", error);
		return { users: [], total: 0 };
	}
}

/**
 * Fetches all members from the remote Bluesky list
 * Handles pagination to get complete list
 */
export async function fetchRemoteListMembers(): Promise<string[]> {
	try {
		const agent = await getAuthenticatedAtprotoAgent();
		const members: string[] = [];
		let cursor: string | undefined;

		do {
			const response = await agent.app.bsky.graph.getList({
				list: process.env.MUTE_LIST_URI!,
				limit: 100,
				cursor,
			});

			// Extract DIDs from list items
			const dids = response.data.items.map((item) => item.subject.did);
			members.push(...dids);

			cursor = response.data.cursor;
		} while (cursor);

		return members;
	} catch (error) {
		console.error("Error fetching remote list members:", error);
		throw error;
	}
}

/**
 * Reconciles the local DB with the remote list state
 * Handles bidirectional synchronization with record_key updates
 */
export async function reconcileMuteList(): Promise<{
	added: number;
	removed: number;
	synced: number;
	errors: string[];
}> {
	const result = {
		added: 0,
		removed: 0,
		synced: 0,
		errors: [] as string[],
	};

	try {
		// Fetch current state from both sources
		const [remoteMembers, localRecords] = await Promise.all([
			fetchRemoteListMembers(),
			db("muted_users").select("did", "sync_status", "record_key"),
		]);

		const localDids = localRecords.map((r) => r.did);

		// 1. Find external additions (Remote → Local)
		const toAdd = remoteMembers.filter((did) => !localDids.includes(did));

		if (toAdd.length > 0) {
			try {
				// Primary: Bulk insert (fast path)
				const recordsToInsert = toAdd.map(did => ({
					did,
					reason: null,
					muted_by: "external",
					tags: null,
					record_key: null, // Will be populated if needed for unmute
					sync_status: "synced",
					last_synced_at: new Date(),
				}));

				await db("muted_users").insert(recordsToInsert);
				result.added = toAdd.length;
				console.log(`Bulk inserted ${toAdd.length} external mutes`);

			} catch (bulkError) {
				// Fallback: Individual inserts (error isolation)
				console.warn("Bulk insert failed, falling back to individual inserts:", bulkError);

				for (const did of toAdd) {
					try {
						await db("muted_users").insert({
							did,
							reason: null,
							muted_by: "external",
							tags: null,
							record_key: null,
							sync_status: "synced",
							last_synced_at: new Date(),
						});
						result.added++;
					} catch (error) {
						result.errors.push(`Failed to add ${did}: ${error}`);
					}
				}
			}
		}

		// 2. Find external removals (Remote → Local)
		const toRemove = localDids.filter((did) => !remoteMembers.includes(did));

		for (const did of toRemove) {
			try {
				await db("muted_users").where("did", did).delete();
				result.removed++;
			} catch (error) {
				result.errors.push(`Failed to remove ${did}: ${error}`);
			}
		}

		// 3. Handle pending/failed records (Local → Remote retry)
		const pendingRecords = localRecords.filter((r) =>
			["pending", "failed"].includes(r.sync_status),
		);

		for (const record of pendingRecords) {
			if (remoteMembers.includes(record.did)) {
				// Remote caught up, mark as synced
				try {
					await db("muted_users")
						.where("did", record.did)
						.update({
							sync_status: "synced",
							last_synced_at: new Date(),
						});
					result.synced++;
				} catch (error) {
					result.errors.push(`Failed to sync ${record.did}: ${error}`);
				}
			} else {
				// Still missing, retry remote write
				try {
					const localRecord = await db("muted_users")
						.where("did", record.did)
						.first();

					if (localRecord) {
						const muteResult = await muteUser(
							record.did,
							localRecord.reason,
							localRecord.muted_by,
							localRecord.tags,
						);

						if (muteResult.success) {
							result.synced++;
						} else {
							// Mark as failed after retry
							await db("muted_users")
								.where("did", record.did)
								.update({ sync_status: "failed" });
							result.errors.push(`Retry failed for ${record.did}: ${muteResult.error}`);
						}
					}
				} catch (error) {
					result.errors.push(`Failed to retry ${record.did}: ${error}`);
				}
			}
		}

		// 4. Update last_synced_at for all synced records
		await db("muted_users")
			.where("sync_status", "synced")
			.update({ last_synced_at: new Date() });

		console.log("Mute list reconciliation complete:", result);
		return result;
	} catch (error) {
		const errorMsg = `Reconciliation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
		console.error(errorMsg);
		result.errors.push(errorMsg);
		return result;
	}
}