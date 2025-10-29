import app from "./app";
import { startReconciliationService } from "./services/reconciliation";
import { AdminOAuthClientSingleton } from "./lib/admin-oauth-client";

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
	if (process.env.NODE_ENV === "development") {
		console.log(`Server running on port ${PORT}`);
	}

	await AdminOAuthClientSingleton.initializeKeys();
	// Start the mute list reconciliation service
	startReconciliationService();
});
