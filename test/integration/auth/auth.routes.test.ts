import request from "supertest";
import app from "../../../src/app";
import { setupAuthMocks } from "../../mocks/auth.mocks";
import { mockUser } from "../../fixtures/user.fixtures";

jest.mock("../../../src/repos/oauth-client", () => ({
  BlueskyOAuthClient: {
    // For authorize, always return a fixed URL.

    authorize: jest.fn(async () => {
      return new URL("http://example.com");
    }),
    // For callback, expect URLSearchParams; return a valid session for valid params; otherwise, throw error.
    callback: jest.fn(async (params: URLSearchParams) => {
      const code = params.get("code");
      const state = params.get("state");
      if (code === "validCode" && state === "validState") {
        return { session: { sub: mockUser.did } };
      }
      throw new Error("Test error");
    }),
  },
}));

jest.mock("../../../src/repos/profile", () => ({
  getProfile: jest.fn(async () => {
    // If GET_PROFILE_FAIL is set, simulate failure by returning null.
    return process.env.GET_PROFILE_FAIL === "true" ? null : mockUser;
  }),
  saveProfile: jest.fn(async () => {
    // If SAVE_PROFILE_FAIL is set, simulate failure.
    return process.env.SAVE_PROFILE_FAIL === "true" ? false : true;
  }),
}));
setupAuthMocks();

jest.mock("../../../src/repos/atproto", () => ({
  AtprotoAgent: {
    // Return a fixed profile based on the actor.
    getProfile: jest.fn(async () => {
      return {
        success: true,
        data: mockUser,
      };
    }),
  },
  // Return a fixed set of feeds.
  getActorFeeds: jest.fn(async () => ({
    feeds: [
      { uri: "feed:1", displayName: "Feed One", creator: { did: "admin1" } },
    ],
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Auth Routes Integration", () => {
  describe("GET /auth/signin", () => {
    it("should return 400 when handle is missing", async () => {
      const res = await request(app).get("/auth/signin");
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Handle is required" });
    });

    it("should return an authorization URL when handle is provided", async () => {
      const res = await request(app)
        .get("/auth/signin")
        .query({ handle: mockUser.handle });
      expect(res.status).toBe(200);
      expect(typeof res.body.url).toBe("string");
      expect(res.body.url).toMatch(/^https?:\/\//);
    });
  });

  describe("GET /auth/callback", () => {
    beforeAll(() => {
      process.env.JWT_SECRET = "secret";
      process.env.CLIENT_URL = "http://client.com";
    });

    it("should process a valid callback and redirect with a token", async () => {
      const res = await request(app)
        .get("/auth/callback")
        .query({ code: "validCode", state: "validState" });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain(process.env.CLIENT_URL);
      expect(res.headers.location).toMatch(/token=.+/);
    });

    it("should redirect to login with an error on callback failure", async () => {
      // Suppress expected error logs
      const consoleErrorSpy = jest
        .spyOn(console, "error")

      const res = await request(app)
        .get("/auth/callback")
        .query({ code: "fail", state: "any" });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("/oauth/login");
      // Decode the error parameter for comparison.
      const url = new URL(res.headers.location);
      const errorParam = url.searchParams.get("error") || "";
      expect(decodeURIComponent(errorParam)).toMatch(/Test error/);

      consoleErrorSpy.mockRestore();
    });
  });

  describe("POST /auth/logout", () => {
    it("should clear the session token and return a success message", async () => {
      const res = await request(app).post("/auth/logout");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: "Logged out successfully",
      });
    });
  });
});

describe("Auth Routes Integration - Callback Failure Scenarios", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "secret";
    process.env.CLIENT_URL = "http://client.com";
  });
  let consoleErrorSpy: jest.SpyInstance;
  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error")
  });

  afterEach(() => {
    // Remove any failure flags after each test.
    delete process.env.SAVE_PROFILE_FAIL;
    delete process.env.GET_PROFILE_FAIL;
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it("should redirect to login if saving profile data fails", async () => {
    process.env.SAVE_PROFILE_FAIL = "true";

    const res = await request(app)
      .get("/auth/callback")
      .query({ code: "validCode", state: "validState" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/oauth/login");
    const url = new URL(res.headers.location);
    const errorParam = url.searchParams.get("error") || "";
    expect(decodeURIComponent(errorParam)).toMatch(
      /Failed to save profile data/,
    );
  });

  it("should redirect to login if complete profile is not retrieved", async () => {
    // Simulate getProfile failure.
    process.env.GET_PROFILE_FAIL = "true";

    const res = await request(app)
      .get("/auth/callback")
      .query({ code: "validCode", state: "validState" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/oauth/login");
    const url = new URL(res.headers.location);
    const errorParam = url.searchParams.get("error") || "";
    expect(decodeURIComponent(errorParam)).toMatch(
      /Failed to retrieve complete profile/,
    );
  });

  it("should redirect to login if JWT_SECRET is missing", async () => {
    // Ensure other steps succeed.
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    const res = await request(app)
      .get("/auth/callback")
      .query({ code: "validCode", state: "validState" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/oauth/login");
    const url = new URL(res.headers.location);
    const errorParam = url.searchParams.get("error") || "";
    expect(decodeURIComponent(errorParam)).toMatch(
      /Missing JWT_SECRET environment variable/,
    );

    process.env.JWT_SECRET = originalSecret;
  });
});
