import { type docs_v1, google } from "googleapis";
import type { DocsDocument, DocsParagraph, DocsTable } from "../types.js";
import { BaseService } from "./base-service.js";

export interface DocsCreateOptions {
	title: string;
}

export interface DocsInsertTextOptions {
	index: number;
	text: string;
}

export interface DocsReplaceTextOptions {
	find: string;
	replace: string;
	matchCase?: boolean;
}

export interface DocsDeleteRangeOptions {
	startIndex: number;
	endIndex: number;
}

export class DocsService extends BaseService {
	private docsClients: Map<string, docs_v1.Docs> = new Map();

	private getDocsClient(email: string): docs_v1.Docs {
		if (!this.docsClients.has(email)) {
			const auth = this.getOAuth2Client(email);
			const docs = google.docs({ version: "v1", auth });
			this.docsClients.set(email, docs);
		}
		return this.docsClients.get(email)!;
	}

	async create(email: string, title: string): Promise<DocsDocument> {
		const docs = this.getDocsClient(email);

		const response = await docs.documents.create({
			requestBody: { title },
		});

		return this.mapDocument(response.data);
	}

	async get(email: string, documentId: string): Promise<DocsDocument> {
		const docs = this.getDocsClient(email);

		const response = await docs.documents.get({
			documentId,
		});

		return this.mapDocument(response.data);
	}

	async getContent(email: string, documentId: string): Promise<string> {
		const document = await this.get(email, documentId);
		return this.extractText(document);
	}

	async insertText(email: string, documentId: string, options: DocsInsertTextOptions): Promise<DocsDocument> {
		const docs = this.getDocsClient(email);

		await docs.documents.batchUpdate({
			documentId,
			requestBody: {
				requests: [
					{
						insertText: {
							location: { index: options.index },
							text: options.text,
						},
					},
				],
			},
		});

		return this.get(email, documentId);
	}

	async appendText(email: string, documentId: string, text: string): Promise<DocsDocument> {
		const docs = this.getDocsClient(email);
		const document = await this.get(email, documentId);

		const endIndex = this.getDocumentEndIndex(document);

		await docs.documents.batchUpdate({
			documentId,
			requestBody: {
				requests: [
					{
						insertText: {
							location: { index: endIndex },
							text,
						},
					},
				],
			},
		});

		return this.get(email, documentId);
	}

	async replaceText(email: string, documentId: string, options: DocsReplaceTextOptions): Promise<DocsDocument> {
		const docs = this.getDocsClient(email);

		await docs.documents.batchUpdate({
			documentId,
			requestBody: {
				requests: [
					{
						replaceAllText: {
							containsText: {
								text: options.find,
								matchCase: options.matchCase ?? true,
							},
							replaceText: options.replace,
						},
					},
				],
			},
		});

		return this.get(email, documentId);
	}

	async deleteRange(email: string, documentId: string, options: DocsDeleteRangeOptions): Promise<DocsDocument> {
		const docs = this.getDocsClient(email);

		await docs.documents.batchUpdate({
			documentId,
			requestBody: {
				requests: [
					{
						deleteContentRange: {
							range: {
								startIndex: options.startIndex,
								endIndex: options.endIndex,
							},
						},
					},
				],
			},
		});

		return this.get(email, documentId);
	}

	async batchUpdate(
		email: string,
		documentId: string,
		requests: docs_v1.Schema$Request[],
	): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
		const docs = this.getDocsClient(email);

		const response = await docs.documents.batchUpdate({
			documentId,
			requestBody: { requests },
		});

