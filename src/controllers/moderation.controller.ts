import { Request, Response } from "express";
import {
	fetchReportOptions,
	fetchModerationServices,
	reportToBlacksky,
	reportToOzone,
	banUserFromTv,
	unbanUserFromTv,
	searchBannedUsersFromTv,
} from "../repos/moderation";

import { customServiceGate, canPerformAction } from "../repos/permissions";
import { Report, BannedFromTV, OzoneEventType } from "../lib/types/moderation";
import { createModerationLog } from "../repos/logs";
import { resolveHandleToDid, getAuthenticatedAtprotoAgent } from "../repos/atproto";
import { BLACKSKY_FEED_URI } from "../lib/constants/feeds";

// Event type to Ozone $type mapping
const EVENT_TYPE_MAP: Record<OzoneEventType, string> = {
	takedown: "tools.ozone.moderation.defs#modEventTakedown",
	reverseTakedown: "tools.ozone.moderation.defs#modEventReverseTakedown",
	acknowledge: "tools.ozone.moderation.defs#modEventAcknowledge",
	escalate: "tools.ozone.moderation.defs#modEventEscalate",
	comment: "tools.ozone.moderation.defs#modEventComment",
	label: "tools.ozone.moderation.defs#modEventLabel",
	tag: "tools.ozone.moderation.defs#modEventTag",
};

const VALID_EVENT_TYPES = Object.keys(EVENT_TYPE_MAP) as OzoneEventType[];

/**
 * Validates event-specific parameters
 * Returns error message string if validation fails, null if valid
 */
function validateEventParams(
	eventType: OzoneEventType,
	params: Record<string, unknown> | undefined
): string | null {
	switch (eventType) {
		case "comment":
			if (!params?.comment || typeof params.comment !== "string" || params.comment.trim() === "") {
				return "comment event requires a non-empty 'comment' parameter";
			}
			break;

		case "label":
			if (!params) {
				return "label event requires 'createLabelVals' and 'negateLabelVals' parameters";
			}
			if (!Array.isArray(params.createLabelVals)) {
				return "label event requires 'createLabelVals' to be an array";
			}
			if (!Array.isArray(params.negateLabelVals)) {
				return "label event requires 'negateLabelVals' to be an array";
			}
			if (params.createLabelVals.length === 0 && params.negateLabelVals.length === 0) {
				return "label event requires at least one label in 'createLabelVals' or 'negateLabelVals'";
			}
			break;

		case "tag":
			if (!params) {
				return "tag event requires 'add' and 'remove' parameters";
			}
			if (!Array.isArray(params.add)) {
				return "tag event requires 'add' to be an array";
			}
			if (!Array.isArray(params.remove)) {
				return "tag event requires 'remove' to be an array";
			}
			if (params.add.length === 0 && params.remove.length === 0) {
				return "tag event requires at least one tag in 'add' or 'remove'";
			}
			break;

		case "takedown":
			if (params?.durationInHours !== undefined) {
				if (typeof params.durationInHours !== "number" || params.durationInHours < 0) {
					return "durationInHours must be a non-negative number";
				}
			}
			break;

		default:
			break;
	}

	return null;
}

/**
 * Builds the properly typed event object for Ozone emitEvent
 */
function buildEventObject(
	eventType: OzoneEventType,
	params: Record<string, unknown> | undefined
): { $type: string; [key: string]: unknown } {
	const $type = EVENT_TYPE_MAP[eventType];

	switch (eventType) {
		case "takedown":
			return {
				$type,
				comment: params?.comment,
				durationInHours: params?.durationInHours,
				acknowledgeAccountSubjects: params?.acknowledgeAccountSubjects,
				policies: params?.policies,
			};

		case "reverseTakedown":
			return {
				$type,
				comment: params?.comment,
			};

		case "acknowledge":
			return {
				$type,
				comment: params?.comment,
				acknowledgeAccountSubjects: params?.acknowledgeAccountSubjects,
			};

		case "escalate":
			return {
				$type,
				comment: params?.comment,
			};

		case "comment":
			return {
				$type,
				comment: params?.comment,
				sticky: params?.sticky,
			};

		case "label":
			return {
				$type,
				comment: params?.comment,
				createLabelVals: params?.createLabelVals as string[],
				negateLabelVals: params?.negateLabelVals as string[],
				durationInHours: params?.durationInHours,
			};

		case "tag":
			return {
				$type,
				comment: params?.comment,
				add: params?.add as string[],
				remove: params?.remove as string[],
			};

		default:
			return { $type };
	}
}

/**
 * Extracts the comment field from various event types
 */
