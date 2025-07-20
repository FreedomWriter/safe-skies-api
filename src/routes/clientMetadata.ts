import { Router } from "express";
import { BLUE_SKY_CLIENT_META_DATA } from "../lib/constants/oauth-config";

const router = Router();

router.get("/client-metadata.json", (_, res) => {
  res.header("Content-Type", "application/json");
  res.json(BLUE_SKY_CLIENT_META_DATA);
});

export default router;
