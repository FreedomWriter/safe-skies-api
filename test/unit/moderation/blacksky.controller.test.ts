import { Request, Response } from "express";
import {
	createMockRequest,
	createMockResponse,
	mockStatus,
	mockJson,
} from "../../mocks/express.mock";

// Import ban controllers
import {
	banFromTvBlacksky,
	unbanFromTvBlacksky,
	searchBanFromTvBlacksky,
} from "../../../src/controllers/moderation.controller";

// Import mute controllers
import {
	muteUserHandler,
	unmuteUserHandler,
	checkMutedHandler,
	listMutedUsersHandler,
} from "../../../src/controllers/mute.controller";

// Import fixtures
import {
	mockUser,
	mockTargetUser,
} from "../../fixtures/user.fixtures";

// Mock repository modules
import * as moderation from "../../../src/repos/moderation";
import * as mute from "../../../src/repos/mute";
import * as permissions from "../../../src/repos/permissions";
import * as logs from "../../../src/repos/logs";
import * as atproto from "../../../src/repos/atproto";

// Add resolveHandleToDid to the existing atproto mock
jest.mock("../../../src/repos/atproto", () => ({
	...jest.requireActual("../../../src/repos/atproto"),
	resolveHandleToDid: jest.fn(),
	AtprotoAgent: {
		getProfile: jest.fn(async (params: { actor: string }) => {
			return {
				success: true,
				data: {
					did: params.actor,
					handle: "testHandle",
					displayName: "Test User",
				},
			};
		}),
	},
	getActorFeeds: jest.fn(async () => ({
		feeds: [
			{ uri: "feed:1", displayName: "Feed One", creator: { did: "admin1" } },
		],
	})),
	getFeedGenerator: jest.fn(async (feed: string) => {
		if (feed === "feed:1") {
			return {
				displayName: "BlueSky Feed One",
				description: "Updated Desc 1",
				did: "did:example:456",
			};
		} else if (feed === "feed:2") {
			return {
				displayName: "BlueSky Feed Two",
				description: "Updated Desc 2",
				did: "did:example:456",
			};
		}
		throw new Error("Feed not found");
	}),
}));

