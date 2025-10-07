import app from "./app";
import { startReconciliationService } from "./services/reconciliation";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
	if (process.env.NODE_ENV === "development") {
		console.log(`Server running on port ${PORT}`);
	}

	// Start the mute list reconciliation service
	startReconciliationService();
});
