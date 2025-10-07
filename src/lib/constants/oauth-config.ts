// src/repos/constants.ts
import { OAuthClientMetadataInput } from "@atproto/oauth-client-node";
import dotenv from "dotenv";

dotenv.config();

const baseUrl = process.env.BASE_URL;

if (!baseUrl) {
	throw new Error("BASE_URL environment variable is required");
}

// Bluesky OAuth Metadata
export const BLUE_SKY_CLIENT_META_DATA: OAuthClientMetadataInput = {
	client_name: `${baseUrl}`,
	client_id: `${baseUrl}/oauth/client-metadata.json`,
	client_uri: `${baseUrl}`,
	redirect_uris: [`${baseUrl}/auth/callback`],
	policy_uri: `${baseUrl}/policy`,
	tos_uri: `${baseUrl}/tos`,
	scope: "atproto transition:generic",
	grant_types: ["authorization_code", "refresh_token"],
	response_types: ["code"],
	application_type: "web",
	token_endpoint_auth_method: "none",
	dpop_bound_access_tokens: true,
};

export const BLUE_SKY_ADMIN_CLIENT_META_DATA: OAuthClientMetadataInput = {
	// Must be a URL that will expose admin client metadata
	client_id: `${baseUrl}/admin/auth/client-metadata.json`,
	client_name: 'Safe Skies Admin',
	client_uri: baseUrl,
	redirect_uris: [`${baseUrl}/admin/auth/callback`],
	grant_types: ['authorization_code', 'refresh_token'],
	scope: 'atproto transition:generic',
	response_types: ['code'],
	application_type: 'web',
	token_endpoint_auth_method: 'none',
	dpop_bound_access_tokens: true,
}