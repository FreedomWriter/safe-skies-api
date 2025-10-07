import { AtpAgent } from "@atproto/api";

class AtpAgentSingleton {
	private static instance: AtpAgent;
	private constructor() {}
	public static getInstance(): AtpAgent {
		if (!AtpAgentSingleton.instance) {
			this.instance = new AtpAgent({
				service: process.env.BSKY_BASE_API_URL!,
			});
		}
		return this.instance;
	}
}

export const AtprotoAgent = AtpAgentSingleton.getInstance();

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
