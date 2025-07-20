import { Request, Response } from "express";
import {
  createMockRequest,
  createMockResponse,
} from "../../mocks/express.mock";

import {
  getReportOptions,
  getModerationServices,
  reportModerationEvents,
} from "../../../src/controllers/moderation.controller";

// Import fixtures
import {
  mockModerationServices,
  mockReportOptions,
  mockReport,
  mockReports,
} from "../../fixtures/moderation.fixtures";

// Import repository modules for mocking
import * as moderation from "../../../src/repos/moderation";
import * as permissions from "../../../src/repos/permissions";
import * as logs from "../../../src/repos/logs";
import { mockUser } from "../../fixtures/user.fixtures";

describe("Moderation Controller", () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createMockResponse();
  });

  describe("getReportOptions", () => {
    it("should return available report options", async () => {
      // Mock the repository function
      jest
        .spyOn(moderation, "fetchReportOptions")
        .mockResolvedValue(mockReportOptions);

      await getReportOptions(req, res);

      expect(moderation.fetchReportOptions).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ options: mockReportOptions });
    });

    it("should handle errors gracefully", async () => {
      // Mock an error response
      jest
        .spyOn(moderation, "fetchReportOptions")
        .mockRejectedValue(new Error("Database error"));
      jest.spyOn(console, "error")

      await getReportOptions(req, res);

      expect(console.error).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
  });

  describe("getModerationServices", () => {
    it("should return available moderation services for a feed", async () => {
      req = createMockRequest({
        user: { did: mockUser.did, handle: mockUser.handle },
        query: { uri: "feed:1" },
      });

      jest
        .spyOn(moderation, "fetchModerationServices")
        .mockResolvedValue(mockModerationServices);

      await getModerationServices(req, res);

      expect(moderation.fetchModerationServices).toHaveBeenCalledWith("feed:1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        services: mockModerationServices,
      });
    });

    it("should return 401 if no user is authenticated", async () => {
      req = createMockRequest({
        user: undefined,
        query: { uri: "feed:1" },
      });

      await getModerationServices(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Unauthorized: No valid session",
      });
    });

    it("should return 400 if no feed URI is provided", async () => {
      req = createMockRequest({
        user: { did: mockUser.did, handle: mockUser.handle },
        query: {},
      });

      await getModerationServices(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Uri is required" });
    });
  });

  describe("reportModerationEvents", () => {
    beforeEach(() => {
      // Set up the necessary mocks for the underlying functions
      jest.spyOn(permissions, "customServiceGate").mockResolvedValue(true);

      // Mock blacksky response with appropriate structure
      const blackskyResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      jest
        .spyOn(moderation, "reportToBlacksky")
        .mockResolvedValue(blackskyResponse);

      // Mock ozone response
      jest.spyOn(moderation, "reportToOzone").mockResolvedValue(undefined);

      jest.spyOn(logs, "createModerationLog").mockResolvedValue(undefined);
    });

    it("should process a single report", async () => {
      req = createMockRequest({
        user: { did: mockUser.did, handle: mockUser.handle },
        body: mockReport,
      });

      await reportModerationEvents(req, res);

      // Should wrap single report in array and process it
      expect(res.json).toHaveBeenCalled();
      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData).toHaveProperty("summary");
      expect(Array.isArray(responseData.summary)).toBe(true);
      expect(responseData.summary.length).toBe(1);
    });

    it("should process multiple reports", async () => {
      req = createMockRequest({
        user: { did: mockUser.did, handle: mockUser.handle },
        body: mockReports,
      });

      await reportModerationEvents(req, res);

      // Should process all reports
      expect(res.json).toHaveBeenCalled();
      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData).toHaveProperty("summary");
      expect(Array.isArray(responseData.summary)).toBe(true);
      expect(responseData.summary.length).toBe(mockReports.length);
    });

    it("should return 401 if no user is authenticated", async () => {
      req = createMockRequest({
        user: undefined,
        body: mockReport,
      });

      await reportModerationEvents(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Unauthorized: No valid session",
      });
    });

    it("should handle errors gracefully", async () => {
      req = createMockRequest({
        user: { did: mockUser.did, handle: mockUser.handle },
        body: mockReport,
      });

      // Force a global error in the process
      jest
        .spyOn(moderation, "reportToBlacksky")
        .mockRejectedValue(new Error("Unexpected error"));
      jest.spyOn(console, "error")

      await reportModerationEvents(req, res);

      // It should still return a response, not crash
      expect(res.json).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });
});
