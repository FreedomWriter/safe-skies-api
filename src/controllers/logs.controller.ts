import { Request, Response } from "express";
import { LogFilters } from "../lib/types/logs";
import { getLogs } from "../repos/logs";
import { ModAction } from "../lib/types/moderation";
import { getUserRoleForFeed } from "../repos/permissions";

/**
 * GET /api/logs
 * Query parameters must include "uri" (the feed identifier).
 * Access rules:
 *  - Admins see all logs for the feed.
 *  - Moderators see only logs for actions: 'user_unban', 'user_ban', 'post_delete', 'post_restore'
 *    and the "performed_by" field is omitted.
 *  - Regular users are forbidden.
 */
export const getLogsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const sessionPayload = req.user;
    if (!sessionPayload) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const userDid = sessionPayload.did;

    // Construct an absolute URL using the host header.
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const url = new URL(req.url, baseUrl);
    const uri = url.searchParams.get("uri");
    if (!uri) {
      res.status(400).json({ error: "Feed URI is required to view logs" });
      return;
    }

    // Determine the user's role for this feed.
    const role = await getUserRoleForFeed(userDid, uri);

    if (role === "user") {
      res
        .status(403)
        .json({ error: "Not authorized to view logs for this feed" });
      return;
    }

    // Build filters.
    const filters: LogFilters = {
      uri,
      action: (url.searchParams.get("action") as ModAction) || undefined,
      performedBy: url.searchParams.get("performedBy") || undefined,
      targetUser: url.searchParams.get("targetUser") || undefined,
      targetPost: url.searchParams.get("targetPost") || undefined,
      sortBy: (url.searchParams.get("sortBy") || "descending") as
        | "ascending"
        | "descending",
      dateRange:
        url.searchParams.has("fromDate") && url.searchParams.has("toDate")
          ? {
            fromDate: url.searchParams.get("fromDate")!,
            toDate: url.searchParams.get("toDate")!,
          }
          : undefined,
    };

    // Fetch logs.
    let logs = await getLogs(filters);

    // For moderators, filter logs to only show allowed actions and remove the performed_by field.
    if (role === "mod") {
      const allowedActions = [
        "user_unban",
        "user_ban",
        "post_delete",
        "post_restore",
      ];
      logs = logs.filter((log) => allowedActions.includes(log.action));
      // Create a new type that omits performed_by
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const filteredLogs = logs.map(({ performed_by_profile, ...rest }) => {
        return rest;
      });
      res.json({ logs: filteredLogs });
      return;
    }

    // Admins see all logs.
    res.json({ logs });
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
};
