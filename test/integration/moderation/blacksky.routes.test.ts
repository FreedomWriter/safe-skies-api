import request from "supertest";
import app from "../../../src/app";
import { mockUser, mockTargetUser } from "../../fixtures/user.fixtures";
import * as permissions from "../../../src/repos/permissions";
import * as moderation from "../../../src/repos/moderation";
import * as mute from "../../../src/repos/mute";
import * as logs from "../../../src/repos/logs";
import * as atproto from "../../../src/repos/atproto";
import jwt from "jsonwebtoken";

// Mock JWT verify directly
jest.mock("jsonwebtoken", () => {
	const original = jest.requireActual("jsonwebtoken");
	return {
		...original,
		verify: jest.fn(),
	};
});

// Mock all dependencies
jest.mock("../../../src/repos/permissions");
jest.mock("../../../src/repos/moderation");
jest.mock("../../../src/repos/mute");
jest.mock("../../../src/repos/logs");
jest.mock("../../../src/repos/atproto", () => ({
	resolveHandleToDid: jest.fn(),
	AtprotoAgent: {
		getProfile: jest.fn(),
	},
	getActorFeeds: jest.fn(),
	getFeedGenerator: jest.fn(),
	getAuthenticatedAtprotoAgent: jest.fn(),
}));

describe("Blacksky Routes Integration", () => {
	beforeEach(() => {
		jest.clearAllMocks();

		// Set default successful auth
		(jwt.verify as jest.Mock).mockReturnValue(mockUser);

		// Set default permission checks to pass
		(permissions.canPerformAction as jest.Mock).mockResolvedValue(true);

		// Mock DID resolution
		(atproto.resolveHandleToDid as jest.Mock).mockResolvedValue(mockTargetUser.did);

		// Mock logging
		(logs.createModerationLog as jest.Mock).mockResolvedValue(undefined);
	});

	afterEach(() => {
		jest.resetAllMocks();
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	describe("Authentication", () => {
		it("should require authentication for all endpoints", async () => {
			// Make JWT verification fail
			(jwt.verify as jest.Mock).mockReturnValue(undefined);

			const endpoints = [
				{ method: "post", path: "/api/moderation/user/ban", body: { actor: "test.handle" } },
				{ method: "delete", path: "/api/moderation/user/ban?actor=test.handle" },
				{ method: "get", path: "/api/moderation/user/ban" },
				{ method: "post", path: "/api/moderation/user/mute", body: { actor: "test.handle" } },
				{ method: "delete", path: "/api/moderation/user/mute?actor=test.handle" },
				{ method: "get", path: "/api/moderation/user/mute/check?actor=test.handle" },
				{ method: "get", path: "/api/moderation/user/mute" },
			];

			for (const endpoint of endpoints) {
				let response;
				if (endpoint.method === "post") {
					response = await request(app)
						.post(endpoint.path)
						.send(endpoint.body || {})
						.set("Authorization", "Bearer invalid-token");
				} else if (endpoint.method === "delete") {
					response = await request(app)
						.delete(endpoint.path)
						.set("Authorization", "Bearer invalid-token");
				} else {
					response = await request(app)
						.get(endpoint.path)
						.set("Authorization", "Bearer invalid-token");
				}

				expect(response.status).toBe(401);
				expect(response.body).toHaveProperty("error", "Unauthorized: No valid session");
			}
		});

		it("should require permissions for all endpoints", async () => {
			// Set permissions to fail
			(permissions.canPerformAction as jest.Mock).mockResolvedValue(false);

			const endpoints = [
				{ method: "post", path: "/api/moderation/user/ban", body: { actor: "test.handle" } },
				{ method: "delete", path: "/api/moderation/user/ban?actor=test.handle" },
				{ method: "get", path: "/api/moderation/user/ban" },
				{ method: "post", path: "/api/moderation/user/mute", body: { actor: "test.handle" } },
				{ method: "delete", path: "/api/moderation/user/mute?actor=test.handle" },
				{ method: "get", path: "/api/moderation/user/mute/check?actor=test.handle" },
				{ method: "get", path: "/api/moderation/user/mute" },
			];

			for (const endpoint of endpoints) {
				let response;
				if (endpoint.method === "post") {
					response = await request(app)
						.post(endpoint.path)
						.send(endpoint.body || {})
						.set("Authorization", "Bearer valid-token");
				} else if (endpoint.method === "delete") {
					response = await request(app)
						.delete(endpoint.path)
						.set("Authorization", "Bearer valid-token");
				} else {
					response = await request(app)
						.get(endpoint.path)
						.set("Authorization", "Bearer valid-token");
				}

				expect(response.status).toBe(403);
				expect(response.body).toHaveProperty("error", "Insufficient permissions for Blacksky feed");
			}
		});
	});

	describe("Ban Routes", () => {
		describe("POST /api/moderation/user/ban", () => {
			it("should ban a user successfully", async () => {
				const mockResponse = new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
				(moderation.banUserFromTv as jest.Mock).mockResolvedValue(mockResponse);

				const response = await request(app)
					.post("/api/moderation/user/ban")
					.send({
						actor: mockTargetUser.handle,
						reason: "spam",
						tags: ["offensive"],
					})
					.set("Authorization", "Bearer valid-token");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({ success: true });
				expect(moderation.banUserFromTv).toHaveBeenCalledWith(
					mockTargetUser.did,
					"spam",
					["offensive"]
				);
				expect(logs.createModerationLog).toHaveBeenCalled();
			});

			it("should return 400 if actor is missing", async () => {
				const response = await request(app)
					.post("/api/moderation/user/ban")
					.send({})
					.set("Authorization", "Bearer valid-token");

				expect(response.status).toBe(400);
				expect(response.body).toHaveProperty("error", "Missing required field: actor");
			});
		});

		describe("DELETE /api/moderation/user/ban", () => {
			it("should unban a user successfully", async () => {
				const mockResponse = new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
				(moderation.unbanUserFromTv as jest.Mock).mockResolvedValue(mockResponse);

				const response = await request(app)
					.delete(`/api/moderation/user/ban?actor=${mockTargetUser.handle}`)
					.set("Authorization", "Bearer valid-token");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({ success: true });
				expect(moderation.unbanUserFromTv).toHaveBeenCalledWith(mockTargetUser.did);
			});
		});

		describe("GET /api/moderation/user/ban", () => {
			it("should search banned users successfully", async () => {
				const mockBannedUsers = [
					{
						did: mockTargetUser.did,
						reason: "spam",
						createdAt: "2023-01-01T00:00:00Z",
						tags: ["offensive"],
					},
				];
				(moderation.searchBannedUsersFromTv as jest.Mock).mockResolvedValue(mockBannedUsers);

				const response = await request(app)
					.get(`/api/moderation/user/ban?actor=${mockTargetUser.handle}&limit=10`)
					.set("Authorization", "Bearer valid-token");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({ bannedUsers: mockBannedUsers });
				expect(moderation.searchBannedUsersFromTv).toHaveBeenCalledWith(
					mockTargetUser.did,
					undefined,
					10,
					undefined
				);
			});
		});
	});

	describe("Mute Routes", () => {
		describe("POST /api/moderation/user/mute", () => {
			it("should mute a user successfully", async () => {
				(mute.checkMuted as jest.Mock).mockResolvedValue(false);
				(mute.muteUser as jest.Mock).mockResolvedValue({ success: true });

				const response = await request(app)
					.post("/api/moderation/user/mute")
					.send({
						actor: mockTargetUser.handle,
						reason: "spam",
						tags: ["offensive"],
					})
					.set("Authorization", "Bearer valid-token");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					success: true,
					message: "User muted successfully",
					did: mockTargetUser.did,
				});
				expect(mute.checkMuted).toHaveBeenCalledWith(mockTargetUser.did);
				expect(mute.muteUser).toHaveBeenCalledWith(
					mockTargetUser.did,
					"spam",
					mockUser.did,
					["offensive"]
				);
			});

			it("should return 409 if user is already muted", async () => {
				(mute.checkMuted as jest.Mock).mockResolvedValue(true);

				const response = await request(app)
					.post("/api/moderation/user/mute")
					.send({ actor: mockTargetUser.handle })
					.set("Authorization", "Bearer valid-token");

				expect(response.status).toBe(409);
				expect(response.body).toHaveProperty("error", "User is already muted");
			});
		});

		describe("DELETE /api/moderation/user/mute", () => {
			it("should unmute a user successfully", async () => {
				(mute.checkMuted as jest.Mock).mockResolvedValue(true);
				(mute.unmuteUser as jest.Mock).mockResolvedValue({ success: true });

				const response = await request(app)
					.delete(`/api/moderation/user/mute?actor=${mockTargetUser.handle}`)
					.set("Authorization", "Bearer valid-token");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					success: true,
					message: "User unmuted successfully",
					did: mockTargetUser.did,
				});
				expect(mute.unmuteUser).toHaveBeenCalledWith(mockTargetUser.did);
			});

			it("should return 404 if user is not muted", async () => {
				(mute.checkMuted as jest.Mock).mockResolvedValue(false);

				const response = await request(app)
					.delete(`/api/moderation/user/mute?actor=${mockTargetUser.handle}`)
					.set("Authorization", "Bearer valid-token");

				expect(response.status).toBe(404);
				expect(response.body).toHaveProperty("error", "User is not currently muted");
			});
		});

		describe("GET /api/moderation/user/mute/check", () => {
			it("should check mute status successfully", async () => {
				(mute.checkMuted as jest.Mock).mockResolvedValue(true);

				const response = await request(app)
					.get(`/api/moderation/user/mute/check?actor=${mockTargetUser.handle}`)
					.set("Authorization", "Bearer valid-token");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					muted: true,
					did: mockTargetUser.did,
				});
				expect(mute.checkMuted).toHaveBeenCalledWith(mockTargetUser.did);
			});
		});

		describe("GET /api/moderation/user/mute", () => {
			it("should list muted users successfully", async () => {
				const mockMutedUsers = {
					users: [
						{
							did: mockTargetUser.did,
							reason: "spam",
							muted_at: "2023-01-01T00:00:00.000Z",
							muted_by: mockUser.did,
							last_synced_at: "2023-01-01T00:00:00.000Z",
							sync_status: "synced",
							tags: ["offensive"],
							record_key: "abc123",
						},
					],
					total: 1,
				};
				(mute.getMutedUsers as jest.Mock).mockResolvedValue(mockMutedUsers);

				const response = await request(app)
					.get("/api/moderation/user/mute?limit=10&offset=0")
					.set("Authorization", "Bearer valid-token");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					users: mockMutedUsers.users,
					total: 1,
					limit: 10,
					offset: 0,
				});
				expect(mute.getMutedUsers).toHaveBeenCalledWith({
					limit: 10,
					offset: 0,
				});
			});
		});
	});

	describe("Error Handling", () => {
		it("should handle DID resolution errors", async () => {
			(atproto.resolveHandleToDid as jest.Mock).mockRejectedValue(
				new Error("Handle not found")
			);

			const response = await request(app)
				.post("/api/moderation/user/ban")
				.send({ actor: "invalid.handle" })
				.set("Authorization", "Bearer valid-token");

			expect(response.status).toBe(400);
			expect(response.body).toHaveProperty(
				"error",
				"Failed to resolve actor to DID: Handle not found"
			);
		});

		it("should handle repository errors gracefully", async () => {
			(moderation.banUserFromTv as jest.Mock).mockRejectedValue(
				new Error("External API error")
			);

			const response = await request(app)
				.post("/api/moderation/user/ban")
				.send({ actor: mockTargetUser.handle })
				.set("Authorization", "Bearer valid-token");

			expect(response.status).toBe(500);
			expect(response.body).toHaveProperty("error", "Internal server error");
		});
	});
});