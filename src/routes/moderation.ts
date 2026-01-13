import { Router } from "express";
import {
	getModerationServices,
	getReportOptions,
	reportModerationEvents,
	banFromTvBlacksky,
	unbanFromTvBlacksky,
	searchBanFromTvBlacksky,
	getEscalatedUsers,
	getProfileModerationData,
	emitModerationEvent,
} from "../controllers/moderation.controller";
import {
	muteUserHandler,
	unmuteUserHandler,
	checkMutedHandler,
	listMutedUsersHandler,
} from "../controllers/mute.controller";
import { authenticateJWT } from "../middleware/auth.middleware";

const router = Router();

router.get("/report-options", getReportOptions);
router.get("/services", authenticateJWT, getModerationServices);
router.post("/report", authenticateJWT, reportModerationEvents);

router.post("/user/ban", authenticateJWT, banFromTvBlacksky);
router.delete("/user/ban", authenticateJWT, unbanFromTvBlacksky);
router.get("/user/ban", authenticateJWT, searchBanFromTvBlacksky);

router.post("/user/mute", authenticateJWT, muteUserHandler);
router.delete("/user/mute", authenticateJWT, unmuteUserHandler);
router.get("/user/mute/check", authenticateJWT, checkMutedHandler);
router.get("/user/mute", authenticateJWT, listMutedUsersHandler);

// Ozone integration endpoints
router.get("/escalated-users", authenticateJWT, getEscalatedUsers);
router.post("/emit-event", authenticateJWT, emitModerationEvent);
router.get("/profile/:did", authenticateJWT, getProfileModerationData);

export default router;
