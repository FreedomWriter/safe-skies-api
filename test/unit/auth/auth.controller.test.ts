import { mockBlueskyOAuthClient, setupAuthMocks } from "../../mocks/auth.mocks";

setupAuthMocks();

import {
  signin,
  logout,
  callback,
} from "../../../src/controllers/auth.controller";
import {
  createMockRequest,
  createMockResponse,
} from "../../mocks/express.mock";
import { mockUser } from "../../fixtures/user.fixtures";
import {
  mockOauthResponseParams,
  mockToken,
} from "../../fixtures/auth.fixtures";

describe("Auth Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe("signin", () => {
    it("should return 400 if handle is missing", async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await signin(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Handle is required" });
    });

    it("should call BlueskyOAuthClient.authorize and return the URL if handle is provided", async () => {
      const req = createMockRequest({ query: { handle: mockUser.handle } });
      const res = createMockResponse();
      const fakeUrl = new URL("http://example.com");

      mockBlueskyOAuthClient.authorize.mockResolvedValueOnce(fakeUrl);

      await signin(req, res);

      expect(mockBlueskyOAuthClient.authorize).toHaveBeenCalledWith(
        mockUser.handle,
      );
      expect(res.json).toHaveBeenCalledWith({ url: fakeUrl.toString() });
    });
  });

  describe("logout", () => {
    it("should clear the session_token cookie and return a success message", async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      process.env.NODE_ENV = "development";

      await logout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith("session_token", {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Logged out successfully",
      });
    });
  });

  describe("callback", () => {
    beforeEach(() => {
      process.env.JWT_SECRET = "secret";
      process.env.CLIENT_URL = "http://client.com";
    });

    it("should process a valid callback and redirect with a token", async () => {
      const req = createMockRequest({ query: mockOauthResponseParams });
      const res = createMockResponse();

      const fakeSession = { session: { sub: mockUser.did } };
      mockBlueskyOAuthClient.callback.mockResolvedValueOnce(fakeSession);

      await callback(req, res);

      expect(res.redirect).toHaveBeenCalled();
      const redirectUrl = (res.redirect as jest.Mock).mock.calls[0][0];
      expect(redirectUrl).toContain(process.env.CLIENT_URL);
      expect(redirectUrl).toContain(`token=${mockToken}`);
    });

    it("should redirect to login with error on failure", async () => {
      const req = createMockRequest({ query: mockOauthResponseParams });
      const res = createMockResponse();

      const consoleSpy = jest
        .spyOn(console, "error")

      mockBlueskyOAuthClient.callback.mockRejectedValueOnce(
        new Error("Test error"),
      );

      await callback(req, res);

      expect(res.redirect).toHaveBeenCalled();
      const redirectUrl = (res.redirect as jest.Mock).mock.calls[0][0];
      expect(redirectUrl).toContain("http://client.com/oauth/login");
      expect(redirectUrl).toContain(encodeURIComponent("Test error"));

      consoleSpy.mockRestore();
    });
  });
});
