import { google, type sheets_v4 } from "googleapis";
import type { Sheet, Spreadsheet, ValueRange } from "../types.js";
import { BaseService } from "./base-service.js";

export interface SheetsReadOptions {
	range: string;
	majorDimension?: "ROWS" | "COLUMNS";
	valueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA";
}

export interface SheetsWriteOptions {
	range: string;
	values: unknown[][];
	valueInputOption?: "RAW" | "USER_ENTERED";
	majorDimension?: "ROWS" | "COLUMNS";
}

export interface SheetsAppendOptions {
	range: string;
	values: unknown[][];
	valueInputOption?: "RAW" | "USER_ENTERED";
	insertDataOption?: "OVERWRITE" | "INSERT_ROWS";
}

export class SheetsService extends BaseService {
	private sheetsClients: Map<string, sheets_v4.Sheets> = new Map();

	private getSheetsClient(email: string): sheets_v4.Sheets {
		if (!this.sheetsClients.has(email)) {
			const auth = this.getOAuth2Client(email);
			const sheets = google.sheets({ version: "v4", auth });
			this.sheetsClients.set(email, sheets);
		}
		return this.sheetsClients.get(email)!;
	}

	async create(email: string, title: string): Promise<Spreadsheet> {
		const sheets = this.getSheetsClient(email);

		const response = await sheets.spreadsheets.create({
			requestBody: {
				properties: { title },
			},
		});

		return this.mapSpreadsheet(response.data);
	}

	async get(email: string, spreadsheetId: string): Promise<Spreadsheet> {
		const sheets = this.getSheetsClient(email);

		const response = await sheets.spreadsheets.get({
			spreadsheetId,
		});

		return this.mapSpreadsheet(response.data);
	}

	async read(email: string, spreadsheetId: string, options: SheetsReadOptions): Promise<ValueRange> {
		const sheets = this.getSheetsClient(email);

		const response = await sheets.spreadsheets.values.get({
			spreadsheetId,
			range: options.range,
			majorDimension: options.majorDimension ?? "ROWS",
			valueRenderOption: options.valueRenderOption ?? "FORMATTED_VALUE",
		});

		return {
			range: response.data.range ?? options.range,
			majorDimension: (response.data.majorDimension as "ROWS" | "COLUMNS") ?? "ROWS",
			values: response.data.values ?? [],
		};
	}

	async readMultiple(email: string, spreadsheetId: string, ranges: string[]): Promise<ValueRange[]> {
		const sheets = this.getSheetsClient(email);

		const response = await sheets.spreadsheets.values.batchGet({
			spreadsheetId,
			ranges,
		});

		return (response.data.valueRanges ?? []).map((vr) => ({
			range: vr.range ?? "",
			majorDimension: (vr.majorDimension as "ROWS" | "COLUMNS") ?? "ROWS",
			values: vr.values ?? [],
		}));
	}

	async write(email: string, spreadsheetId: string, options: SheetsWriteOptions): Promise<number> {
		const sheets = this.getSheetsClient(email);

		const response = await sheets.spreadsheets.values.update({
			spreadsheetId,
			range: options.range,
			valueInputOption: options.valueInputOption ?? "USER_ENTERED",
			requestBody: {
				range: options.range,
				majorDimension: options.majorDimension ?? "ROWS",
				values: options.values,
			},
		});

		return response.data.updatedCells ?? 0;
	}

	async append(email: string, spreadsheetId: string, options: SheetsAppendOptions): Promise<number> {
		const sheets = this.getSheetsClient(email);

		const response = await sheets.spreadsheets.values.append({
			spreadsheetId,
			range: options.range,
			valueInputOption: options.valueInputOption ?? "USER_ENTERED",
			insertDataOption: options.insertDataOption ?? "INSERT_ROWS",
			requestBody: {
				values: options.values,
			},
		});

		return response.data.updates?.updatedCells ?? 0;
	}

	async clear(email: string, spreadsheetId: string, range: string): Promise<string> {
		const sheets = this.getSheetsClient(email);

		const response = await sheets.spreadsheets.values.clear({
			spreadsheetId,
			range,
		});

		return response.data.clearedRange ?? range;
	}

