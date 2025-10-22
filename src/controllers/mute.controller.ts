import { Request, Response } from "express";
import {
	muteUser,
	unmuteUser,
	checkMuted,
	getMutedUsers,
} from "../repos/mute";
import { canPerformAction } from "../repos/permissions";
import { resolveHandleToDid } from "../repos/atproto";
import { createModerationLog } from "../repos/logs";
import { MuteFilters } from "../lib/types/moderation";
import { BLACKSKY_FEED_URI } from "../lib/constants/feeds";

/**
 * Mutes a user by adding them to the mute list
 * Requires mod/admin permissions for Blacksky feed
 */
export const muteUserHandler = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const actingUser = req.user;
		if (!actingUser) {
			res.status(401).json({ error: "Unauthorized: No valid session" });
			return;
		}

		const { actor, reason, tags } = req.body;
		if (!actor) {
			res.status(400).json({ error: "Missing required field: actor" });
			return;
		}

		// Check if user has permission for Blacksky feed
		const hasPermission = await canPerformAction(actingUser.did, "user_mute", BLACKSKY_FEED_URI);
		if (!hasPermission) {
			res.status(403).json({ error: "Insufficient permissions for Blacksky feed" });
			return;
		}

		// Resolve handle to DID if needed
		let resolvedDid: string;
		try {
			resolvedDid = await resolveHandleToDid(actor);
		} catch (resolveError) {
			res.status(400).json({
				error: `Failed to resolve actor to DID: ${resolveError instanceof Error ? resolveError.message : "Unknown error"}`
			});
			return;
		}

		// Check if user is already muted
		const isAlreadyMuted = await checkMuted(resolvedDid);
		if (isAlreadyMuted) {
			res.status(409).json({ error: "User is already muted" });
			return;
		}

		// Mute the user
		const result = await muteUser(resolvedDid, reason, actingUser.did, tags);

		if (!result.success) {
			res.status(500).json({ error: result.error || "Failed to mute user" });
			return;
		}

		// Create moderation log
		await createModerationLog({
			uri: process.env.MUTE_LIST_URI!,
			performed_by: actingUser.did,
			action: "user_mute",
			target_user_did: resolvedDid,
			metadata: {
				reason: reason || null,
				tags: tags || null,
				feedName: "The Green List",
			},
		});

		res.status(200).json({
			success: true,
			message: "User muted successfully",
			did: resolvedDid
		});
	} catch (error) {
		console.error("Error muting user:", error);
		res.status(500).json({ error: "Internal server error" });
	}
};

/**
 * Unmutes a user by removing them from the mute list
 * Requires mod/admin permissions for Blacksky feed
 */
export const unmuteUserHandler = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const actingUser = req.user;
		if (!actingUser) {
			res.status(401).json({ error: "Unauthorized: No valid session" });
			return;
		}

		const { actor } = req.query;
		if (!actor || typeof actor !== "string") {
			res.status(400).json({ error: "Missing or invalid query parameter: actor" });
			return;
		}

		// Check if user has permission for Blacksky feed
		const hasPermission = await canPerformAction(actingUser.did, "user_mute", BLACKSKY_FEED_URI);
		if (!hasPermission) {
			res.status(403).json({ error: "Insufficient permissions for Blacksky feed" });
			return;
		}

		// Resolve handle to DID if needed
		let resolvedDid: string;
		try {
			resolvedDid = await resolveHandleToDid(actor);
		} catch (resolveError) {
			res.status(400).json({
				error: `Failed to resolve actor to DID: ${resolveError instanceof Error ? resolveError.message : "Unknown error"}`
			});
			return;
		}

		// Check if user is actually muted
		const isMuted = await checkMuted(resolvedDid);
		if (!isMuted) {
			res.status(404).json({ error: "User is not currently muted" });
			return;
		}

		// Unmute the user
		const result = await unmuteUser(resolvedDid);

		if (!result.success) {
			res.status(500).json({ error: result.error || "Failed to unmute user" });
			return;
		}

		// Create moderation log
		await createModerationLog({
			uri: BLACKSKY_FEED_URI,
			performed_by: actingUser.did,
			action: "user_unmute", // New dedicated action type
			target_user_did: resolvedDid,
			metadata: {
				feedName: "Blacksky Mute List",
			},
		});

		res.status(200).json({
			success: true,
			message: "User unmuted successfully",
			did: resolvedDid
		});
	} catch (error) {
		console.error("Error unmuting user:", error);
		res.status(500).json({ error: "Internal server error" });
	}
};