function extractCommentFromEvent(event: unknown): string | undefined {
	if (event && typeof event === "object" && "comment" in event && typeof (event as { comment: unknown }).comment === "string") {
		return (event as { comment: string }).comment;
	}
	return undefined;
}

export const getReportOptions = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const options = await fetchReportOptions();
		res.status(200).json({ options });
		return;
	} catch (error) {
		console.error("Error reporting post:", error);
		res.status(500).json({ error: "Internal server error" });
	}
};

export const getModerationServices = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const actingUser = req.user;
		if (!actingUser) {
			res.status(401).json({ error: "Unauthorized: No valid session" });
			return;
		}

		const { uri } = req.query;
		if (!uri) {
			res.status(400).json({ error: "Uri is required" });
			return;
		}
		const services = await fetchModerationServices(uri.toString());

		res.status(200).json({ services });
	} catch (error) {
		console.error("Error in getModerationServices:", error);
		res.status(500).json({ error: "Internal server error" });
	}
};

/**
 * Processes a single moderation report.
 * Returns an object containing the report payload, status, and details from processing each service and logging.
 */
export const processReport = async (
	report: Report,
	idx: number,
	actingUser: { did: string },
) => {
	// Build the payload and override performed_by with actingUser.did
	const payload = {
		targetedPostUri: report.targetedPostUri,
		reason: report.reason,
		toServices: report.toServices,
		targetedUserDid: report.targetedUserDid,
		uri: report.uri,
		feedName: report.feedName,
		additionalInfo: report.additionalInfo || "",
		action: report.action, // expected to be a valid ModAction
		targetedPost: report.targetedPost,
		targetedProfile: report.targetedProfile,
		performed_by: actingUser.did,
	};

	const resultDetails: {
		service: string;
		result?: unknown;
		error?: unknown;
	}[] = [];

	// Helper to process a service
	async function processService(serviceValue: string) {
		if (serviceValue === "blacksky") {
			// Only process Blacksky if the gate passes
			const allowed = await customServiceGate("blacksky", payload.uri);
			if (allowed) {
				try {
					const blackskyResult = await reportToBlacksky([
						{ uri: payload.targetedPostUri },
					]);
					resultDetails.push({
						service: "blacksky",
						result: blackskyResult,
					});
				} catch (bsError: unknown) {
					console.error(`Report ${idx}: Error reporting to Blacksky:`, bsError);
					resultDetails.push({
						service: "blacksky",
						error:
							bsError instanceof Error
								? bsError.message
								: "An unknown error occurred",
					});
				}
			} else {
				console.warn(`Report ${idx}: Blacksky service gate not passed.`);
				resultDetails.push({
					service: "blacksky",
					error: "Service gate not passed",
				});
			}
		} else if (serviceValue === "ozone") {
			// Process Ozone unconditionally
			try {
				const ozoneResult = await reportToOzone();
				resultDetails.push({ service: "ozone", result: ozoneResult });
			} catch (ozError: unknown) {
				console.error(`Report ${idx}: Error reporting to Ozone:`, ozError);
				resultDetails.push({
					service: "ozone",
					error:
						ozError instanceof Error
							? ozError.message
							: "An unknown error occurred",
				});
			}
		} else {
			// For any future services, default behavior (or add extra logic as needed)
			resultDetails.push({
				service: serviceValue,
				error: "Service not implemented",
			});
		}
	}

	// Process each requested service.
	// Assume payload.toServices is an array of ModerationService objects having a "value" property.
	for (const service of payload.toServices) {
		await processService(service.value);
	}

	// Attempt to create a moderation log entry.
	try {
		await createModerationLog({
			uri: payload.uri,
			performed_by: actingUser.did,
			action: payload.action,
			target_user_did: payload.targetedUserDid,
			metadata: {
				reason: payload.reason,
				feedName: payload.feedName,
				additionalInfo: payload.additionalInfo,
				targetedPost: payload.targetedPost,
				targetedProfile: payload.targetedProfile,
				toServices: payload.toServices,
			},
			target_post_uri: payload.targetedPostUri,
		});

		resultDetails.push({ service: "log", result: "logged" });
	} catch (logError: unknown) {
		console.error(`Report ${idx}: Error creating moderation log:`, logError);
		resultDetails.push({
			service: "log",
			error:
				logError instanceof Error
					? logError.message
					: "An unknown error occurred",
		});
	}

	return { report: payload, status: "success", details: resultDetails };
};

