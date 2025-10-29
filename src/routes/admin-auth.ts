import { Router, Request, Response } from "express";
import {
	adminSignin,
	adminCallback,
	adminLogout,
	adminStatus
} from "../controllers/admin-auth.controller";
import { BLUE_SKY_ADMIN_CLIENT_META_DATA } from "../lib/constants/oauth-config";
import { AdminOAuthClientSingleton } from "../lib/admin-oauth-client";

const router = Router();

// Admin OAuth flow endpoints
router.get("/signin", adminSignin);
router.get("/callback", adminCallback);
router.post("/logout", adminLogout);
router.get("/status", adminStatus);

/**
 * Serve admin OAuth client metadata
 * This endpoint is required by the AT Protocol OAuth specification
 * The client_id URL must point to this endpoint
 */
router.get("/client-metadata.json", async (req: Request, res: Response): Promise<void> => {
	try {
		// Set proper headers for JSON metadata
		res.setHeader('Content-Type', 'application/json');
		res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

		res.json(BLUE_SKY_ADMIN_CLIENT_META_DATA);
	} catch (error) {
		console.error("Error serving admin OAuth client metadata:", error);
		res.status(500).json({
			error: "internal_server_error",
			error_description: "Failed to load admin OAuth client metadata"
		});
	}
});

router.get("/jwks.json", async (_req: Request, res: Response): Promise<void> => {
	try {
		// Set proper headers for JWKS response
		res.setHeader('Content-Type', 'application/json');
		res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

		const jwks = await AdminOAuthClientSingleton.getJWKS();
		res.json(jwks);
	} catch (error) {
		console.error("Error serving JWKS:", error);
		res.status(500).json({
			error: "internal_server_error",
			error_description: "Failed to load OAuth public keys"
		});
	}
});


export default router;