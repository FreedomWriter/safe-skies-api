import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { Mutex } from "async-mutex";
import dotenv from "dotenv";
import { BLUE_SKY_ADMIN_CLIENT_META_DATA } from './constants/oauth-config';
import { SessionStore, StateStore } from "../repos/storage";

dotenv.config();

const mutex = new Mutex();

/**
 * Request lock to prevent concurrent access to the session store
 */
const requestLock = async <T>(
	_name: string,
	fn: () => T | Promise<T> | PromiseLike<T>,
): Promise<T> => {
	return await mutex.runExclusive(() => Promise.resolve(fn()));
};


/**
 * Admin OAuth Client Singleton
 */
class AdminOAuthClientSingleton {
	private static instance: NodeOAuthClient;

	private constructor() {}

	public static async getInstance(): Promise<NodeOAuthClient> {
		if (!AdminOAuthClientSingleton.instance) {
			const baseUrl = process.env.BASE_URL;
			if (!baseUrl) {
				throw new Error("BASE_URL environment variable is required for admin OAuth client");
			}

			// Create admin OAuth client with public client configuration
			AdminOAuthClientSingleton.instance = new NodeOAuthClient({
				// Admin-specific client metadata
				clientMetadata: BLUE_SKY_ADMIN_CLIENT_META_DATA,

				// Use existing encrypted database stores
				stateStore: new StateStore(),

				// Use existing encrypted database session store
				sessionStore: new SessionStore(),

				// Request lock for concurrent access protection
				requestLock,
			});
		}

		return AdminOAuthClientSingleton.instance;
	}
}

export { AdminOAuthClientSingleton };