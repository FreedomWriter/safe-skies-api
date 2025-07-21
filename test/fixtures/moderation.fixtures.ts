import {
	Report,
	ModerationService,
	ModAction,
} from "../../src/lib/types/moderation";
import { ModeratorData } from "../../src/lib/types/user";

// Reusable sample configuration for moderation services.
export const mockServicesConfig: ModerationService[] = [
	{
		value: "ozone",
		label: "Ozone",
		feed_gen_endpoint: null,
		admin_did: "admin1",
	},
	{
		value: "custom",
		label: "Custom Service",
		feed_gen_endpoint: "http://example.com",
		admin_did: "admin2",
	},
	{
		value: "blacksky",
		label: "Blacksky",
		feed_gen_endpoint: "https://example.com/feed?creator=did:plc:w4xbfzo7kqfes5zb7r6qv3rw",
		admin_did: "did:plc:w4xbfzo7kqfes5zb7r6qv3rw",
	},
];

// Sample moderation services for testing
export const mockModerationServices: ModerationService[] = [
	{
		value: "blacksky",
		label: "Blacksky Moderation",
		feed_gen_endpoint: "http://example.com",
		admin_did: "admin1",
	},
	{
		value: "ozone",
		label: "Ozone Moderation",
		feed_gen_endpoint: null,
		admin_did: "admin2",
	},
];

// Sample report options for testing
export const mockReportOptions = [
	{ id: "spam", title: "Spam", description: "Spam", reason: "Spam" },
	{
		id: "harassment",
		title: "Harassment",
		description: "Harassment",
		reason: "Harassment",
	},
];

// Sample report for testing
export const mockReport: Report = {
	targetedPostUri: "at://did:example:post/123",
	reason: "spam",
	toServices: mockModerationServices,
	targetedUserDid: "did:example:target",
	uri: "feed:1",
	feedName: "Test Feed",
	additionalInfo: "Test info",
	action: "post_report" as ModAction,
	targetedPost: "Problematic post content",
	targetedProfile: "Target User",
};

// Sample reports array for multiple report testing
export const mockReports: Report[] = [
	{
		targetedPostUri: "at://did:example:post/123",
		reason: "spam",
		uri: "feed:1",
		toServices: [mockModerationServices[0]],
		targetedUserDid: "did:example:target",
		feedName: "Test Feed",
		additionalInfo: "",
		action: "post_report" as ModAction,
		targetedPost: "Post content 1",
		targetedProfile: "User profile 1",
	},
	{
		targetedPostUri: "at://did:example:post/456",
		reason: "harassment",
		uri: "feed:1",
		toServices: [mockModerationServices[1]],
		targetedUserDid: "did:example:target2",
		feedName: "Test Feed",
		additionalInfo: "",
		action: "post_report" as ModAction,
		targetedPost: "Post content 2",
		targetedProfile: "User profile 2",
	},
];
export const mockModeratorsList: ModeratorData[] = [
	{
		did: "mod1",
		role: "mod",
		uri: "feed:1",
		profile: {
			did: "mod1",
			handle: "@mod1",
		},
	},
	{
		did: "mod2",
		role: "mod",
		uri: "feed:1",
		profile: {
			did: "mod2",
			handle: "@mod2",
		},
	},
	{
		did: "mod3",
		role: "mod",
		uri: "feed:3",
		profile: {
			did: "mod3",
			handle: "@mod3",
		},
	},
];
