import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';
import { exportPKCS8, exportSPKI, importJWK } from 'jose';
import { Mutex } from "async-mutex";
import dotenv from "dotenv";
import { BLUE_SKY_ADMIN_CLIENT_META_DATA } from './constants/oauth-config';
import { SessionStore, StateStore } from "../repos/storage";
import { db } from "../config/db";
import { encrypt, decrypt } from "./utils/encryption";

dotenv.config();

const mutex = new Mutex();

export interface OAuthKeyPair {
	keyId: string;
	privateKey: string;
	publicKey: string;
	algorithm: string;
}

export interface JWKS {
	keys: Record<string, unknown>[];
}

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
	private static joseKey: JoseKey | null = null;

	private constructor() {}

	public static async getInstance(): Promise<NodeOAuthClient> {
		if (!AdminOAuthClientSingleton.instance) {
			const baseUrl = process.env.BASE_URL;
			if (!baseUrl) {
				throw new Error("BASE_URL environment variable is required for admin OAuth client");
			}

			// Get OAuth keys for confidential client authentication
			const joseKey = await AdminOAuthClientSingleton.getOrCreateJoseKey();

			// Create admin OAuth client with confidential client configuration
			AdminOAuthClientSingleton.instance = new NodeOAuthClient({
				// Admin-specific client metadata
				clientMetadata: BLUE_SKY_ADMIN_CLIENT_META_DATA,

				// Keyset for private key JWT authentication
				keyset: [joseKey],

				// Use admin-prefixed encrypted database stores
				stateStore: new StateStore(true),

				// Use admin-prefixed encrypted database session store
				sessionStore: new SessionStore(true),

				// Request lock for concurrent access protection
				requestLock,
			});
		}

		return AdminOAuthClientSingleton.instance;
	}

	/**
	 * Initialize OAuth keys - load from database or generate new ones
	 */
	public static async initializeKeys(): Promise<void> {
		try {
			await AdminOAuthClientSingleton.getOrCreateJoseKey();
			console.log("OAuth keys initialized successfully");
		} catch (error) {
			console.error("Error initializing OAuth keys:", error);
			throw new Error("Failed to initialize OAuth keys");
		}
	}

	/**
	 * Get JWKS (JSON Web Key Set) for public key distribution
	 */
	public static async getJWKS(): Promise<JWKS> {
		if (!AdminOAuthClientSingleton.joseKey) {
			AdminOAuthClientSingleton.joseKey = await AdminOAuthClientSingleton.getOrCreateJoseKey();
		}

		const publicJwk = AdminOAuthClientSingleton.joseKey.publicJwk;
		if (!publicJwk) {
			throw new Error("No public key available for JWKS");
		}
		return {
			keys: [publicJwk as Record<string, unknown>]
		};
	}

	/**
	 * Get or create JoseKey (loads from DB or generates new)
	 */
	private static async getOrCreateJoseKey(): Promise<JoseKey> {
		if (AdminOAuthClientSingleton.joseKey) {
			return AdminOAuthClientSingleton.joseKey;
		}

		try {
			// Try to load existing keys from database
			const existingKeyPair = await AdminOAuthClientSingleton.loadKeyPairFromDatabase();

			if (existingKeyPair) {
				AdminOAuthClientSingleton.joseKey = await JoseKey.fromImportable(
					existingKeyPair.privateKey,
					existingKeyPair.keyId
				);
				console.log(`OAuth keys loaded from database (key ID: ${existingKeyPair.keyId})`);
			} else {
				// Generate new keys if none exist
				const keyId = `oauth-key-${Date.now()}`;
				AdminOAuthClientSingleton.joseKey = await JoseKey.generate(['ES256'], keyId);
				const keyPair = await AdminOAuthClientSingleton.joseKeyToKeyPair(
					AdminOAuthClientSingleton.joseKey
				);
				await AdminOAuthClientSingleton.saveKeyPairToDatabase(keyPair);
				console.log(`New OAuth keys generated and saved (key ID: ${keyPair.keyId})`);
			}

			return AdminOAuthClientSingleton.joseKey;
		} catch (error) {
			console.error("Error loading/generating OAuth keys:", error);
			throw new Error("Failed to initialize OAuth keys");
		}
	}

	/**
	 * Convert JoseKey to OAuthKeyPair format for database storage
	 */
	private static async joseKeyToKeyPair(joseKey: JoseKey): Promise<OAuthKeyPair> {
		const keyId = joseKey.kid;
		if (!keyId) {
			throw new Error("JoseKey must have a kid for storage");
		}

		// Get both private and public JWK representations
		const privateJwk = joseKey.privateJwk;
		const publicJwk = joseKey.publicJwk;

		if (!privateJwk || !publicJwk) {
			throw new Error("No private or public key available for storage");
		}

		// Import the JWKs to get KeyLike objects for PEM export
		const privateKeyObj = await importJWK(privateJwk, 'ES256');
		const publicKeyObj = await importJWK(publicJwk, 'ES256');

		// Ensure we have KeyLike objects (not Uint8Array)
		if (privateKeyObj instanceof Uint8Array || publicKeyObj instanceof Uint8Array) {
			throw new Error("Cannot export symmetric key as PEM");
		}

		// Export to PEM formats
		const privateKeyPem = await exportPKCS8(privateKeyObj);
		const publicKeyPem = await exportSPKI(publicKeyObj);

		return {
			keyId,
			privateKey: privateKeyPem,
			publicKey: publicKeyPem,
			algorithm: 'ES256'
		};
	}

	/**
	 * Load keys from database
	 */
	private static async loadKeyPairFromDatabase(): Promise<OAuthKeyPair | null> {
		try {
			const row = await db("oauth_keys")
				.select("key_id", "private_key", "public_key", "algorithm")
				.where({ is_active: true })
				.orderBy("created_at", "desc")
				.first();

			if (!row) {
				return null;
			}

			// Decrypt the keys
			const decryptedPrivateKey = decrypt(JSON.parse(row.private_key));
			const decryptedPublicKey = decrypt(JSON.parse(row.public_key));

			return {
				keyId: row.key_id,
				privateKey: decryptedPrivateKey,
				publicKey: decryptedPublicKey,
				algorithm: row.algorithm
			};
		} catch (error) {
			console.warn("Failed to load OAuth keys from database, will generate new ones:", error);
			return null;
		}
	}

	/**
	 * Save keys to database
	 */
	private static async saveKeyPairToDatabase(keyPair: OAuthKeyPair): Promise<void> {
		// Encrypt the keys
		const encryptedPrivateKey = encrypt(keyPair.privateKey);
		const encryptedPublicKey = encrypt(keyPair.publicKey);

		// Deactivate existing keys
		await db("oauth_keys").update({ is_active: false });

		// Insert new key
		await db("oauth_keys").insert({
			key_id: keyPair.keyId,
			private_key: JSON.stringify(encryptedPrivateKey),
			public_key: JSON.stringify(encryptedPublicKey),
			algorithm: keyPair.algorithm,
			is_active: true
		});
	}
}

export { AdminOAuthClientSingleton };