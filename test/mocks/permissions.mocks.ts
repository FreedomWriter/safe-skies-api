import { mockServicesConfig } from "../fixtures/moderation.fixtures";

jest.mock("../../src/repos/moderation", () => ({
  getModerationServicesConfig: jest.fn(),
}));

import { getModerationServicesConfig } from "../../src/repos/moderation";

/**
 * Setup function to mock the moderation services module
 */
export const setupPermissionsMocks = (): void => {
  (getModerationServicesConfig as jest.Mock).mockResolvedValue(
    mockServicesConfig,
  );
};
