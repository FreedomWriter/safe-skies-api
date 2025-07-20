import { db } from "../config/db";
import { ModAction } from "../lib/types/moderation";
import { ExistingPermission, UserRole } from "../lib/types/permission";
import { ModeratorData } from "../lib/types/user";
import {
  canPerformWithRole,
  computeAllowedServicesForFeed,
  getBulkProfileDetails,
  groupModeratorsByFeed,
} from "../lib/utils/permissions";
import { Feed } from "@atproto/api/dist/client/types/app/bsky/feed/describeFeedGenerator";
import { getModerationServicesConfig } from "./moderation";
import { GeneratorView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { createModerationLog } from "./logs";
import { AtprotoAgent } from "./atproto";

/**
 * Helper: Fetch the actor's feeds from the 'feed_permissions' table using Knex.
 */

export const getActorFeedPermissions = async (did: string) => {
  try {
    const feeds = await db("feed_permissions")
      .select({ name: "feed_name" }, "uri", "role", "admin_did")
      .where({ did });

    return { feeds };
  } catch (error) {
    console.error("Error fetching actor feeds:", error);
    return { feeds: [] };
  }
};

/**
 * Retrieves the current role for a user on a given feed.
 * Returns 'user' if no record is found.
 */
export async function getFeedRole(
  userDid: string,
  uri: string,
): Promise<UserRole> {
  try {
    const row = await db("feed_permissions")
      .select("role")
      .where({ did: userDid, uri })
      .first();
    return row ? row.role : "user";
  } catch (error) {
    console.error("Error in getFeedRole:", error);
    return "user";
  }
}

/* Checks whether a user (identified by userDid) can perform a specified action on a feed (uri).
 */
export async function canPerformAction(
  userDid: string,
  action: ModAction,
  uri: string | null,
): Promise<boolean> {
  if (!userDid || !uri) return false;
  const role = await getFeedRole(userDid, uri);
  return canPerformWithRole(role, action);
}

/**
 * Retrieves the current role for a user on a given feed.
 * Since roles are defined per feed, we query the feed_permissions table.
 */
export async function getUserRoleForFeed(
  userDid: string,
  uri: string,
): Promise<"admin" | "mod" | "user"> {
  try {
    const row = await db("feed_permissions")
      .select("role")
      .where({ did: userDid, uri })
      .first();
    return row ? row.role : "user";
  } catch (error) {
    console.error("Error in getUserRoleForFeed:", error);
    return "user";
  }
}
/**
 * Upserts a feed permission record for a target user.
 * It first checks whether the target user's profile exists (and creates one if necessary),
 * then upserts the record in the feed_permissions table, and finally logs the action. Next iteration will create the concept of an Invitation.
 * Needs front end support for onboarding with an invitation acception.
 */

export async function setFeedRole(
  targetUserDid: string,
  uri: string,
  role: UserRole,
  setByUserDid: string,
  feedName: string,
): Promise<boolean> {
  try {
    // 1. Check if the target user's profile exists.
    const atProtoUserData = await AtprotoAgent.getProfile({
      actor: targetUserDid,
    });

    // 2. Create or update the profile
    await db("profiles")
      .insert({
        did: targetUserDid,
        handle: atProtoUserData?.data.handle,
        avatar: atProtoUserData?.data.avatar,
        display_name: atProtoUserData?.data.displayName,
      })
      .onConflict("did")
      .merge({
        handle: atProtoUserData?.data.handle,
        avatar: atProtoUserData?.data.avatar,
        display_name: atProtoUserData?.data.displayName,
      });

    // 3. Determine allowed services.
    // Always include "ozone" by default.
    const allowedServices: string[] = ["ozone"];

    // Fetch the moderation services configuration.
    const servicesConfig = await getModerationServicesConfig();
    // For each custom service (other than ozone), check via customServiceGate.
    for (const service of servicesConfig) {
      if (service.value !== "ozone") {
        const allowed = await customServiceGate(service.value, uri);
        if (allowed) {
          allowedServices.push(service.value);
        }
      }
    }

    // 4. Upsert the feed permission record, including allowed_services.
    await db("feed_permissions")
      .insert({
        did: targetUserDid,
        uri,
        feed_name: feedName,
        role,
        created_by: setByUserDid,
        allowed_services: allowedServices,
        created_at: new Date().toISOString(),
        admin_did: setByUserDid,
      })
      .onConflict(["did", "uri"])
      .merge({
        feed_name: feedName,
        role,
        created_by: setByUserDid,
        allowed_services: allowedServices,
        created_at: new Date().toISOString(),
      });

    // 5. Create a moderation log entry.
    const action: ModAction = role === "mod" ? "mod_promote" : "mod_demote";
    await createModerationLog({
      uri,
      performed_by: setByUserDid,
      action,
      target_user_did: targetUserDid,
      metadata: { role, feed_name: feedName, allowedServices },
    });

    return true;
  } catch (error) {
    console.error("Error in setFeedRole:", error);
    return false;
  }
}
/**
 * Retrieves moderator profiles for each feed provided.
 * For each feed:
 *   - Queries the feed_permissions table for records with role = 'mod'
 *   - Groups permissions by feed URI using groupModeratorsByFeed
 *   - Uses getBulkProfileDetails to fetch full profile details for each moderator
 *   - Maps each moderator into an object matching ModeratorData:
 *         { did, uri, feed_name, role, profiles }
 *
 * @param feeds An array of Feed objects.
 * @returns A Promise that resolves to an array of objects { feed, moderators }.
 */

export async function fetchFeedModsWithProfiles(
  feeds: Feed[],
): Promise<{ feed: Feed; moderators: ModeratorData[] }[]> {
  if (!feeds.length) return [];
  try {
    const feedUris = feeds.map((feed) => feed.uri);
    // Query for permissions with role 'mod' on the specified feeds.
    const permissions = await db("feed_permissions")
      .select("uri", "did as user_did", "feed_name", "role", "admin_did")
      .whereIn("uri", feedUris)
      .andWhere({ role: "mod" });
    if (!permissions.length) {
      return feeds.map((feed) => ({ feed, moderators: [] }));
    }
    // Group permissions by feed URI.
    const moderatorsByFeedUri = groupModeratorsByFeed(permissions);
    // For each feed, fetch moderator profile details and map to ModeratorData.
    const results = await Promise.all(
      feeds.map(async (feed) => {
        const feedPermissions = moderatorsByFeedUri[feed.uri] || [];
        const userDids = feedPermissions.map((mod) => mod.user_did);
        const profiles = await getBulkProfileDetails(userDids);
        // Map each fetched profile into a ModeratorData object.
        const moderators: ModeratorData[] = profiles.map((profile, index) => ({
          did: profile.did,
          uri: feedPermissions[index].uri,
          feed_name: feedPermissions[index].feed_name,
          role: feedPermissions[index].role,
          profile: profile,
        }));
        return { feed, moderators };
      }),
    );
    return results;
  } catch (error) {
    console.error("Error fetching moderators by feeds:", error);
    throw error;
  }
}

/**
 * Retrieves all moderator profiles for feeds where the acting admin has admin privileges.
 * Steps:
 *   1. Retrieve feed URIs from feed_permissions where the admin (adminDid) has role 'admin'.
 *   2. Query for permission records on those feeds (joined with profiles) where role is either 'mod' or 'admin'.
 *   3. Deduplicate the results by the profile DID and build ModeratorData objects.
 *
 * @param adminDid - The DID of the admin.
 * @returns A Promise that resolves to an array of ModeratorData.
 */
export async function fetchModsForAdminFeeds(
  adminDid: string,
): Promise<ModeratorData[]> {
  try {
    // Get feeds where the admin has admin role.
    const adminFeeds = await db("feed_permissions")
      .select("uri")
      .where({ did: adminDid, role: "admin" });
    if (!adminFeeds.length) return [];
    const feedUris = adminFeeds.map((feed) => feed.uri);

    const rows = await db("feed_permissions")
      .select(
        "feed_permissions.did as user_did",
        "feed_permissions.uri",
        "feed_permissions.feed_name",
        "feed_permissions.role",
        "p.did as profile_did",
        "p.handle",
        "p.display_name",
        "p.avatar",
      )
      .leftJoin("profiles as p", "feed_permissions.did", "p.did")
      .whereIn("feed_permissions.uri", feedUris)
      .andWhere(function () {
        this.where("feed_permissions.role", "mod").orWhere(
          "feed_permissions.role",
          "admin",
        );
      });
    if (!rows.length) return [];
    // Deduplicate moderator profiles and construct ModeratorData objects.
    const moderatorMap = new Map<string, ModeratorData>();
    for (const row of rows) {
      const key = row.profile_did;
      if (!key) continue;

      if (!moderatorMap.has(key)) {
        moderatorMap.set(key, {
          did: row.profile_did,
          uri: row.uri,
          feed_name: row.feed_name,
          role: row.role,
          profile: {
            did: row.profile_did,
            handle: row.handle,
            displayName: row.display_name,
            avatar: row.avatar,
          },
        });
      } else {
        const existing = moderatorMap.get(key)!;
        if (existing.role !== "admin" && row.role === "admin") {
          existing.role = "admin";
          existing.uri = row.uri;
          existing.feed_name = row.feed_name;
        }
      }
    }
    return Array.from(moderatorMap.values());
  } catch (error) {
    console.error("Error fetching moderators for admin:", error);
    throw error;
  }
}

/**
 * Checks if a given feed's URI allows a custom service.
 * For custom services, the feed's URI (which includes the creator’s DID)
 * must contain the service's admin_did.
 *
 * @param serviceValue - The service to check (e.g., 'blacksky').
 * @param feedUri - The feed URI from the feed_permissions table.
 * @returns true if the feed's URI includes the service's admin_did; false otherwise.
 */
export async function customServiceGate(
  serviceValue: string,
  feedUri: string,
): Promise<boolean> {
  try {
    const services = await getModerationServicesConfig();
    const service = services.find((s) => s.value === serviceValue);

    if (!service || !service.admin_did) {
      // If there’s no specific admin_did configured, default to allowing the service.
      return false;
    }

    // Check if the feed URI includes the service's admin_did.
    return feedUri.includes(service.admin_did);
  } catch (error) {
    console.error("Error in customServiceGate:", error);
    // In case of error, default to rejecting the service.
    return false;
  }
}

/**
 * Builds feed permission records for a user by merging feeds the user created
 * with any existing permission records.
 *
 * - Feeds in the createdFeeds array are marked with the 'admin' role.
 * - Feeds that exist only in existingPermissions retain their stored role.
 * - For every feed, allowed_services is computed using the moderation services config.
 *
 * @param userDid - The user's DID.
 * @param createdFeeds - Array of Feed objects representing feeds the user created.
 * @param existingPermissions - Array of existing permission records.
 * @returns An array of feed permission objects ready for upsert.
 */
export async function buildFeedPermissions(
  userDid: string,
  createdFeeds: GeneratorView[],
  existingPermissions: ExistingPermission[] = [],
): Promise<
  {
    did: string;
    uri: string;
    feed_name: string;
    role: UserRole;
    allowed_services: string[];
  }[]
> {
  // Build a Map keyed by feed URI.
  const permissionsMap = new Map<
    string,
    {
      did: string;
      uri: string;
      feed_name: string;
      role: UserRole;
      allowed_services: string[];
      admin_did: string;
    }
  >();

  // Fetch the moderation services configuration once.
  const servicesConfig = await getModerationServicesConfig();

  // Mark every feed returned from Atproto as 'admin'
  for (const feed of createdFeeds) {
    if (!feed.uri) continue;

    const feedName = feed.displayName || "Unnamed";
    const allowed_services = await computeAllowedServicesForFeed(
      feed.creator.did,
      servicesConfig,
    );
    permissionsMap.set(feed.uri, {
      did: userDid,
      uri: feed.uri,
      feed_name: feedName,
      role: "admin",
      allowed_services,
      admin_did: feed.creator.did,
    });
  }

  // Add any existing permission that is not already in the map.
  for (const perm of existingPermissions) {
    if (permissionsMap.has(perm.uri)) continue;
    const allowed_services = await computeAllowedServicesForFeed(
      perm.admin_did,
      servicesConfig,
    );
    // If an existing permission is 'admin', but the user didn't create the feed, override it to 'user'
    const role: UserRole = perm.role === "admin" ? "user" : perm.role;
    permissionsMap.set(perm.uri, {
      did: userDid,
      uri: perm.uri,
      feed_name: perm.feed_name,
      role,
      allowed_services,
      admin_did: perm.admin_did,
    });
  }

  return Array.from(permissionsMap.values());
}