/**
 * Processes a bulk array of moderation reports. For each report, the function:
 * - Validates and builds the payload (using actingUser.did for performed_by)
 * - Processes each requested moderation service (e.g., Blacksky, Ozone)
 * - Creates a moderation log entry
 * - Returns a summary of processing for each report.
 */
export const reportModerationEvents = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		// Ensure the authenticated user is present.
		const actingUser = req.user;
		if (!actingUser) {
			console.error("No acting user found in request.");
			res.status(401).json({ error: "Unauthorized: No valid session" });
			return;
		}

		// Ensure the request body is an array; if not, wrap it.
		let reports = req.body;
		if (!Array.isArray(reports)) {
			console.warn("Request body is not an array. Wrapping in an array.");
			reports = [reports];
		}

		// Process each report individually using the helper.
		const summary = await Promise.all(
			reports.map((report: Report, idx: number) =>
				processReport(report, idx, actingUser),
			),
		);

		res.json({ summary });
	} catch (error: unknown) {
		console.error("Error reporting moderation events:", error);
		res.status(500).json({ error: "Internal server error" });
	}
};

export const banFromTvBlacksky = async (
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
		const hasPermission = await canPerformAction(actingUser.did, "user_ban", BLACKSKY_FEED_URI);
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

		await banUserFromTv(resolvedDid, reason, tags);

		// Create moderation log
		await createModerationLog({
			uri: BLACKSKY_FEED_URI,
			performed_by: actingUser.did,
			action: "user_ban",
			target_user_did: resolvedDid,
			metadata: {
				reason: reason || null,
				tags: tags || null,
				feedName: "Blacksky",
			},
		});

		res.status(200).json({ success: true });
	} catch (error) {
		console.log(error);
		console.error("Error banning user from TV:", error);
		res.status(500).json({ error: "Internal server error" });
	}
};

export const unbanFromTvBlacksky = async (
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
		const hasPermission = await canPerformAction(actingUser.did, "user_ban", BLACKSKY_FEED_URI);
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

		await unbanUserFromTv(resolvedDid);

		// Create moderation log
		await createModerationLog({
			uri: BLACKSKY_FEED_URI,
			performed_by: actingUser.did,
			action: "user_unban",
			target_user_did: resolvedDid,
			metadata: {
				feedName: "Blacksky",
			},
		});

		res.status(200).json({ success: true });
	} catch (error) {
		console.error("Error unbanning user from TV:", error);
		res.status(500).json({ error: "Internal server error" });
	}
};

export const searchBanFromTvBlacksky = async (
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
		const hasPermission = await canPerformAction(actingUser.did, "user_ban", BLACKSKY_FEED_URI);
		if (!hasPermission) {
			res.status(403).json({ error: "Insufficient permissions for Blacksky feed" });
			return;
		}

		const { actor, tag, limit, offset } = req.query;
		const limitNum = limit ? Number.parseInt(limit as string, 10) : undefined;
		const offsetNum = offset ? Number.parseInt(offset as string, 10) : undefined;

		// Resolve handle to DID if actor is provided
		let resolvedDid: string | undefined;
		if (actor && typeof actor === "string") {
			try {
				resolvedDid = await resolveHandleToDid(actor);
			} catch (resolveError) {
				res.status(400).json({
					error: `Failed to resolve actor to DID: ${resolveError instanceof Error ? resolveError.message : "Unknown error"}`
				});
				return;
			}
		}

		const bannedUsers: BannedFromTV[] = await searchBannedUsersFromTv(
			resolvedDid,
			tag as string | undefined,
			limitNum,
			offsetNum,
		);

		res.status(200).json({ bannedUsers });
	} catch (error) {
		console.error("Error searching banned users from TV:", error);
		res.status(500).json({ error: "Internal server error" });
	}
};

// Type guards for Ozone subject types
const isAccountSubject = (subject: unknown): subject is { did: string } =>
	typeof subject === 'object' && subject !== null && 'did' in subject && !('uri' in subject);

const isRecordSubject = (subject: unknown): subject is { uri: string; cid: string } =>
	typeof subject === 'object' && subject !== null && 'uri' in subject;