/**
 * Checks if a specific user is muted
 * Requires mod/admin permissions for Blacksky feed
 */
export const checkMutedHandler = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const actingUser = req.user;
		if (!actingUser) {
			res.status(401).json({ error: "Unauthorized: No valid session" });
			return;
		}

		const { actor } = req.query;
		if (!actor || typeof actor !== "string") {
			res.status(400).json({ error: "Missing or invalid query parameter: actor" });
			return;
		}

		// Check if user has permission for Blacksky feed
		const hasPermission = await canPerformAction(actingUser.did, "user_mute", BLACKSKY_FEED_URI);
		if (!hasPermission) {
			res.status(403).json({ error: "Insufficient permissions for Blacksky feed" });
			return;
		}

		// Resolve handle to DID if needed
		let resolvedDid: string;
		try {
			resolvedDid = await resolveHandleToDid(actor);
		} catch (resolveError) {
			res.status(400).json({
				error: `Failed to resolve actor to DID: ${resolveError instanceof Error ? resolveError.message : "Unknown error"}`
			});
			return;
		}

		// Check mute status
		const isMuted = await checkMuted(resolvedDid);

		res.status(200).json({
			muted: isMuted,
			did: resolvedDid
		});
	} catch (error) {
		console.error("Error checking mute status:", error);
		res.status(500).json({ error: "Internal server error" });
	}
};

/**
 * Lists all muted users with optional filtering and pagination
 * Requires mod/admin permissions for Blacksky feed
 */
export const listMutedUsersHandler = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const actingUser = req.user;
		if (!actingUser) {
			res.status(401).json({ error: "Unauthorized: No valid session" });
			return;
		}

		// Check if user has permission for Blacksky feed
		const hasPermission = await canPerformAction(actingUser.did, "user_mute", BLACKSKY_FEED_URI);
		if (!hasPermission) {
			res.status(403).json({ error: "Insufficient permissions for Blacksky feed" });
			return;
		}

		// Parse query parameters
		const {
			did,
			muted_by,
			sync_status,
			tag,
			limit,
			offset,
		} = req.query;

		const filters: MuteFilters = {};

		if (did && typeof did === "string") {
			filters.did = did;
		}
		if (muted_by && typeof muted_by === "string") {
			filters.muted_by = muted_by;
		}
		if (sync_status && typeof sync_status === "string") {
			if (["synced", "pending", "failed"].includes(sync_status)) {
				filters.sync_status = sync_status as "synced" | "pending" | "failed";
			}
		}
		if (tag && typeof tag === "string") {
			filters.tag = tag;
		}
		if (limit && typeof limit === "string") {
			const limitNum = Number.parseInt(limit, 10);
			if (!Number.isNaN(limitNum) && limitNum > 0 && limitNum <= 100) {
				filters.limit = limitNum;
			}
		}
		if (offset && typeof offset === "string") {
			const offsetNum = Number.parseInt(offset, 10);
			if (!Number.isNaN(offsetNum) && offsetNum >= 0) {
				filters.offset = offsetNum;
			}
		}

		// Get muted users
		const result = await getMutedUsers(filters);

		res.status(200).json({
			users: result.users,
			total: result.total,
			limit: filters.limit || null,
			offset: filters.offset || 0,
		});
	} catch (error) {
		console.error("Error listing muted users:", error);
		res.status(500).json({ error: "Internal server error" });
	}
};