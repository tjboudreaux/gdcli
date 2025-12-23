import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStorage } from "../account-storage.js";
import type { Account, DocsDocument } from "../types.js";
import { DocsService } from "./docs-service.js";

const mockDocsInstance = {
	documents: {
		create: vi.fn(),
		get: vi.fn(),
		batchUpdate: vi.fn(),
	},
};

vi.mock("googleapis", () => ({
	google: {
		docs: vi.fn(() => mockDocsInstance),
	},
}));

describe("DocsService", () => {
	let tempDir: string;
	let storage: AccountStorage;
	let service: DocsService;

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
		service = new DocsService(storage);
		vi.clearAllMocks();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	describe("create", () => {
		it("should create a new document", async () => {
			mockDocsInstance.documents.create.mockResolvedValue({
				data: {
					documentId: "doc-123",
					title: "New Document",
				},
			});

			const result = await service.create("test@example.com", "New Document");

			expect(result.documentId).toBe("doc-123");
			expect(result.title).toBe("New Document");
			expect(mockDocsInstance.documents.create).toHaveBeenCalledWith({
				requestBody: { title: "New Document" },
			});
		});
	});

	describe("get", () => {
		it("should get document by id", async () => {
			mockDocsInstance.documents.get.mockResolvedValue({
				data: {
					documentId: "doc-123",
					title: "My Document",
					body: {
						content: [
							{
								paragraph: {
									elements: [{ textRun: { content: "Hello World" } }],
								},
							},
						],
					},
				},
			});

			const result = await service.get("test@example.com", "doc-123");

			expect(result.documentId).toBe("doc-123");
			expect(result.title).toBe("My Document");
		});
	});

	describe("getContent", () => {
		it("should extract text content from document", async () => {
			mockDocsInstance.documents.get.mockResolvedValue({
				data: {
					documentId: "doc-123",
					title: "Test",
					body: {
						content: [
							{
								paragraph: {
									elements: [{ textRun: { content: "Hello " } }, { textRun: { content: "World" } }],
								},
							},
						],
					},
				},
			});

			const content = await service.getContent("test@example.com", "doc-123");

			expect(content).toBe("Hello World");
		});
	});

	describe("insertText", () => {
		it("should insert text at index", async () => {
			mockDocsInstance.documents.batchUpdate.mockResolvedValue({ data: {} });
			mockDocsInstance.documents.get.mockResolvedValue({
				data: { documentId: "doc-123", title: "Test" },
			});

			await service.insertText("test@example.com", "doc-123", {
				index: 5,
				text: "inserted",
			});

			expect(mockDocsInstance.documents.batchUpdate).toHaveBeenCalledWith({
				documentId: "doc-123",
				requestBody: {
					requests: [
						{
							insertText: {
								location: { index: 5 },
								text: "inserted",
							},
						},
					],
				},
			});
		});
	});

	describe("appendText", () => {
		it("should append text to end of document", async () => {
			mockDocsInstance.documents.get.mockResolvedValue({
				data: {
					documentId: "doc-123",
					title: "Test",
					body: {
						content: [{ endIndex: 50 }],
					},
				},
			});
			mockDocsInstance.documents.batchUpdate.mockResolvedValue({ data: {} });

			await service.appendText("test@example.com", "doc-123", "appended text");

			expect(mockDocsInstance.documents.batchUpdate).toHaveBeenCalledWith({
				documentId: "doc-123",
				requestBody: {
					requests: [
						{
							insertText: {
								location: { index: 49 },
								text: "appended text",
							},
						},
					],
				},
			});
		});

		it("should handle empty document", async () => {
			mockDocsInstance.documents.get.mockResolvedValue({
				data: {
					documentId: "doc-123",
					title: "Test",
					body: {},
				},
			});
			mockDocsInstance.documents.batchUpdate.mockResolvedValue({ data: {} });

			await service.appendText("test@example.com", "doc-123", "text");

			expect(mockDocsInstance.documents.batchUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					requestBody: {
						requests: [
							{
								insertText: {
									location: { index: 1 },
									text: "text",
								},
							},
						],
					},
				}),
			);
		});
	});

	describe("replaceText", () => {
		it("should replace text in document", async () => {
			mockDocsInstance.documents.batchUpdate.mockResolvedValue({ data: {} });
			mockDocsInstance.documents.get.mockResolvedValue({
				data: { documentId: "doc-123", title: "Test" },
			});

			await service.replaceText("test@example.com", "doc-123", {
				find: "old",
				replace: "new",
			});

			expect(mockDocsInstance.documents.batchUpdate).toHaveBeenCalledWith({
				documentId: "doc-123",
				requestBody: {
					requests: [
						{
							replaceAllText: {
								containsText: { text: "old", matchCase: true },
								replaceText: "new",
							},
						},
					],
				},
			});
		});

		it("should support case-insensitive replace", async () => {
			mockDocsInstance.documents.batchUpdate.mockResolvedValue({ data: {} });
			mockDocsInstance.documents.get.mockResolvedValue({
				data: { documentId: "doc-123", title: "Test" },
			});

			await service.replaceText("test@example.com", "doc-123", {
				find: "OLD",
				replace: "new",
				matchCase: false,
			});

			expect(mockDocsInstance.documents.batchUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					requestBody: {
						requests: [
							{
								replaceAllText: {
									containsText: { text: "OLD", matchCase: false },
									replaceText: "new",
								},
							},
						],
					},
				}),
			);
		});
	});

	describe("deleteRange", () => {
		it("should delete content range", async () => {
			mockDocsInstance.documents.batchUpdate.mockResolvedValue({ data: {} });
			mockDocsInstance.documents.get.mockResolvedValue({
				data: { documentId: "doc-123", title: "Test" },
			});

			await service.deleteRange("test@example.com", "doc-123", {
				startIndex: 10,
				endIndex: 20,
			});

			expect(mockDocsInstance.documents.batchUpdate).toHaveBeenCalledWith({
				documentId: "doc-123",
				requestBody: {
					requests: [
						{
							deleteContentRange: {
								range: { startIndex: 10, endIndex: 20 },
							},
						},
					],
				},
			});
		});
	});

	describe("batchUpdate", () => {
		it("should execute batch update", async () => {
			mockDocsInstance.documents.batchUpdate.mockResolvedValue({
				data: { documentId: "doc-123", replies: [] },
			});

			const requests = [{ insertText: { location: { index: 1 }, text: "test" } }];

			const result = await service.batchUpdate("test@example.com", "doc-123", requests);

			expect(result.documentId).toBe("doc-123");
			expect(mockDocsInstance.documents.batchUpdate).toHaveBeenCalledWith({
				documentId: "doc-123",
				requestBody: { requests },
			});
		});
	});

	describe("extractText", () => {
		it("should extract text from paragraphs", () => {
			const doc: DocsDocument = {
				documentId: "doc-123",
				title: "Test",
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: "Line 1\n" } }, { textRun: { content: "Line 2" } }],
							},
						},
					],
				},
			};

			const text = service.extractText(doc);

			expect(text).toBe("Line 1\nLine 2");
		});

		it("should extract text from tables", () => {
			const doc: DocsDocument = {
				documentId: "doc-123",
				title: "Test",
				body: {
					content: [
						{
							table: {
								rows: 2,
								columns: 2,
								tableRows: [
									{
										tableCells: [
											{
												content: [
													{
														paragraph: {
															elements: [{ textRun: { content: "A1" } }],
														},
													},
												],
											},
											{
												content: [
													{
														paragraph: {
															elements: [{ textRun: { content: "B1" } }],
														},
													},
												],
											},
										],
									},
								],
							},
						},
					],
				},
			};

			const text = service.extractText(doc);

			expect(text).toContain("A1");
			expect(text).toContain("B1");
		});

		it("should return empty string for empty document", () => {
			const doc: DocsDocument = {
				documentId: "doc-123",
				title: "Test",
			};

			const text = service.extractText(doc);

			expect(text).toBe("");
		});
	});

	describe("extractMarkdown", () => {
		it("should convert headings to markdown", () => {
			const doc: DocsDocument = {
				documentId: "doc-123",
				title: "Test",
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: "Title\n" } }],
								paragraphStyle: { namedStyleType: "HEADING_1" },
							},
						},
						{
							paragraph: {
								elements: [{ textRun: { content: "Subtitle\n" } }],
								paragraphStyle: { namedStyleType: "HEADING_2" },
							},
						},
					],
				},
			};

			const markdown = service.extractMarkdown(doc);

			expect(markdown).toContain("# Title");
			expect(markdown).toContain("## Subtitle");
		});

		it("should convert bold and italic text", () => {
			const doc: DocsDocument = {
				documentId: "doc-123",
				title: "Test",
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{ textRun: { content: "bold", textStyle: { bold: true } } },
									{ textRun: { content: " and " } },
									{ textRun: { content: "italic", textStyle: { italic: true } } },
								],
							},
						},
					],
				},
			};

			const markdown = service.extractMarkdown(doc);

			expect(markdown).toContain("**bold**");
			expect(markdown).toContain("*italic*");
		});

		it("should convert links to markdown", () => {
			const doc: DocsDocument = {
				documentId: "doc-123",
				title: "Test",
				body: {
					content: [
						{
							paragraph: {
								elements: [
									{
										textRun: {
											content: "Click here",
											textStyle: { link: { url: "https://example.com" } },
										},
									},
								],
							},
						},
					],
				},
			};

			const markdown = service.extractMarkdown(doc);

			expect(markdown).toContain("[Click here](https://example.com)");
		});

		it("should convert bullet lists", () => {
			const doc: DocsDocument = {
				documentId: "doc-123",
				title: "Test",
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: "Item 1\n" } }],
								bullet: { listId: "list1", nestingLevel: 0 },
							},
						},
						{
							paragraph: {
								elements: [{ textRun: { content: "Nested\n" } }],
								bullet: { listId: "list1", nestingLevel: 1 },
							},
						},
					],
				},
			};

			const markdown = service.extractMarkdown(doc);

			expect(markdown).toContain("- Item 1");
			expect(markdown).toContain("  - Nested");
		});

		it("should convert tables to markdown", () => {
			const doc: DocsDocument = {
				documentId: "doc-123",
				title: "Test",
				body: {
					content: [
						{
							table: {
								rows: 2,
								columns: 2,
								tableRows: [
									{
										tableCells: [
											{
												content: [{ paragraph: { elements: [{ textRun: { content: "Header1" } }] } }],
											},
											{
												content: [{ paragraph: { elements: [{ textRun: { content: "Header2" } }] } }],
											},
										],
									},
									{
										tableCells: [
											{
												content: [{ paragraph: { elements: [{ textRun: { content: "Cell1" } }] } }],
											},
											{
												content: [{ paragraph: { elements: [{ textRun: { content: "Cell2" } }] } }],
											},
										],
									},
								],
							},
						},
					],
				},
			};

			const markdown = service.extractMarkdown(doc);

			expect(markdown).toContain("| Header1 | Header2 |");
			expect(markdown).toContain("| --- | --- |");
			expect(markdown).toContain("| Cell1 | Cell2 |");
		});

		it("should return empty string for empty document", () => {
			const doc: DocsDocument = {
				documentId: "doc-123",
				title: "Test",
			};

			const markdown = service.extractMarkdown(doc);

			expect(markdown).toBe("");
		});

		it("should handle strikethrough text", () => {
			const doc: DocsDocument = {
				documentId: "doc-123",
				title: "Test",
				body: {
					content: [
						{
							paragraph: {
								elements: [{ textRun: { content: "deleted", textStyle: { strikethrough: true } } }],
							},
						},
					],
				},
			};

			const markdown = service.extractMarkdown(doc);

			expect(markdown).toContain("~~deleted~~");
		});
	});

	describe("generateWebUrl", () => {
		it("should generate document URL", () => {
			const url = service.generateWebUrl("doc-123");
			expect(url).toBe("https://docs.google.com/document/d/doc-123/edit");
		});
	});

	describe("clearDocsClientCache", () => {
		it("should clear specific client", async () => {
			mockDocsInstance.documents.get.mockResolvedValue({
				data: { documentId: "doc-123", title: "Test" },
			});

			await service.get("test@example.com", "doc-123");
			service.clearDocsClientCache("test@example.com");

			expect(service["docsClients"].has("test@example.com")).toBe(false);
		});

		it("should clear all clients", async () => {
			mockDocsInstance.documents.get.mockResolvedValue({
				data: { documentId: "doc-123", title: "Test" },
			});

			await service.get("test@example.com", "doc-123");
			service.clearDocsClientCache();

			expect(service["docsClients"].size).toBe(0);
		});
	});
});
