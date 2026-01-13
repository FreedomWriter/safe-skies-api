import { Router, Request, Response } from "express";
import { AdminOAuthClientSingleton } from "../lib/admin-oauth-client";

const router = Router();

/**
 * JWKS (JSON Web Key Set) endpoint
 * Returns public keys for OAuth client authentication verification
 */
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