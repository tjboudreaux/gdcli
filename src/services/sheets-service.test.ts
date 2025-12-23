import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStorage } from "../account-storage.js";
import type { Account } from "../types.js";
import { SheetsService } from "./sheets-service.js";

const mockSheetsInstance = {
	spreadsheets: {
		create: vi.fn(),
		get: vi.fn(),
		batchUpdate: vi.fn(),
		values: {
			get: vi.fn(),
			batchGet: vi.fn(),
			update: vi.fn(),
			append: vi.fn(),
			clear: vi.fn(),
		},
	},
};

vi.mock("googleapis", () => ({
	google: {
		sheets: vi.fn(() => mockSheetsInstance),
	},
}));

describe("SheetsService", () => {
	let tempDir: string;
	let storage: AccountStorage;
	let service: SheetsService;

	const testAccount: Account = {
		email: "test@example.com",
		oauth2: {
			clientId: "test-client-id",
			clientSecret: "test-client-secret",
			refreshToken: "test-refresh-token",
		},
	};

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gdcli-test-"));
		storage = new AccountStorage(tempDir);
		storage.addAccount(testAccount);
		service = new SheetsService(storage);
		vi.clearAllMocks();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	describe("create", () => {
		it("should create a new spreadsheet", async () => {
			mockSheetsInstance.spreadsheets.create.mockResolvedValue({
				data: {
					spreadsheetId: "sheet-123",
					properties: { title: "New Spreadsheet" },
				},
			});

			const result = await service.create("test@example.com", "New Spreadsheet");

			expect(result.spreadsheetId).toBe("sheet-123");
			expect(result.properties?.title).toBe("New Spreadsheet");
		});
	});

	describe("get", () => {
		it("should get spreadsheet by id", async () => {
			mockSheetsInstance.spreadsheets.get.mockResolvedValue({
				data: {
					spreadsheetId: "sheet-123",
					properties: { title: "My Sheet", locale: "en_US", timeZone: "America/New_York" },
					sheets: [
						{ properties: { sheetId: 0, title: "Sheet1", index: 0 } },
						{ properties: { sheetId: 1, title: "Sheet2", index: 1 } },
					],
				},
			});

			const result = await service.get("test@example.com", "sheet-123");

			expect(result.spreadsheetId).toBe("sheet-123");
			expect(result.sheets).toHaveLength(2);
			expect(result.sheets?.[0].properties?.title).toBe("Sheet1");
		});
	});

	describe("read", () => {
		it("should read values from range", async () => {
			mockSheetsInstance.spreadsheets.values.get.mockResolvedValue({
				data: {
					range: "Sheet1!A1:B2",
					majorDimension: "ROWS",
					values: [
						["A1", "B1"],
						["A2", "B2"],
					],
				},
			});

			const result = await service.read("test@example.com", "sheet-123", {
				range: "Sheet1!A1:B2",
			});

			expect(result.values).toEqual([
				["A1", "B1"],
				["A2", "B2"],
			]);
		});

		it("should handle empty range", async () => {
			mockSheetsInstance.spreadsheets.values.get.mockResolvedValue({
				data: { range: "Sheet1!A1:B2" },
			});

			const result = await service.read("test@example.com", "sheet-123", {
				range: "Sheet1!A1:B2",
			});

			expect(result.values).toEqual([]);
		});
	});

	describe("readMultiple", () => {
		it("should read multiple ranges", async () => {
			mockSheetsInstance.spreadsheets.values.batchGet.mockResolvedValue({
				data: {
					valueRanges: [
						{ range: "Sheet1!A1:A2", values: [["A1"], ["A2"]] },
						{ range: "Sheet1!B1:B2", values: [["B1"], ["B2"]] },
					],
				},
			});

			const result = await service.readMultiple("test@example.com", "sheet-123", ["Sheet1!A1:A2", "Sheet1!B1:B2"]);

			expect(result).toHaveLength(2);
			expect(result[0].values).toEqual([["A1"], ["A2"]]);
		});

		it("should handle empty response", async () => {
			mockSheetsInstance.spreadsheets.values.batchGet.mockResolvedValue({
				data: {},
			});

			const result = await service.readMultiple("test@example.com", "sheet-123", ["A1:A2"]);

			expect(result).toEqual([]);
		});
	});

	describe("write", () => {
		it("should write values to range", async () => {
			mockSheetsInstance.spreadsheets.values.update.mockResolvedValue({
				data: { updatedCells: 4 },
			});

			const result = await service.write("test@example.com", "sheet-123", {
				range: "Sheet1!A1:B2",
				values: [
					["New A1", "New B1"],
					["New A2", "New B2"],
				],
			});

			expect(result).toBe(4);
			expect(mockSheetsInstance.spreadsheets.values.update).toHaveBeenCalledWith(
				expect.objectContaining({
					spreadsheetId: "sheet-123",
					range: "Sheet1!A1:B2",
					valueInputOption: "USER_ENTERED",
				}),
			);
		});

		it("should use RAW input option when specified", async () => {
			mockSheetsInstance.spreadsheets.values.update.mockResolvedValue({
				data: { updatedCells: 1 },
			});

			await service.write("test@example.com", "sheet-123", {
				range: "A1",
				values: [["=SUM(A1:A10)"]],
				valueInputOption: "RAW",
			});

			expect(mockSheetsInstance.spreadsheets.values.update).toHaveBeenCalledWith(
				expect.objectContaining({
					valueInputOption: "RAW",
				}),
			);
		});
	});

	describe("append", () => {
		it("should append values to range", async () => {
			mockSheetsInstance.spreadsheets.values.append.mockResolvedValue({
				data: { updates: { updatedCells: 2 } },
			});

			const result = await service.append("test@example.com", "sheet-123", {
				range: "Sheet1!A:A",
				values: [["New Row"]],
			});

			expect(result).toBe(2);
		});

		it("should handle missing updates in response", async () => {
			mockSheetsInstance.spreadsheets.values.append.mockResolvedValue({
				data: {},
			});

			const result = await service.append("test@example.com", "sheet-123", {
				range: "A:A",
				values: [["data"]],
			});

			expect(result).toBe(0);
		});
	});

	describe("clear", () => {
		it("should clear range", async () => {
			mockSheetsInstance.spreadsheets.values.clear.mockResolvedValue({
				data: { clearedRange: "Sheet1!A1:B10" },
			});

			const result = await service.clear("test@example.com", "sheet-123", "Sheet1!A1:B10");

			expect(result).toBe("Sheet1!A1:B10");
		});
	});

	describe("addSheet", () => {
		it("should add new sheet", async () => {
			mockSheetsInstance.spreadsheets.batchUpdate.mockResolvedValue({
				data: {
					replies: [
						{
							addSheet: {
								properties: { sheetId: 123, title: "New Sheet", index: 1 },
							},
						},
					],
				},
			});

			const result = await service.addSheet("test@example.com", "sheet-123", "New Sheet");

			expect(result.properties?.sheetId).toBe(123);
			expect(result.properties?.title).toBe("New Sheet");
		});

		it("should handle missing reply", async () => {
			mockSheetsInstance.spreadsheets.batchUpdate.mockResolvedValue({
				data: { replies: [{}] },
			});

			const result = await service.addSheet("test@example.com", "sheet-123", "New Sheet");

			expect(result.properties?.title).toBe("New Sheet");
		});
	});

	describe("deleteSheet", () => {
		it("should delete sheet", async () => {
			mockSheetsInstance.spreadsheets.batchUpdate.mockResolvedValue({ data: {} });

			await service.deleteSheet("test@example.com", "sheet-123", 456);

			expect(mockSheetsInstance.spreadsheets.batchUpdate).toHaveBeenCalledWith({
				spreadsheetId: "sheet-123",
				requestBody: {
					requests: [{ deleteSheet: { sheetId: 456 } }],
				},
			});
		});
	});

	describe("renameSheet", () => {
		it("should rename sheet", async () => {
			mockSheetsInstance.spreadsheets.batchUpdate.mockResolvedValue({ data: {} });

			await service.renameSheet("test@example.com", "sheet-123", 456, "Renamed Sheet");

			expect(mockSheetsInstance.spreadsheets.batchUpdate).toHaveBeenCalledWith({
				spreadsheetId: "sheet-123",
				requestBody: {
					requests: [
						{
							updateSheetProperties: {
								properties: { sheetId: 456, title: "Renamed Sheet" },
								fields: "title",
							},
						},
					],
				},
			});
		});
	});

	describe("getSheetByName", () => {
		it("should find sheet by name", async () => {
			mockSheetsInstance.spreadsheets.get.mockResolvedValue({
				data: {
					spreadsheetId: "sheet-123",
					sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }, { properties: { sheetId: 1, title: "Data" } }],
				},
			});

			const result = await service.getSheetByName("test@example.com", "sheet-123", "Data");

			expect(result?.properties?.sheetId).toBe(1);
		});

		it("should return null when sheet not found", async () => {
			mockSheetsInstance.spreadsheets.get.mockResolvedValue({
				data: {
					spreadsheetId: "sheet-123",
					sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
				},
			});

			const result = await service.getSheetByName("test@example.com", "sheet-123", "NotFound");

			expect(result).toBeNull();
		});
	});

	describe("batchUpdate", () => {
		it("should execute batch update", async () => {
			mockSheetsInstance.spreadsheets.batchUpdate.mockResolvedValue({
				data: { spreadsheetId: "sheet-123", replies: [] },
			});

			const requests = [{ deleteSheet: { sheetId: 1 } }];

			const result = await service.batchUpdate("test@example.com", "sheet-123", requests);

			expect(result.spreadsheetId).toBe("sheet-123");
		});
	});

	describe("exportToCsv", () => {
		it("should convert values to CSV", () => {
			const values = [
				["Name", "Age", "City"],
				["Alice", 30, "NYC"],
				["Bob", 25, "LA"],
			];

			const csv = service.exportToCsv(values);

			expect(csv).toBe("Name,Age,City\nAlice,30,NYC\nBob,25,LA");
		});

		it("should quote values with commas", () => {
			const values = [["Hello, World", "Test"]];

			const csv = service.exportToCsv(values);

			expect(csv).toBe('"Hello, World",Test');
		});

		it("should escape quotes in values", () => {
			const values = [['Say "Hello"', "Test"]];

			const csv = service.exportToCsv(values);

			expect(csv).toBe('"Say ""Hello""",Test');
		});

		it("should handle values with newlines", () => {
			const values = [["Line1\nLine2", "Test"]];

			const csv = service.exportToCsv(values);

			expect(csv).toBe('"Line1\nLine2",Test');
		});

		it("should handle null and undefined values", () => {
			const values = [[null, undefined, "value"]];

			const csv = service.exportToCsv(values);

			expect(csv).toBe(",,value");
		});
	});

	describe("parseCsv", () => {
		it("should parse simple CSV", () => {
			const csv = "Name,Age,City\nAlice,30,NYC";

			const values = service.parseCsv(csv);

			expect(values).toEqual([
				["Name", "Age", "City"],
				["Alice", 30, "NYC"],
			]);
		});

		it("should parse quoted values", () => {
			const csv = '"Hello, World",Test';

			const values = service.parseCsv(csv);

			expect(values).toEqual([["Hello, World", "Test"]]);
		});

		it("should parse escaped quotes", () => {
			const csv = '"Say ""Hello""",Test';

			const values = service.parseCsv(csv);

			expect(values).toEqual([['Say "Hello"', "Test"]]);
		});

		it("should parse boolean values", () => {
			const csv = "true,false,TRUE,FALSE";

			const values = service.parseCsv(csv);

			expect(values).toEqual([[true, false, true, false]]);
		});

		it("should parse numeric values", () => {
			const csv = "1,2.5,-3,0";

			const values = service.parseCsv(csv);

			expect(values).toEqual([[1, 2.5, -3, 0]]);
		});

		it("should skip empty lines", () => {
			const csv = "a,b\n\nc,d";

			const values = service.parseCsv(csv);

			expect(values).toEqual([
				["a", "b"],
				["c", "d"],
			]);
		});

		it("should handle empty string values", () => {
			const csv = "a,,c";

			const values = service.parseCsv(csv);

			expect(values).toEqual([["a", "", "c"]]);
		});
	});

	describe("generateWebUrl", () => {
		it("should generate spreadsheet URL", () => {
			const url = service.generateWebUrl("sheet-123");
			expect(url).toBe("https://docs.google.com/spreadsheets/d/sheet-123/edit");
		});

		it("should generate spreadsheet URL with sheet ID", () => {
			const url = service.generateWebUrl("sheet-123", 456);
			expect(url).toBe("https://docs.google.com/spreadsheets/d/sheet-123/edit#gid=456");
		});
	});

	describe("clearSheetsClientCache", () => {
		it("should clear specific client", async () => {
			mockSheetsInstance.spreadsheets.get.mockResolvedValue({
				data: { spreadsheetId: "sheet-123" },
			});

			await service.get("test@example.com", "sheet-123");
			service.clearSheetsClientCache("test@example.com");

			expect(service["sheetsClients"].has("test@example.com")).toBe(false);
		});

		it("should clear all clients", async () => {
			mockSheetsInstance.spreadsheets.get.mockResolvedValue({
				data: { spreadsheetId: "sheet-123" },
			});

			await service.get("test@example.com", "sheet-123");
			service.clearSheetsClientCache();

			expect(service["sheetsClients"].size).toBe(0);
		});
	});
});