	async addSheet(email: string, spreadsheetId: string, title: string): Promise<Sheet> {
		const sheets = this.getSheetsClient(email);

		const response = await sheets.spreadsheets.batchUpdate({
			spreadsheetId,
			requestBody: {
				requests: [
					{
						addSheet: {
							properties: { title },
						},
					},
				],
			},
		});

		const addSheetReply = response.data.replies?.[0]?.addSheet;
		return {
			properties: {
				sheetId: addSheetReply?.properties?.sheetId ?? undefined,
				title: addSheetReply?.properties?.title ?? title,
				index: addSheetReply?.properties?.index ?? undefined,
			},
		};
	}

	async deleteSheet(email: string, spreadsheetId: string, sheetId: number): Promise<void> {
		const sheets = this.getSheetsClient(email);

		await sheets.spreadsheets.batchUpdate({
			spreadsheetId,
			requestBody: {
				requests: [
					{
						deleteSheet: { sheetId },
					},
				],
			},
		});
	}

	async renameSheet(email: string, spreadsheetId: string, sheetId: number, newTitle: string): Promise<void> {
		const sheets = this.getSheetsClient(email);

		await sheets.spreadsheets.batchUpdate({
			spreadsheetId,
			requestBody: {
				requests: [
					{
						updateSheetProperties: {
							properties: {
								sheetId,
								title: newTitle,
							},
							fields: "title",
						},
					},
				],
			},
		});
	}

	async getSheetByName(email: string, spreadsheetId: string, sheetName: string): Promise<Sheet | null> {
		const spreadsheet = await this.get(email, spreadsheetId);
		return spreadsheet.sheets?.find((s) => s.properties?.title === sheetName) ?? null;
	}

	async batchUpdate(
		email: string,
		spreadsheetId: string,
		requests: sheets_v4.Schema$Request[],
	): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
		const sheets = this.getSheetsClient(email);

		const response = await sheets.spreadsheets.batchUpdate({
			spreadsheetId,
			requestBody: { requests },
		});

		return response.data;
	}

	exportToCsv(values: unknown[][]): string {
		return values
			.map((row) =>
				row
					.map((cell) => {
						const str = String(cell ?? "");
						if (str.includes(",") || str.includes('"') || str.includes("\n")) {
							return `"${str.replace(/"/g, '""')}"`;
						}
						return str;
					})
					.join(","),
			)
			.join("\n");
	}

	parseCsv(csv: string): unknown[][] {
		const rows: unknown[][] = [];
		const lines = csv.split("\n");

		for (const line of lines) {
			if (line.trim() === "") continue;

			const row: unknown[] = [];
			let current = "";
			let inQuotes = false;

			for (let i = 0; i < line.length; i++) {
				const char = line[i];

				if (char === '"') {
					if (inQuotes && line[i + 1] === '"') {
						current += '"';
						i++;
					} else {
						inQuotes = !inQuotes;
					}
				} else if (char === "," && !inQuotes) {
					row.push(this.parseValue(current));
					current = "";
				} else {
					current += char;
				}
			}

			row.push(this.parseValue(current));
			rows.push(row);
		}

		return rows;
	}

	private parseValue(value: string): unknown {
		const trimmed = value.trim();

		if (trimmed === "") return "";

		const num = Number(trimmed);
		if (!Number.isNaN(num) && trimmed !== "") return num;

		if (trimmed.toLowerCase() === "true") return true;
		if (trimmed.toLowerCase() === "false") return false;

		return trimmed;
	}

	private mapSpreadsheet(data: sheets_v4.Schema$Spreadsheet): Spreadsheet {
		return {
			spreadsheetId: data.spreadsheetId ?? "",
			properties: data.properties
				? {
						title: data.properties.title ?? undefined,
						locale: data.properties.locale ?? undefined,
						timeZone: data.properties.timeZone ?? undefined,
					}
				: undefined,
			sheets: data.sheets?.map((s) => ({
				properties: s.properties
					? {
							sheetId: s.properties.sheetId ?? undefined,
							title: s.properties.title ?? undefined,
							index: s.properties.index ?? undefined,
						}
					: undefined,
			})),
		};
	}

	generateWebUrl(spreadsheetId: string, sheetId?: number): string {
		let url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
		if (sheetId !== undefined) {
			url += `#gid=${sheetId}`;
		}
		return url;
	}

	clearSheetsClientCache(email?: string): void {
		if (email) {
			this.sheetsClients.delete(email);
		} else {
			this.sheetsClients.clear();
		}
		this.clearClientCache(email);
	}
}
