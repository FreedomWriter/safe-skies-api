import { AtpAgent, Agent } from "@atproto/api";
import { AdminOAuthClientSingleton } from "../lib/admin-oauth-client";

class AtpAgentSingleton {
	private static instance: AtpAgent;
	private static authenticatedInstance: AtpAgent;
	private constructor() {}

	public static getInstance(): AtpAgent {
		if (!AtpAgentSingleton.instance) {
			this.instance = new AtpAgent({
				service: process.env.BSKY_BASE_API_URL!,
			});
		}
		return this.instance;
	}

	public static async getAuthenticatedInstance(): Promise<AtpAgent> {
		const adminDid = process.env.MUTE_LIST_ADMIN_DID;
		if (!adminDid) {
			throw new Error("MUTE_LIST_ADMIN_DID not configured");
		}

		try {
			// Get the admin OAuth client
			const adminOAuthClient = await AdminOAuthClientSingleton.getInstance();

			// Use client.restore() to get the OAuth session
			// This automatically handles token refresh if needed
			const oauthSession = await adminOAuthClient.restore(adminDid);

			// Create an Agent directly from the OAuth session
			// This is the proper way to use OAuth sessions with AT Protocol
			const agent = new Agent(oauthSession);

			// Cast to AtpAgent for compatibility with existing code
			// Agent extends AtpAgent, so this is safe
			return agent as AtpAgent;

		} catch (error) {
			if (error instanceof Error) {
				if (error.message.includes('not found') || error.message.includes('No session')) {
					throw new Error(`Admin OAuth session not found. Please authenticate at ${process.env.BASE_URL}/admin/auth/signin`);
				}
				if (error.message.includes('expired') || error.message.includes('refresh')) {
					throw new Error(`Admin session expired and refresh failed. Please re-authenticate at ${process.env.BASE_URL}/admin/auth/signin`);
				}
			}

			console.error("Error getting authenticated admin agent:", error);
			throw new Error(`Failed to get authenticated admin agent. Please re-authenticate at ${process.env.BASE_URL}/admin/auth/signin`);
		}
	}
}

export const AtprotoAgent = AtpAgentSingleton.getInstance();
export const getAuthenticatedAtprotoAgent = AtpAgentSingleton.getAuthenticatedInstance;

/**
 * Retrieves the user's actor feeds via the AtprotoAgent
 * using Bluesky's getActorFeeds endpoint.
 */
export const getActorFeeds = async (actor?: string) => {
	if (!actor) {
		return;
	}
	try {
		const response = await AtprotoAgent.app.bsky.feed.getActorFeeds({ actor });
		return response.data;
	} catch (error) {
		console.error("Error fetching feed generator data:", error);
		throw new Error("Failed to fetch feed generator data.");
	}
};
/**
 *
 * Retrieves the feed generator data for a given feed.
 * @param feed the uri
 */

export const getFeedGenerator = async (feed: string) => {
	try {
		const response = await AtprotoAgent.app.bsky.feed.getFeedGenerator({
			feed,
		});
		return response.data.view;
	} catch (error) {
		console.error("Error fetching feed generator data:", error);
		throw new Error("Failed to fetch feed generator data.");
	}
};

/**
 * Resolves a handle or DID to a DID.
 * If the input is already a DID (starts with "did:"), returns it as-is.
 * Otherwise, resolves the handle to a DID using the AtprotoAgent.
 *
 * @param actor - Either a DID (e.g., "did:plc:abc123") or a handle (e.g., "alice.bsky.social")
 * @returns The resolved DID
 */
export const resolveHandleToDid = async (actor: string): Promise<string> => {
	// If it's already a DID, return it
	if (actor.startsWith("did:")) {
		return actor;
	}

	// Otherwise, resolve the handle to a DID
	try {
		const response = await AtprotoAgent.resolveHandle({ handle: actor });
		if (!response.success || !response.data.did) {
			throw new Error("Failed to resolve handle to DID");
		}
		return response.data.did;
	} catch (error) {
		console.error("Error resolving handle to DID:", error);
		throw new Error(`Failed to resolve handle "${actor}" to DID`);
	}
};