describe("Blacksky Controllers", () => {
	let req: Request;
	let res: Response;

	beforeEach(() => {
		jest.clearAllMocks();
		res = createMockResponse();

		// Default mocks
		jest.spyOn(permissions, "canPerformAction").mockResolvedValue(true);
		jest.spyOn(logs, "createModerationLog").mockResolvedValue(undefined);
		(atproto.resolveHandleToDid as jest.Mock).mockImplementation((actor: string) =>
			Promise.resolve(actor) // Return input as-is, simulating DID pass-through
		);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	describe("Ban Controllers", () => {
		describe("banFromTvBlacksky", () => {
			it("should ban a user successfully", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					body: { actor: mockTargetUser.did, reason: "spam", tags: ["offensive"] },
				});

				const mockResponse = new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
				jest.spyOn(moderation, "banUserFromTv").mockResolvedValue(mockResponse);

				await banFromTvBlacksky(req, res);

				expect(moderation.banUserFromTv).toHaveBeenCalledWith(
					mockTargetUser.did,
					"spam",
					["offensive"]
				);
				expect(logs.createModerationLog).toHaveBeenCalledWith({
					uri: "at://did:plc:w4xbfzo7kqfes5zb7r6qv3rw/app.bsky.feed.generator/blacksky",
					performed_by: mockUser.did,
					action: "user_ban",
					target_user_did: mockTargetUser.did,
					metadata: {
						reason: "spam",
						tags: ["offensive"],
						feedName: "Blacksky",
					},
				});
				expect(mockStatus).toHaveBeenCalledWith(200);
				expect(mockJson).toHaveBeenCalledWith({ success: true });
			});

			it("should return 401 if no user is authenticated", async () => {
				req = createMockRequest({
					user: undefined,
					body: { actor: mockTargetUser.did },
				});

				await banFromTvBlacksky(req, res);

				expect(mockStatus).toHaveBeenCalledWith(401);
				expect(mockJson).toHaveBeenCalledWith({
					error: "Unauthorized: No valid session",
				});
			});

			it("should return 400 if actor is missing", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					body: {},
				});

				await banFromTvBlacksky(req, res);

				expect(mockStatus).toHaveBeenCalledWith(400);
				expect(mockJson).toHaveBeenCalledWith({
					error: "Missing required field: actor",
				});
			});

			it("should return 403 if user lacks permissions", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					body: { actor: mockTargetUser.did },
				});

				jest.spyOn(permissions, "canPerformAction").mockResolvedValue(false);

				await banFromTvBlacksky(req, res);

				expect(mockStatus).toHaveBeenCalledWith(403);
				expect(mockJson).toHaveBeenCalledWith({
					error: "Insufficient permissions for Blacksky feed",
				});
			});

		});

		describe("unbanFromTvBlacksky", () => {
			it("should unban a user successfully", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					query: { actor: mockTargetUser.did },
				});

				const mockResponse = new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
				jest.spyOn(moderation, "unbanUserFromTv").mockResolvedValue(mockResponse);

				await unbanFromTvBlacksky(req, res);

				expect(moderation.unbanUserFromTv).toHaveBeenCalledWith(mockTargetUser.did);
				expect(logs.createModerationLog).toHaveBeenCalledWith({
					uri: "at://did:plc:w4xbfzo7kqfes5zb7r6qv3rw/app.bsky.feed.generator/blacksky",
					performed_by: mockUser.did,
					action: "user_unban",
					target_user_did: mockTargetUser.did,
					metadata: {
						feedName: "Blacksky",
					},
				});
				expect(mockStatus).toHaveBeenCalledWith(200);
				expect(mockJson).toHaveBeenCalledWith({ success: true });
			});

			it("should return 400 if actor query parameter is missing", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					query: {},
				});

				await unbanFromTvBlacksky(req, res);

				expect(mockStatus).toHaveBeenCalledWith(400);
				expect(mockJson).toHaveBeenCalledWith({
					error: "Missing or invalid query parameter: actor",
				});
			});
		});

		describe("searchBanFromTvBlacksky", () => {
			it("should search banned users successfully", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					query: { actor: mockTargetUser.did, limit: "10", offset: "0" },
				});

				const mockBannedUsers = [
					{
						did: mockTargetUser.did,
						reason: "spam",
						createdAt: "2023-01-01T00:00:00Z",
						tags: ["offensive"],
					},
				];
				jest.spyOn(moderation, "searchBannedUsersFromTv").mockResolvedValue(mockBannedUsers);

				await searchBanFromTvBlacksky(req, res);

				expect(moderation.searchBannedUsersFromTv).toHaveBeenCalledWith(
					mockTargetUser.did,
					undefined,
					10,
					0
				);
				expect(mockStatus).toHaveBeenCalledWith(200);
				expect(mockJson).toHaveBeenCalledWith({ bannedUsers: mockBannedUsers });
			});
		});
	});

	describe("Mute Controllers", () => {
		describe("muteUserHandler", () => {
			it("should mute a user successfully", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					body: { actor: mockTargetUser.did, reason: "spam", tags: ["offensive"] },
				});

				jest.spyOn(mute, "checkMuted").mockResolvedValue(false);
				jest.spyOn(mute, "muteUser").mockResolvedValue({ success: true });

				await muteUserHandler(req, res);

				expect(mute.checkMuted).toHaveBeenCalledWith(mockTargetUser.did);
				expect(mute.muteUser).toHaveBeenCalledWith(
					mockTargetUser.did,
					"spam",
					mockUser.did,
					["offensive"]
				);
				expect(logs.createModerationLog).toHaveBeenCalledWith({
					uri: process.env.MUTE_LIST_URI,
					performed_by: mockUser.did,
					action: "user_mute",
					target_user_did: mockTargetUser.did,
					metadata: {
						reason: "spam",
						tags: ["offensive"],
						feedName: "The Green List",
					},
				});
				expect(mockStatus).toHaveBeenCalledWith(200);
				expect(mockJson).toHaveBeenCalledWith({
					success: true,
					message: "User muted successfully",
					did: mockTargetUser.did,
				});
			});

			it("should return 409 if user is already muted", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					body: { actor: mockTargetUser.did },
				});

				jest.spyOn(mute, "checkMuted").mockResolvedValue(true);

				await muteUserHandler(req, res);

				expect(mockStatus).toHaveBeenCalledWith(409);
				expect(mockJson).toHaveBeenCalledWith({
					error: "User is already muted",
				});
			});

			it("should handle mute operation failure", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					body: { actor: mockTargetUser.did },
				});

				jest.spyOn(mute, "checkMuted").mockResolvedValue(false);
				jest.spyOn(mute, "muteUser").mockResolvedValue({
					success: false,
					error: "Database error",
				});

				await muteUserHandler(req, res);

				expect(mockStatus).toHaveBeenCalledWith(500);
				expect(mockJson).toHaveBeenCalledWith({
					error: "Database error",
				});
			});
		});

		describe("unmuteUserHandler", () => {
			it("should unmute a user successfully", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					query: { actor: mockTargetUser.did },
				});

				jest.spyOn(mute, "checkMuted").mockResolvedValue(true);
				jest.spyOn(mute, "unmuteUser").mockResolvedValue({ success: true });

				await unmuteUserHandler(req, res);

				expect(mute.checkMuted).toHaveBeenCalledWith(mockTargetUser.did);
				expect(mute.unmuteUser).toHaveBeenCalledWith(mockTargetUser.did);
				expect(mockStatus).toHaveBeenCalledWith(200);
				expect(mockJson).toHaveBeenCalledWith({
					success: true,
					message: "User unmuted successfully",
					did: mockTargetUser.did,
				});
			});

			it("should return 404 if user is not muted", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					query: { actor: mockTargetUser.did },
				});

				jest.spyOn(mute, "checkMuted").mockResolvedValue(false);

				await unmuteUserHandler(req, res);

				expect(mockStatus).toHaveBeenCalledWith(404);
				expect(mockJson).toHaveBeenCalledWith({
					error: "User is not currently muted",
				});
			});
		});

		describe("checkMutedHandler", () => {
			it("should check mute status successfully", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					query: { actor: mockTargetUser.did },
				});

				jest.spyOn(mute, "checkMuted").mockResolvedValue(true);

				await checkMutedHandler(req, res);

				expect(mute.checkMuted).toHaveBeenCalledWith(mockTargetUser.did);
				expect(mockStatus).toHaveBeenCalledWith(200);
				expect(mockJson).toHaveBeenCalledWith({
					muted: true,
					did: mockTargetUser.did,
				});
			});
		});

		describe("listMutedUsersHandler", () => {
			it("should list muted users successfully", async () => {
				req = createMockRequest({
					user: { did: mockUser.did, handle: mockUser.handle },
					query: { limit: "10", offset: "0" },
				});

				const mockMutedUsers = {
					users: [
						{
							did: mockTargetUser.did,
							reason: "spam",
							muted_at: new Date("2023-01-01"),
							muted_by: mockUser.did,
							last_synced_at: new Date("2023-01-01"),
							sync_status: "synced" as const,
							tags: ["offensive"],
							record_key: "abc123",
						},
					],
					total: 1,
				};
				jest.spyOn(mute, "getMutedUsers").mockResolvedValue(mockMutedUsers);

				await listMutedUsersHandler(req, res);

				expect(mute.getMutedUsers).toHaveBeenCalledWith({
					limit: 10,
					offset: 0,
				});
				expect(mockStatus).toHaveBeenCalledWith(200);
				expect(mockJson).toHaveBeenCalledWith({
					users: mockMutedUsers.users,
					total: 1,
					limit: 10,
					offset: 0,
				});
			});
		});
	});
});