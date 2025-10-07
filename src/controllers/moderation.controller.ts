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
import { Report, BannedFromTV } from "../lib/types/moderation";
import { createModerationLog } from "../repos/logs";
import { resolveHandleToDid } from "../repos/atproto";

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
		const blackskyFeedUri = "at://did:plc:w4xbfzo7kqfes5zb7r6qv3rw/app.bsky.feed.generator/blacksky";
		const hasPermission = await canPerformAction(actingUser.did, "user_ban", blackskyFeedUri);
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
			uri: blackskyFeedUri,
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
		const blackskyFeedUri = "at://did:plc:w4xbfzo7kqfes5zb7r6qv3rw/app.bsky.feed.generator/blacksky";
		const hasPermission = await canPerformAction(actingUser.did, "user_ban", blackskyFeedUri);
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
			uri: blackskyFeedUri,
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
		const blackskyFeedUri = "at://did:plc:w4xbfzo7kqfes5zb7r6qv3rw/app.bsky.feed.generator/blacksky";
		const hasPermission = await canPerformAction(actingUser.did, "user_ban", blackskyFeedUri);
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
