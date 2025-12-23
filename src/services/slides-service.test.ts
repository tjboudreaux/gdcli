import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStorage } from "../account-storage.js";
import type { Account, Presentation } from "../types.js";
import { SlidesService } from "./slides-service.js";

const mockSlidesInstance = {
	presentations: {
		create: vi.fn(),
		get: vi.fn(),
		batchUpdate: vi.fn(),
		pages: {
			get: vi.fn(),
			getThumbnail: vi.fn(),
		},
	},
};

vi.mock("googleapis", () => ({
	google: {
		slides: vi.fn(() => mockSlidesInstance),
	},
}));

describe("SlidesService", () => {
	let tempDir: string;
	let storage: AccountStorage;
	let service: SlidesService;

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
		service = new SlidesService(storage);
		vi.clearAllMocks();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	describe("create", () => {
		it("should create a new presentation", async () => {
			mockSlidesInstance.presentations.create.mockResolvedValue({
				data: {
					presentationId: "pres-123",
					title: "New Presentation",
				},
			});

			const result = await service.create("test@example.com", "New Presentation");

			expect(result.presentationId).toBe("pres-123");
			expect(result.title).toBe("New Presentation");
		});
	});

	describe("get", () => {
		it("should get presentation by id", async () => {
			mockSlidesInstance.presentations.get.mockResolvedValue({
				data: {
					presentationId: "pres-123",
					title: "My Presentation",
					slides: [{ objectId: "slide1" }, { objectId: "slide2" }],
					pageSize: {
						width: { magnitude: 720, unit: "PT" },
						height: { magnitude: 540, unit: "PT" },
					},
				},
			});

			const result = await service.get("test@example.com", "pres-123");

			expect(result.presentationId).toBe("pres-123");
			expect(result.slides).toHaveLength(2);
		});
	});

	describe("getPage", () => {
		it("should get specific slide", async () => {
			mockSlidesInstance.presentations.pages.get.mockResolvedValue({
				data: {
					objectId: "slide1",
					pageElements: [
						{
							objectId: "element1",
							shape: {
								shapeType: "TEXT_BOX",
								text: {
									textElements: [{ textRun: { content: "Hello" } }],
								},
							},
						},
					],
				},
			});

			const result = await service.getPage("test@example.com", "pres-123", "slide1");

			expect(result.objectId).toBe("slide1");
			expect(result.pageElements).toHaveLength(1);
		});
	});

	describe("getThumbnail", () => {
		it("should get slide thumbnail", async () => {
			mockSlidesInstance.presentations.pages.getThumbnail.mockResolvedValue({
				data: {
					contentUrl: "https://example.com/thumb.png",
					width: 800,
					height: 600,
				},
			});

			const result = await service.getThumbnail("test@example.com", "pres-123", "slide1");

			expect(result.contentUrl).toBe("https://example.com/thumb.png");
			expect(result.width).toBe(800);
		});

		it("should request JPEG format when specified", async () => {
			mockSlidesInstance.presentations.pages.getThumbnail.mockResolvedValue({
				data: { contentUrl: "https://example.com/thumb.jpg" },
			});

			await service.getThumbnail("test@example.com", "pres-123", "slide1", "JPEG");

			expect(mockSlidesInstance.presentations.pages.getThumbnail).toHaveBeenCalledWith(
				expect.objectContaining({
					"thumbnailProperties.mimeType": "image/jpeg",
				}),
			);
		});
	});

	describe("addSlide", () => {
		it("should add new slide", async () => {
			mockSlidesInstance.presentations.batchUpdate.mockResolvedValue({ data: {} });

			const result = await service.addSlide("test@example.com", "pres-123");

			expect(result).toMatch(/^slide_\d+$/);
			expect(mockSlidesInstance.presentations.batchUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					presentationId: "pres-123",
				}),
			);
		});

		it("should add slide with specific layout", async () => {
			mockSlidesInstance.presentations.batchUpdate.mockResolvedValue({ data: {} });

			await service.addSlide("test@example.com", "pres-123", { layout: "TITLE_AND_BODY" });

			expect(mockSlidesInstance.presentations.batchUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					requestBody: {
						requests: [
							expect.objectContaining({
								createSlide: expect.objectContaining({
									slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
								}),
							}),
						],
					},
				}),
			);
		});

		it("should add slide with custom object ID", async () => {
			mockSlidesInstance.presentations.batchUpdate.mockResolvedValue({ data: {} });

			const result = await service.addSlide("test@example.com", "pres-123", { objectId: "custom-id" });

			expect(result).toBe("custom-id");
		});
	});

	describe("deleteSlide", () => {
		it("should delete slide", async () => {
			mockSlidesInstance.presentations.batchUpdate.mockResolvedValue({ data: {} });

			await service.deleteSlide("test@example.com", "pres-123", "slide1");

			expect(mockSlidesInstance.presentations.batchUpdate).toHaveBeenCalledWith({
				presentationId: "pres-123",
				requestBody: {
					requests: [{ deleteObject: { objectId: "slide1" } }],
				},
			});
		});
	});

	describe("replaceAllText", () => {
		it("should replace text in presentation", async () => {
			mockSlidesInstance.presentations.batchUpdate.mockResolvedValue({
				data: {
					replies: [{ replaceAllText: { occurrencesChanged: 5 } }],
				},
			});

			const result = await service.replaceAllText("test@example.com", "pres-123", {
				find: "old",
				replace: "new",
			});

			expect(result).toBe(5);
		});

		it("should handle no replacements", async () => {
			mockSlidesInstance.presentations.batchUpdate.mockResolvedValue({
				data: { replies: [{}] },
			});

			const result = await service.replaceAllText("test@example.com", "pres-123", {
				find: "notfound",
				replace: "new",
			});

			expect(result).toBe(0);
		});

		it("should support case-insensitive replace", async () => {
			mockSlidesInstance.presentations.batchUpdate.mockResolvedValue({
				data: { replies: [{ replaceAllText: { occurrencesChanged: 1 } }] },
			});

			await service.replaceAllText("test@example.com", "pres-123", {
				find: "TEXT",
				replace: "new",
				matchCase: false,
			});

			expect(mockSlidesInstance.presentations.batchUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					requestBody: {
						requests: [
							{
								replaceAllText: {
									containsText: { text: "TEXT", matchCase: false },
									replaceText: "new",
								},
							},
						],
					},
				}),
			);
		});
	});

	describe("addTextBox", () => {
		it("should add text box to slide", async () => {
			mockSlidesInstance.presentations.batchUpdate.mockResolvedValue({ data: {} });

			const result = await service.addTextBox("test@example.com", "pres-123", {
				pageObjectId: "slide1",
				text: "Hello World",
				x: 50,
				y: 100,
			});

			expect(result).toMatch(/^textbox_\d+$/);
			expect(mockSlidesInstance.presentations.batchUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					requestBody: {
						requests: expect.arrayContaining([
							expect.objectContaining({
								createShape: expect.objectContaining({
									shapeType: "TEXT_BOX",
								}),
							}),
							expect.objectContaining({
								insertText: expect.objectContaining({
									text: "Hello World",
								}),
							}),
						]),
					},
				}),
			);
		});
	});

	describe("duplicateSlide", () => {
		it("should duplicate slide", async () => {
			mockSlidesInstance.presentations.batchUpdate.mockResolvedValue({ data: {} });

			const result = await service.duplicateSlide("test@example.com", "pres-123", "slide1");

			expect(result).toMatch(/^slide_copy_\d+$/);
			expect(mockSlidesInstance.presentations.batchUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					requestBody: {
						requests: [
							expect.objectContaining({
								duplicateObject: expect.objectContaining({
									objectId: "slide1",
								}),
							}),
						],
					},
				}),
			);
		});
	});

	describe("batchUpdate", () => {
		it("should execute batch update", async () => {
			mockSlidesInstance.presentations.batchUpdate.mockResolvedValue({
				data: { presentationId: "pres-123", replies: [] },
			});

			const requests = [{ deleteObject: { objectId: "element1" } }];

			const result = await service.batchUpdate("test@example.com", "pres-123", requests);

			expect(result.presentationId).toBe("pres-123");
		});
	});

	describe("extractText", () => {
		it("should extract text from presentation", () => {
			const presentation: Presentation = {
				presentationId: "pres-123",
				title: "Test",
				slides: [
					{
						objectId: "slide1",
						pageElements: [
							{
								shape: {
									text: {
										textElements: [{ textRun: { content: "Hello " } }, { textRun: { content: "World" } }],
									},
								},
							},
						],
					},
				],
			};

			const text = service.extractText(presentation);

			expect(text).toBe("Hello World");
		});

		it("should return empty string for empty presentation", () => {
			const presentation: Presentation = {
				presentationId: "pres-123",
			};

			const text = service.extractText(presentation);

			expect(text).toBe("");
		});

		it("should handle slides without text elements", () => {
			const presentation: Presentation = {
				presentationId: "pres-123",
				slides: [
					{
						objectId: "slide1",
						pageElements: [{ image: { contentUrl: "https://example.com/img.png" } }],
					},
				],
			};

			const text = service.extractText(presentation);

			expect(text).toBe("");
		});
	});

	describe("getSlideIds", () => {
		it("should return slide IDs", () => {
			const presentation: Presentation = {
				presentationId: "pres-123",
				slides: [{ objectId: "slide1" }, { objectId: "slide2" }, { objectId: "slide3" }],
			};

			const ids = service.getSlideIds(presentation);

			expect(ids).toEqual(["slide1", "slide2", "slide3"]);
		});

		it("should return empty array for presentation without slides", () => {
			const presentation: Presentation = {
				presentationId: "pres-123",
			};

			const ids = service.getSlideIds(presentation);

			expect(ids).toEqual([]);
		});
	});

	describe("generateWebUrl", () => {
		it("should generate presentation URL", () => {
			const url = service.generateWebUrl("pres-123");
			expect(url).toBe("https://docs.google.com/presentation/d/pres-123/edit");
		});

		it("should generate presentation URL with slide index", () => {
			const url = service.generateWebUrl("pres-123", 2);
			expect(url).toBe("https://docs.google.com/presentation/d/pres-123/edit#slide=id.p3");
		});
	});

	describe("clearSlidesClientCache", () => {
		it("should clear specific client", async () => {
			mockSlidesInstance.presentations.get.mockResolvedValue({
				data: { presentationId: "pres-123" },
			});

			await service.get("test@example.com", "pres-123");
			service.clearSlidesClientCache("test@example.com");

			expect(service["slidesClients"].has("test@example.com")).toBe(false);
		});

		it("should clear all clients", async () => {
			mockSlidesInstance.presentations.get.mockResolvedValue({
				data: { presentationId: "pres-123" },
			});

			await service.get("test@example.com", "pres-123");
			service.clearSlidesClientCache();

			expect(service["slidesClients"].size).toBe(0);
		});
	});
});
