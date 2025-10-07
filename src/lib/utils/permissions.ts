import { ProfileViewBasic } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { UserRole } from "../types/permission";
import { ModAction } from "../types/moderation";
import { getProfile } from "../../repos/profile";

/**
 * Computes the allowed services for a given feed URI using the moderation services config.
 * Always includes 'ozone' by default.
 *
 * @param feedUri - The feed URI from feed_permissions.
 * @param servicesConfig - Array of moderation service configuration objects.
 * @returns An array of allowed service values.
 */
export async function computeAllowedServicesForFeed(
	admin_did: string,
	servicesConfig: { value: string; admin_did?: string }[],
): Promise<string[]> {
	const allowed: string[] = ["ozone"]; // Ozone is always allowed.
	for (const service of servicesConfig) {
		if (service.value === "ozone") continue;
		if (service.admin_did === admin_did) {
			allowed.push(service.value);
		}
	}
	return allowed || ["ozone"];
}

export const groupModeratorsByFeed = (
	permissions: {
		uri: string;
		user_did: string;
		role: UserRole;
	}[],
) => {
	return permissions.reduce(
		(acc, perm) => {
			if (!acc[perm.uri]) {
				acc[perm.uri] = [];
			}
			acc[perm.uri].push(perm);
			return acc;
		},
		{} as Record<
			string,
			{
				uri: string;
				user_did: string;
				role: UserRole;
				feed_name?: string;
			}[]
		>,
	);
};

export const getBulkProfileDetails = async (
	userDids: string[],
): Promise<ProfileViewBasic[]> => {
	// Deduplicate DIDs
	const uniqueDids = [...new Set(userDids)];

	// Get all profiles in parallel
	const profiles = await Promise.all(uniqueDids.map((did) => getProfile(did)));

	// Map back to original order
	return userDids.map(
		(did) =>
			profiles.find((profile) => profile?.did === did) || { did, handle: did },
	);
};

/**
 * Determines if a user with a given role can perform the specified moderation action.
 */
export const canPerformWithRole = (
	role: UserRole,
	action: ModAction,
): boolean => {
	switch (action) {
		case "mod_promote":
		case "mod_demote":
			return role === "admin";
		case "user_unban":
		case "user_ban":
		case "user_mute":
		case "user_unmute":
		case "post_delete":
		case "post_restore":
			return role === "mod" || role === "admin";
		default:
			return false;
	}
};
