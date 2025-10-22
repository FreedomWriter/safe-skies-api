jest.mock("../../src/repos/permissions", () => ({
	customServiceGate: jest.fn(),
	canPerformAction: jest.fn(),
}));

jest.mock("../../src/repos/moderation", () => ({
	fetchReportOptions: jest.fn(),
	fetchModerationServices: jest.fn(),
	reportToBlacksky: jest.fn(),
	reportToOzone: jest.fn(),
}));

jest.mock("../../src/repos/logs", () => ({
	createModerationLog: jest.fn(),
}));

// Import the actual functions so we can cast them as mocks.
import { customServiceGate, canPerformAction } from "../../src/repos/permissions";
import { reportToBlacksky, reportToOzone } from "../../src/repos/moderation";
import { createModerationLog } from "../../src/repos/logs";

// Export the mocks for use in tests.
export const mockedCustomServiceGate = customServiceGate as jest.Mock;
export const mockedCanPerformAction = canPerformAction as jest.Mock;
export const mockedReportToBlacksky = reportToBlacksky as jest.Mock;
export const mockedReportToOzone = reportToOzone as jest.Mock;
export const mockedCreateModerationLog = createModerationLog as jest.Mock;
