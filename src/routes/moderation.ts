import { Router } from "express";
import {
	getModerationServices,
	getReportOptions,
	reportModerationEvents,
	banFromTvBlacksky,
	unbanFromTvBlacksky,
	searchBanFromTvBlacksky,
} from "../controllers/moderation.controller";
import { authenticateJWT } from "../middleware/auth.middleware";

const router = Router();

router.get("/report-options", getReportOptions);
router.get("/services", authenticateJWT, getModerationServices);
router.post("/report", authenticateJWT, reportModerationEvents);

router.post("/user/ban", authenticateJWT, banFromTvBlacksky);
router.delete("/user/ban", authenticateJWT, unbanFromTvBlacksky);
router.get("/user/ban", authenticateJWT, searchBanFromTvBlacksky);

export default router;