export const getEscalatedUsers = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const actingUser = req.user;
		if (!actingUser) {
			res.status(401).json({ error: "Unauthorized: No valid session" });
			return;
		}

		// Assumes that if a user can ban Blacksky users that they can interact with Ozone
		const hasPermission = await canPerformAction(actingUser.did, "user_ban", BLACKSKY_FEED_URI);
		if (!hasPermission) {
			res.status(403).json({ error: "Insufficient permissions: Moderator access required" });
			return;
		}

		// Get pagination parameters
		const { cursor, limit } = req.query;
		const limitNum = limit ? Number.parseInt(limit as string, 10) : 50;

		try {
			// Get authenticated agent to call Ozone API
			const agent = await getAuthenticatedAtprotoAgent();

			// Fetch all escalated subjects from Ozone (both accounts and records/posts)
			const ozoneResponse = await agent.tools.ozone.moderation.queryStatuses({
				reviewState: "tools.ozone.moderation.defs#reviewEscalated",
				limit: limitNum,
				cursor: cursor as string | undefined,
			});

			// Process subjects and categorize by type
			const processedItems: Array<{
				type: 'account' | 'post';
				did: string;
				postUri?: string;
				postCid?: string;
			}> = [];

			for (const status of ozoneResponse.data.subjectStatuses) {
				if (isAccountSubject(status.subject)) {
					processedItems.push({
						type: 'account',
						did: status.subject.did,
					});
				} else if (isRecordSubject(status.subject)) {
					// Extract DID from post URI: at://did:plc:xxx/app.bsky.feed.post/yyy
					const did = status.subject.uri.split('/')[2];
					processedItems.push({
						type: 'post',
						did,
						postUri: status.subject.uri,
						postCid: status.subject.cid,
					});
				}
			}

			// Collect unique DIDs for profile fetching
			const uniqueDids = [...new Set(processedItems.map(item => item.did))];

			// Batch fetch profiles for all DIDs
			const profilesMap = new Map<string, { handle: string; displayName?: string; avatar?: string }>();
			if (uniqueDids.length > 0) {
				try {
					const profilesResponse = await agent.getProfiles({ actors: uniqueDids });
					for (const profile of profilesResponse.data.profiles) {
						profilesMap.set(profile.did, {
							handle: profile.handle,
							displayName: profile.displayName,
							avatar: profile.avatar,
						});
					}
				} catch (profileError) {
					console.warn("Failed to batch fetch profiles:", profileError);
				}
			}

			// Build response with profile data
			const items = processedItems.map(item => ({
				did: item.did,
				handle: profilesMap.get(item.did)?.handle,
				displayName: profilesMap.get(item.did)?.displayName,
				avatar: profilesMap.get(item.did)?.avatar,
				type: item.type,
				...(item.postUri && { postUri: item.postUri }),
				...(item.postCid && { postCid: item.postCid }),
			}));

			res.status(200).json({
				items,
				cursor: ozoneResponse.data.cursor,
				hasMore: !!ozoneResponse.data.cursor
			});

		} catch (ozoneError) {
			console.error("Error fetching escalated items from Ozone:", ozoneError);
			// Graceful fallback - return empty state
			res.status(200).json({
				items: [],
				cursor: undefined,
				hasMore: false
			});
		}
	} catch (error) {
		console.error("Error fetching escalated items:", error);
		res.status(500).json({ error: "Internal server error" });
	}
};

// Fetch profile moderation data from Ozone
export const getProfileModerationData = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const actingUser = req.user;
		if (!actingUser) {
			res.status(401).json({ error: "Unauthorized: No valid session" });
			return;
		}

		// Check if user has moderator/admin permissions
		const hasPermission = await canPerformAction(actingUser.did, "user_ban", BLACKSKY_FEED_URI);
		if (!hasPermission) {
			res.status(403).json({ error: "Insufficient permissions: Moderator access required" });
			return;
		}

		const { did } = req.params;
		if (!did) {
			res.status(400).json({ error: "Missing required parameter: did" });
			return;
		}

		// Validate DID format
		if (!did.startsWith("did:")) {
			res.status(400).json({ error: "Invalid DID format. Must start with 'did:'" });
			return;
		}

		// Get authenticated agent
		const agent = await getAuthenticatedAtprotoAgent();

		// Fetch subject status from Ozone
		let subjectStatus = null;
		try {
			const repoResponse = await agent.tools.ozone.moderation.getRepo({ did });
			if (repoResponse.data.moderation?.subjectStatus) {
				const status = repoResponse.data.moderation.subjectStatus;
				subjectStatus = {
					reviewState: status.reviewState,
					comment: status.comment,
					tags: status.tags,
					takendown: status.takendown,
					appealed: status.appealed,
					lastReviewedAt: status.lastReviewedAt,
					lastReviewedBy: status.lastReviewedBy,
					lastReportedAt: status.lastReportedAt,
					muteUntil: status.muteUntil,
					suspendUntil: status.suspendUntil,
					createdAt: status.createdAt,
					updatedAt: status.updatedAt,
				};
			}
		} catch (repoError) {
			// User may not have any moderation status yet - this is not an error
			console.warn(`No moderation status found for ${did}:`, repoError);
		}

		// Fetch recent moderation events for this subject
		let recentEvents: Array<{
			id: number;
			eventType: string;
			createdBy: string;
			createdAt: string;
			creatorHandle?: string;
			comment?: string;
		}> = [];

		try {
			const eventsResponse = await agent.tools.ozone.moderation.queryEvents({
				subject: did,
				limit: 25,
				sortDirection: "desc",
			});
			console.log(`${JSON.stringify(eventsResponse)}`);
			recentEvents = eventsResponse.data.events.map((event) => ({
				id: event.id,
				eventType: event.event.$type || "unknown",
				createdBy: event.createdBy,
				createdAt: event.createdAt,
				creatorHandle: event.creatorHandle,
				comment: extractCommentFromEvent(event.event),
			}));
		} catch (eventsError) {
			console.warn(`Failed to fetch events for ${did}:`, eventsError);
		}

		// Fetch profile data for context
		let profile = undefined;
		try {
			const profileResponse = await agent.getProfile({ actor: did });
			profile = {
				handle: profileResponse.data.handle,
				displayName: profileResponse.data.displayName,
				avatar: profileResponse.data.avatar,
			};
		} catch (profileError) {
			console.warn(`Failed to fetch profile for ${did}:`, profileError);
		}

		res.status(200).json({
			did,
			subjectStatus,
			recentEvents,
			profile,
		});
	} catch (error) {
		console.error("Error fetching profile moderation data:", error);
		res.status(500).json({ error: "Internal server error" });
	}
};

