import { reconcileMuteList } from "../repos/mute";

let reconciliationInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Starts the background reconciliation service
 * Syncs local mute list DB with remote Bluesky list at regular intervals
 */
export function startReconciliationService(): void {
	// Get interval from environment, default to 5 minutes (300000ms)
	const intervalMs = Number(process.env.RECONCILIATION_INTERVAL_MS) || 300000;

	if (reconciliationInterval) {
		console.warn("Reconciliation service is already running");
		return;
	}

	console.log(`Starting mute list reconciliation service (interval: ${intervalMs}ms)`);

	// Run reconciliation immediately on start
	runReconciliation();

	// Set up recurring reconciliation
	reconciliationInterval = setInterval(() => {
		runReconciliation();
	}, intervalMs);
}

/**
 * Stops the background reconciliation service
 */
export function stopReconciliationService(): void {
	if (reconciliationInterval) {
		clearInterval(reconciliationInterval);
		reconciliationInterval = null;
		console.log("Mute list reconciliation service stopped");
	}
}

/**
 * Manually triggers a reconciliation run
 * Can be called independently of the scheduled service
 */
export async function runReconciliation(): Promise<void> {
	if (isRunning) {
		console.log("Reconciliation already in progress, skipping...");
		return;
	}

	isRunning = true;
	const startTime = Date.now();

	try {
		console.log("Starting mute list reconciliation...");

		const result = await reconcileMuteList();

		const duration = Date.now() - startTime;
		console.log(`Mute list reconciliation completed in ${duration}ms:`, {
			added: result.added,
			removed: result.removed,
			synced: result.synced,
			errors: result.errors.length
		});

		if (result.errors.length > 0) {
			console.error("Reconciliation errors:", result.errors);
		}
	} catch (error) {
		const duration = Date.now() - startTime;

		// Check if this is an OAuth authentication error
		if (error instanceof Error && error.message.includes("OAuth session not found")) {
			console.error(`Mute list reconciliation failed after ${duration}ms - Admin OAuth authentication required:`, error.message);
			console.error(`Please authenticate admin at: ${process.env.BASE_URL}/admin/auth/signin?handle=${process.env.MUTE_LIST_ADMIN_DID}`);
		} else if (error instanceof Error && error.message.includes("session expired")) {
			console.error(`Mute list reconciliation failed after ${duration}ms - Admin session expired:`, error.message);
		} else {
			console.error(`Mute list reconciliation failed after ${duration}ms:`, error);
		}
	} finally {
		isRunning = false;
	}
}

/**
 * Returns the current status of the reconciliation service
 */
export function getReconciliationStatus(): {
	running: boolean;
	intervalMs: number;
	isCurrentlyReconciling: boolean;
} {
	const intervalMs = Number(process.env.RECONCILIATION_INTERVAL_MS) || 300000;

	return {
		running: reconciliationInterval !== null,
		intervalMs,
		isCurrentlyReconciling: isRunning
	};
}