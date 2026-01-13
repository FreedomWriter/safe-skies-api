import { Request, Response } from "express";
import { AdminOAuthClientSingleton } from "../lib/admin-oauth-client";

/**
 * Initiates the admin OAuth flow for mute list management. Redirects to OAuth for the MUTE_LIST_ADMIN_DID
 */
export const adminSignin = async (req: Request, res: Response): Promise<void> => {
	try {
		// Verify the designated admin account is set
		const adminDid = process.env.MUTE_LIST_ADMIN_DID;
		if (!adminDid) {
			res.status(500).json({ error: "Admin DID not configured" });
			return;
		}

		const adminOAuthClient = await AdminOAuthClientSingleton.getInstance();
		const url = await adminOAuthClient.authorize(adminDid as string);

		// Redirect directly to the OAuth provider instead of returning JSON
		res.redirect(url.toString());
	} catch (err) {
		console.error("Error initiating admin OAuth:", err);
		res.status(500).json({ error: "Failed to initiate admin authentication" });
	}
};

/**
 * Handles the admin OAuth callback
 * Stores admin tokens for mute list operations
 */
export const adminCallback = async (req: Request, res: Response): Promise<void> => {
	try {
		const adminOAuthClient = await AdminOAuthClientSingleton.getInstance();

		// Process OAuth callback using admin OAuth client
		const { session } = await adminOAuthClient.callback(
			new URLSearchParams(req.query as Record<string, string>),
		);

		if (!session?.sub) {
			throw new Error("Invalid session: No DID found");
		}

		// Verify this is the designated admin account
		const adminDid = process.env.MUTE_LIST_ADMIN_DID;
		if (!adminDid) {
			throw new Error("Admin DID not configured");
		}

		if (session.sub !== adminDid) {
			throw new Error(`Unauthorized: Expected admin DID ${adminDid}, got ${session.sub}`);
		}

		// Session is automatically stored by the admin OAuth client's sessionStore
		console.log(`Admin OAuth authentication successful for ${session.sub}`);

		// Return a simple success page instead of redirecting to frontend
		res.status(200).send(`
			<html>
				<head><title>Admin Authentication Successful</title></head>
				<body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
					<h1 style="color: green;">✅ Admin Authentication Successful</h1>
					<p>Admin DID: <code>${session.sub}</code></p>
					<p>The admin OAuth session has been stored securely.</p>
					<p>You can now close this window - the mute list reconciliation service will use these credentials.</p>
				</body>
			</html>
		`);
	} catch (err) {
		console.error("Admin OAuth callback error:", err);
		const errorMessage = err instanceof Error ? err.message : "Admin authentication failed";

		// Return a simple error page instead of redirecting to frontend
		res.status(400).send(`
			<html>
				<head><title>Admin Authentication Failed</title></head>
				<body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
					<h1 style="color: red;">❌ Admin Authentication Failed</h1>
					<p><strong>Error:</strong> ${errorMessage}</p>
					<p>Please try again or contact the administrator.</p>
				</body>
			</html>
		`);
	}
};

/**
 * Logs out the admin by clearing their stored tokens
 */
export const adminLogout = async (req: Request, res: Response): Promise<void> => {
	try {
		const adminDid = process.env.MUTE_LIST_ADMIN_DID;
		if (!adminDid) {
			res.status(500).json({ error: "Admin DID not configured" });
			return;
		}

		const adminOAuthClient = await AdminOAuthClientSingleton.getInstance();
		await adminOAuthClient.revoke(adminDid);

		res.json({ success: true, message: "Admin logged out successfully" });
	} catch (err) {
		console.error("Error in admin logout:", err);
		res.status(500).json({ error: "Failed to log out admin" });
	}
};

/**
 * Check admin authentication status
 */
export const adminStatus = async (req: Request, res: Response): Promise<void> => {
	try {
		const adminDid = process.env.MUTE_LIST_ADMIN_DID;
		if (!adminDid) {
			res.status(500).json({ error: "Admin DID not configured" });
			return;
		}

		const adminOAuthClient = await AdminOAuthClientSingleton.getInstance();

		// Try to restore the admin session to check if authenticated
		let isAuthenticated = false;
		try {
			const session = await adminOAuthClient.restore(adminDid);
			isAuthenticated = !!session;
		} catch (error) {
			// Session doesn't exist or is invalid
			isAuthenticated = false;
		}

		res.json({
			isAuthenticated,
			adminDid,
			loginUrl: isAuthenticated ? null : `${process.env.BASE_URL}/auth/admin/signin?handle=${adminDid}`
		});
	} catch (err) {
		console.error("Error checking admin status:", err);
		res.status(500).json({ error: "Failed to check admin status" });
	}
};