// Emit a moderation event to Ozone
export const emitModerationEvent = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const actingUser = req.user;
		if (!actingUser) {
			res.status(401).json({ error: "Unauthorized: No valid session" });
			return;
		}

		// Check if user has moderator/admin permissions
		const hasPermission = await canPerformAction(actingUser.did, "user_ban", BLACKSKY_FEED_URI);
		if (!hasPermission) {
			res.status(403).json({ error: "Insufficient permissions: Moderator access required" });
			return;
		}

		const { did, eventType, eventParams, subjectUri, subjectCid } = req.body;

		// Validate required fields
		if (!did) {
			res.status(400).json({ error: "Missing required field: did" });
			return;
		}

		if (!eventType) {
			res.status(400).json({ error: "Missing required field: eventType" });
			return;
		}

		// Validate DID format
		if (!did.startsWith("did:")) {
			res.status(400).json({ error: "Invalid DID format. Must start with 'did:'" });
			return;
		}

		// Validate subjectUri format if provided (should be an AT URI)
		if (subjectUri && !subjectUri.startsWith("at://")) {
			res.status(400).json({ error: "Invalid subjectUri format. Must be an AT URI starting with 'at://'" });
			return;
		}

		// Validate event type
		if (!VALID_EVENT_TYPES.includes(eventType)) {
			res.status(400).json({
				error: `Invalid eventType. Must be one of: ${VALID_EVENT_TYPES.join(", ")}`,
			});
			return;
		}

		// Validate event-specific parameters
		const validationError = validateEventParams(eventType, eventParams);
		if (validationError) {
			res.status(400).json({ error: validationError });
			return;
		}

		// Build the event object
		const eventObject = buildEventObject(eventType, eventParams);

		// Get authenticated agent
		const agent = await getAuthenticatedAtprotoAgent();

		// Build subject based on whether this is a post/record or account action
		let subject: { $type: string; did?: string; uri?: string; cid?: string };
		if (subjectUri) {
			// Record/post subject - use strongRef
			subject = {
				$type: "com.atproto.repo.strongRef",
				uri: subjectUri,
				cid: subjectCid || "",
			};
		} else {
			// Account subject - use repoRef
			subject = {
				$type: "com.atproto.admin.defs#repoRef",
				did: did,
			};
		}

		// Emit the event to Ozone
		const response = await agent.tools.ozone.moderation.emitEvent({
			event: eventObject,
			subject,
			createdBy: actingUser.did,
		});

		const subjectDescription = subjectUri ? `post ${subjectUri}` : `account ${did}`;
		res.status(200).json({
			success: true,
			eventId: response.data.id,
			message: `Successfully emitted ${eventType} event for ${subjectDescription}`,
		});
	} catch (error) {
		console.error("Error emitting moderation event:", error);

		// Handle specific Ozone errors
		if (error instanceof Error) {
			if (error.message.includes("SubjectHasAction")) {
				res.status(409).json({
					error: "Subject already has an active action of this type",
				});
				return;
			}
		}

		res.status(500).json({ error: "Internal server error" });
	}
};
