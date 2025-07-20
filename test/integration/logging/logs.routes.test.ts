import request from "supertest";
import app from "../../../src/app";
import { mockGetLogs, setupLogsMocks } from "../../mocks/logs.mocks";
import { mockLogEntries } from "../../fixtures/logs.fixtures";
import * as permissions from "../../../src/repos/permissions";
import jwt from "jsonwebtoken";
import { LogEntry } from "../../../src/lib/types/logs";
import {
  mockActingAdminUser,
  mockModUser,
  mockUser,
} from "../../fixtures/user.fixtures";

// Setup logs mocks
setupLogsMocks();

// Mock JWT verify directly - this is the most reliable approach
jest.mock("jsonwebtoken", () => {
  const original = jest.requireActual("jsonwebtoken");
  return {
    ...original,
    verify: jest.fn(),
  };
});

// Mock permissions
jest.mock("../../../src/repos/permissions");

describe("Logs Routes Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set default admin role for permissions
    (permissions.getUserRoleForFeed as jest.Mock).mockResolvedValue("admin");

    // Reset getLogs mock
    mockGetLogs.mockResolvedValue(mockLogEntries);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe("GET /logs", () => {
    it("should require authentication", async () => {
      // Make JWT verification fail
      (jwt.verify as jest.Mock).mockReturnValue(undefined);

      // Make the request
      const response = await request(app)
        .get("/api/logs")
        .set("Authorization", "Bearer invalid-token");

      // Should be unauthorized
      expect(response.status).toBe(401);
    });

    it("should return logs for authorized admins", async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockActingAdminUser);
      // Make the request with authentication
      const response = await request(app)
        .get("/api/logs")
        .query({ uri: "feed:1" })
        .set("Authorization", "Bearer valid-token");

      // Assert successful response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("logs");
    });

    it("should require uri parameter", async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockActingAdminUser);
      // Make request without uri parameter
      const response = await request(app)
        .get("/api/logs")
        .set("Authorization", "Bearer valid-token");

      // Should require uri parameter
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it.skip("should apply role-based filtering for mods", async () => {
      // Change mock to return mod user
      (jwt.verify as jest.Mock).mockReturnValue(mockModUser);

      // Set permissions to return 'mod' role
      (permissions.getUserRoleForFeed as jest.Mock).mockResolvedValue("mod");

      // Make the request
      const response = await request(app)
        .get("/api/logs")
        .query({ uri: "feed:1" })
        .set("Authorization", "Bearer valid-token");

      // Response should be successful
      expect(response.status).toBe(200);

      // For mods, performed_by_profile should be removed and only allowed actions returned
      const logs = response.body.logs;
      expect(logs.length).toBeGreaterThan(0);
      logs.forEach((log: LogEntry) => {
        expect(log).not.toHaveProperty("performed_by_profile");
        expect([
          "user_ban",
          "user_unban",
          "post_delete",
          "post_restore",
        ]).toContain(log.action);
      });
    });

    it("should reject regular users", async () => {
      // Change mock to return regular user
      (jwt.verify as jest.Mock).mockReturnValue(mockUser);

      // Set permissions to return 'user' role
      (permissions.getUserRoleForFeed as jest.Mock).mockResolvedValue("user");

      // Make the request
      const response = await request(app)
        .get("/api/logs")
        .query({ uri: "feed:1" })
        .set("Authorization", "Bearer valid-token");

      // Should be forbidden
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("error");
    });
  });
});