		return response.data;
	}

	extractText(document: DocsDocument): string {
		if (!document.body?.content) {
			return "";
		}

		const textParts: string[] = [];

		for (const element of document.body.content) {
			if (element.paragraph?.elements) {
				for (const elem of element.paragraph.elements) {
					if (elem.textRun?.content) {
						textParts.push(elem.textRun.content);
					}
				}
			}
			if (element.table?.tableRows) {
				for (const row of element.table.tableRows) {
					if (row.tableCells) {
						for (const cell of row.tableCells) {
							if (cell.content) {
								for (const cellElement of cell.content) {
									if (cellElement.paragraph?.elements) {
										for (const elem of cellElement.paragraph.elements) {
											if (elem.textRun?.content) {
												textParts.push(elem.textRun.content);
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}

		return textParts.join("");
	}

	extractMarkdown(document: DocsDocument): string {
		if (!document.body?.content) {
			return "";
		}

		const lines: string[] = [];

		for (const element of document.body.content) {
			if (element.paragraph) {
				const line = this.paragraphToMarkdown(element.paragraph);
				if (line !== null) {
					lines.push(line);
				}
			}
			if (element.table) {
				lines.push(this.tableToMarkdown(element.table));
			}
		}

		return lines.join("");
	}

	private paragraphToMarkdown(paragraph: DocsParagraph | undefined): string | null {
		if (!paragraph?.elements) {
			return "";
		}

		let text = "";
		for (const elem of paragraph.elements) {
			if (elem.textRun) {
				let content = elem.textRun.content ?? "";
				const style = elem.textRun.textStyle;

				if (style?.link?.url) {
					content = `[${content.trim()}](${style.link.url})`;
				}
				if (style?.bold) {
					content = `**${content.trim()}**`;
				}
				if (style?.italic) {
					content = `*${content.trim()}*`;
				}
				if (style?.strikethrough) {
					content = `~~${content.trim()}~~`;
				}

				text += content;
			}
		}

		const namedStyle = paragraph.paragraphStyle?.namedStyleType;
		if (namedStyle?.startsWith("HEADING_")) {
			const level = Number.parseInt(namedStyle.replace("HEADING_", ""), 10);
			if (level >= 1 && level <= 6) {
				text = "#".repeat(level) + " " + text.trim() + "\n";
			}
		}

		if (paragraph.bullet) {
			const indent = "  ".repeat(paragraph.bullet.nestingLevel ?? 0);
			text = `${indent}- ${text.trim()}\n`;
		}

		return text;
	}

	private tableToMarkdown(table: DocsTable | undefined): string {
		if (!table?.tableRows) {
			return "";
		}

		const rows: string[][] = [];

		for (const row of table.tableRows) {
			const cells: string[] = [];
			if (row.tableCells) {
				for (const cell of row.tableCells) {
					let cellText = "";
					if (cell.content) {
						for (const element of cell.content) {
							if (element.paragraph?.elements) {
								for (const elem of element.paragraph.elements) {
									if (elem.textRun?.content) {
										cellText += elem.textRun.content.replace(/\n/g, " ").trim();
									}
								}
							}
						}
					}
					cells.push(cellText);
				}
			}
			rows.push(cells);
		}

		if (rows.length === 0) {
			return "";
		}

		let markdown = "";
		const header = rows[0];
		markdown += "| " + header.join(" | ") + " |\n";
		markdown += "| " + header.map(() => "---").join(" | ") + " |\n";

		for (let i = 1; i < rows.length; i++) {
			markdown += "| " + rows[i].join(" | ") + " |\n";
		}

		return markdown + "\n";
	}

	private getDocumentEndIndex(document: DocsDocument): number {
		if (!document.body?.content) {
			return 1;
		}

		let maxIndex = 1;
		for (const element of document.body.content) {
			if (element.endIndex && element.endIndex > maxIndex) {
				maxIndex = element.endIndex;
			}
		}

		return maxIndex - 1;
	}

	private mapDocument(doc: docs_v1.Schema$Document): DocsDocument {
		return {
			documentId: doc.documentId ?? "",
			title: doc.title ?? "",
			body: doc.body as DocsDocument["body"],
			revisionId: doc.revisionId ?? undefined,
		};
	}

	generateWebUrl(documentId: string): string {
		return `https://docs.google.com/document/d/${documentId}/edit`;
	}

	clearDocsClientCache(email?: string): void {
		if (email) {
			this.docsClients.delete(email);
		} else {
			this.docsClients.clear();
		}
		this.clearClientCache(email);
	}
}
