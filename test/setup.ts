// Stub external modules for integration tests.

jest.mock("../src/repos/atproto", () => ({
  AtprotoAgent: {
    // Return a fixed profile based on the actor.
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
  // Return a fixed set of feeds.
  getActorFeeds: jest.fn(async () => ({
    feeds: [
      { uri: "feed:1", displayName: "Feed One", creator: { did: "admin1" } },
    ],
  })),
  getFeedGenerator: jest.fn(async (feed: string) => {
    // Here you define responses based on the feed URI.
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
    // For any other feed, simulate a not found scenario.
    throw new Error("Feed not found");
  }),
}));

// Optionally, suppress known warnings.
jest.spyOn(console, "warn")
jest.spyOn(console, "error")

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  jest.restoreAllMocks();
});
