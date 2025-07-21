import { customServiceGate } from "../../../src/repos/permissions";
import { mockServicesConfig } from "../../fixtures/moderation.fixtures";

jest.mock("../../../src/repos/moderation", () => ({
  getModerationServicesConfig: jest.fn(),
}));

import { getModerationServicesConfig } from "../../../src/repos/moderation";

describe("customServiceGate using default mocks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getModerationServicesConfig as jest.Mock).mockResolvedValue(
      mockServicesConfig,
    );
  });

  it("should return false if service is not found in the configuration", async () => {
    // "notfound" is not in mockServicesConfig so it should return false
    const feedUri = "https://example.com/feed?creator=notfound";
    const result = await customServiceGate("notfound", feedUri);

    expect(result).toBe(false);
  });

  it('should return true if feedUri includes admin_did for the "blacksky" service', async () => {
    // In mockServicesConfig, the "blacksky" service has admin_did of "did:plc:w4xbfzo7kqfes5zb7r6qv3rw"
    const feedUri =
      "https://example.com/feed?creator=did:plc:w4xbfzo7kqfes5zb7r6qv3rw";
    const result = await customServiceGate("blacksky", feedUri);
    expect(result).toBe(true);
  });

  it('should return false if feedUri does not include admin_did for the "blacksky" service', async () => {
    const feedUri = "https://example.com/feed?creator=notblacksky";
    const result = await customServiceGate("blacksky", feedUri);
    expect(result).toBe(false);
  });

  it('should return true if feedUri includes admin_did for the "custom" service', async () => {
    // In mockServicesConfig, the "custom" service has admin_did of "admin2"
    const feedUri = "https://example.com/feed?creator=admin2";
    const result = await customServiceGate("custom", feedUri);
    expect(result).toBe(true);
  });

  it('should return false if feedUri does not include admin_did for the "custom" service', async () => {
    const feedUri = "https://example.com/feed?creator=completelydifferent";
    const result = await customServiceGate("custom", feedUri);
    expect(result).toBe(false);
  });
});

describe("customServiceGate with overridden configuration", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should return false if a matching service has no admin_did", async () => {
    // Override configuration: service exists but with no admin_did.
    jest.doMock("../../../src/repos/permissions", () => ({
      // Preserve customServiceGate from the actual module.
      ...jest.requireActual("../../../src/repos/permissions"),
      getModerationServicesConfig: jest
        .fn()
        .mockResolvedValue([
          { value: "blacksky", label: "Blacksky", admin_did: undefined },
        ]),
    }));
    // Re-import customServiceGate so that the new mock takes effect.
    const { customServiceGate } = await import(
      "../../../src/repos/permissions"
    );
    const result = await customServiceGate(
      "blacksky",
      "https://example.com/feed",
    );
    expect(result).toBe(false);
  });

  it("should return false if getModerationServicesConfig throws an error", async () => {
    jest.doMock("../../../src/repos/permissions", () => ({
      ...jest.requireActual("../../../src/repos/permissions"),
      getModerationServicesConfig: jest
        .fn()
        .mockRejectedValue(new Error("DB error")),
    }));
    const { customServiceGate } = await import(
      "../../../src/repos/permissions"
    );
    const result = await customServiceGate(
      "blacksky",
      "https://example.com/feed",
    );
    expect(result).toBe(false);
  });
});
