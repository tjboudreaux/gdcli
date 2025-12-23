import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStorage } from "../account-storage.js";
import type { Account } from "../types.js";
import { DriveService } from "./drive-service.js";

const mockDriveInstance = {
	files: {
		list: vi.fn(),
		get: vi.fn(),
		create: vi.fn(),
		delete: vi.fn(),
		update: vi.fn(),
		copy: vi.fn(),
		export: vi.fn(),
	},
	permissions: {
		create: vi.fn(),
		delete: vi.fn(),
		list: vi.fn(),
	},
};

vi.mock("googleapis", () => ({
	google: {
		drive: vi.fn(() => mockDriveInstance),
	},
}));

describe("DriveService", () => {
	let tempDir: string;
	let storage: AccountStorage;
	let service: DriveService;

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
		service = new DriveService(storage);
		vi.clearAllMocks();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	describe("list", () => {
		it("should list files with default options", async () => {
			mockDriveInstance.files.list.mockResolvedValue({
				data: {
					files: [
						{ id: "1", name: "file1.txt", mimeType: "text/plain" },
						{ id: "2", name: "file2.pdf", mimeType: "application/pdf" },
					],
					nextPageToken: "token123",
				},
			});

			const result = await service.list("test@example.com");

			expect(result.files).toHaveLength(2);
			expect(result.files[0].name).toBe("file1.txt");
			expect(result.nextPageToken).toBe("token123");
		});

		it("should apply query filter", async () => {
			mockDriveInstance.files.list.mockResolvedValue({ data: { files: [] } });

			await service.list("test@example.com", { query: "name contains 'test'" });

			expect(mockDriveInstance.files.list).toHaveBeenCalledWith(
				expect.objectContaining({
					q: "name contains 'test'",
				}),
			);
		});

		it("should apply mimeType filter", async () => {
			mockDriveInstance.files.list.mockResolvedValue({ data: { files: [] } });

			await service.list("test@example.com", { mimeType: "application/pdf" });

			expect(mockDriveInstance.files.list).toHaveBeenCalledWith(
				expect.objectContaining({
					q: "mimeType = 'application/pdf'",
				}),
			);
		});

		it("should combine query and mimeType filters", async () => {
			mockDriveInstance.files.list.mockResolvedValue({ data: { files: [] } });

			await service.list("test@example.com", {
				query: "name contains 'report'",
				mimeType: "application/pdf",
			});

			expect(mockDriveInstance.files.list).toHaveBeenCalledWith(
				expect.objectContaining({
					q: "name contains 'report' and mimeType = 'application/pdf'",
				}),
			);
		});

		it("should handle pagination", async () => {
			mockDriveInstance.files.list.mockResolvedValue({ data: { files: [] } });

			await service.list("test@example.com", { pageToken: "next-page" });

			expect(mockDriveInstance.files.list).toHaveBeenCalledWith(
				expect.objectContaining({
					pageToken: "next-page",
				}),
			);
		});

		it("should handle empty response", async () => {
			mockDriveInstance.files.list.mockResolvedValue({ data: {} });

			const result = await service.list("test@example.com");

			expect(result.files).toEqual([]);
			expect(result.nextPageToken).toBeUndefined();
		});
	});

	describe("search", () => {
		it("should search files with query", async () => {
			mockDriveInstance.files.list.mockResolvedValue({
				data: {
					files: [{ id: "1", name: "report.pdf", mimeType: "application/pdf" }],
				},
			});

			const result = await service.search("test@example.com", "name contains 'report'");

			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("report.pdf");
		});
	});

	describe("get", () => {
		it("should get file by id", async () => {
			mockDriveInstance.files.get.mockResolvedValue({
				data: {
					id: "file-123",
					name: "document.pdf",
					mimeType: "application/pdf",
					size: "1024",
					modifiedTime: "2024-01-01T00:00:00.000Z",
				},
			});

			const result = await service.get("test@example.com", "file-123");

			expect(result.id).toBe("file-123");
			expect(result.name).toBe("document.pdf");
			expect(result.size).toBe("1024");
		});
	});

	describe("download", () => {
		it("should download regular file", async () => {
			const fileContent = "file content";
			const readable = Readable.from([fileContent]);

			mockDriveInstance.files.get
				.mockResolvedValueOnce({
					data: { id: "file-123", name: "test.txt", mimeType: "text/plain" },
				})
				.mockResolvedValueOnce({ data: readable });

			const outputPath = path.join(tempDir, "output.txt");
			const result = await service.download("test@example.com", "file-123", outputPath);

			expect(result).toBe(outputPath);
			expect(fs.existsSync(outputPath)).toBe(true);
		});

		it("should export Google Docs file as PDF", async () => {
			const pdfContent = Buffer.from("PDF content");
			const readable = Readable.from([pdfContent]);

			mockDriveInstance.files.get.mockResolvedValueOnce({
				data: {
					id: "doc-123",
					name: "document",
					mimeType: "application/vnd.google-apps.document",
				},
			});
			mockDriveInstance.files.export.mockResolvedValueOnce({ data: readable });

			const outputPath = path.join(tempDir, "document");
			const result = await service.download("test@example.com", "doc-123", outputPath);

			expect(result).toBe(outputPath + ".pdf");
		});

		it("should throw error for unsupported Google file type", async () => {
			mockDriveInstance.files.get.mockResolvedValueOnce({
				data: {
					id: "file-123",
					name: "unknown",
					mimeType: "application/vnd.google-apps.unknown",
				},
			});

			await expect(service.download("test@example.com", "file-123")).rejects.toThrow("Cannot export Google file type");
		});
	});

	describe("upload", () => {
		it("should upload file with default options", async () => {
			const testFile = path.join(tempDir, "upload.txt");
			fs.writeFileSync(testFile, "test content");

			mockDriveInstance.files.create.mockResolvedValue({
				data: { id: "new-123", name: "upload.txt", mimeType: "text/plain" },
			});

			const result = await service.upload("test@example.com", testFile);

			expect(result.id).toBe("new-123");
			expect(result.name).toBe("upload.txt");
		});

		it("should upload file with custom name and parent", async () => {
			const testFile = path.join(tempDir, "upload.txt");
			fs.writeFileSync(testFile, "test content");

			mockDriveInstance.files.create.mockResolvedValue({
				data: { id: "new-123", name: "custom.txt", mimeType: "text/plain" },
			});

			await service.upload("test@example.com", testFile, {
				name: "custom.txt",
				parentId: "folder-123",
			});

			expect(mockDriveInstance.files.create).toHaveBeenCalledWith(
				expect.objectContaining({
					requestBody: expect.objectContaining({
						name: "custom.txt",
						parents: ["folder-123"],
					}),
				}),
			);
		});
	});

	describe("createFolder", () => {
		it("should create folder", async () => {
			mockDriveInstance.files.create.mockResolvedValue({
				data: {
					id: "folder-123",
					name: "New Folder",
					mimeType: "application/vnd.google-apps.folder",
				},
			});

			const result = await service.createFolder("test@example.com", "New Folder");

			expect(result.id).toBe("folder-123");
			expect(result.mimeType).toBe("application/vnd.google-apps.folder");
		});

		it("should create folder with parent", async () => {
			mockDriveInstance.files.create.mockResolvedValue({
				data: { id: "folder-123", name: "Subfolder", mimeType: "application/vnd.google-apps.folder" },
			});

			await service.createFolder("test@example.com", "Subfolder", "parent-123");

			expect(mockDriveInstance.files.create).toHaveBeenCalledWith(
				expect.objectContaining({
					requestBody: expect.objectContaining({
						parents: ["parent-123"],
					}),
				}),
			);
		});
	});

	describe("delete", () => {
		it("should delete file", async () => {
			mockDriveInstance.files.delete.mockResolvedValue({});

			await service.delete("test@example.com", "file-123");

			expect(mockDriveInstance.files.delete).toHaveBeenCalledWith({ fileId: "file-123" });
		});
	});

	describe("move", () => {
		it("should move file to new parent", async () => {
			mockDriveInstance.files.get.mockResolvedValue({
				data: { parents: ["old-parent"] },
			});
			mockDriveInstance.files.update.mockResolvedValue({
				data: { id: "file-123", name: "file.txt", parents: ["new-parent"] },
			});

			const result = await service.move("test@example.com", "file-123", "new-parent");

			expect(mockDriveInstance.files.update).toHaveBeenCalledWith(
				expect.objectContaining({
					fileId: "file-123",
					addParents: "new-parent",
					removeParents: "old-parent",
				}),
			);
			expect(result.id).toBe("file-123");
		});
	});

	describe("copy", () => {
		it("should copy file", async () => {
			mockDriveInstance.files.copy.mockResolvedValue({
				data: { id: "copy-123", name: "file-copy.txt" },
			});

			const result = await service.copy("test@example.com", "file-123");

			expect(result.id).toBe("copy-123");
		});

		it("should copy file with new name and parent", async () => {
			mockDriveInstance.files.copy.mockResolvedValue({
				data: { id: "copy-123", name: "new-name.txt" },
			});

			await service.copy("test@example.com", "file-123", "new-name.txt", "folder-123");

			expect(mockDriveInstance.files.copy).toHaveBeenCalledWith(
				expect.objectContaining({
					requestBody: {
						name: "new-name.txt",
						parents: ["folder-123"],
					},
				}),
			);
		});
	});

	describe("rename", () => {
		it("should rename file", async () => {
			mockDriveInstance.files.update.mockResolvedValue({
				data: { id: "file-123", name: "new-name.txt" },
			});

			const result = await service.rename("test@example.com", "file-123", "new-name.txt");

			expect(result.name).toBe("new-name.txt");
		});
	});

	describe("share", () => {
		it("should share file with user", async () => {
			mockDriveInstance.permissions.create.mockResolvedValue({
				data: {
					id: "perm-123",
					type: "user",
					role: "writer",
					emailAddress: "user@example.com",
				},
			});

			const result = await service.share("test@example.com", "file-123", {
				role: "writer",
				type: "user",
				emailAddress: "user@example.com",
			});

			expect(result.id).toBe("perm-123");
			expect(result.emailAddress).toBe("user@example.com");
		});

		it("should share file with anyone", async () => {
			mockDriveInstance.permissions.create.mockResolvedValue({
				data: { id: "perm-123", type: "anyone", role: "reader" },
			});

			await service.share("test@example.com", "file-123", {
				role: "reader",
				type: "anyone",
			});

			expect(mockDriveInstance.permissions.create).toHaveBeenCalledWith(
				expect.objectContaining({
					requestBody: { role: "reader", type: "anyone" },
				}),
			);
		});
	});

	describe("unshare", () => {
		it("should remove permission", async () => {
			mockDriveInstance.permissions.delete.mockResolvedValue({});

			await service.unshare("test@example.com", "file-123", "perm-123");

			expect(mockDriveInstance.permissions.delete).toHaveBeenCalledWith({
				fileId: "file-123",
				permissionId: "perm-123",
			});
		});
	});

	describe("listPermissions", () => {
		it("should list file permissions", async () => {
			mockDriveInstance.permissions.list.mockResolvedValue({
				data: {
					permissions: [
						{ id: "perm-1", type: "user", role: "owner", emailAddress: "owner@example.com" },
						{ id: "perm-2", type: "user", role: "reader", emailAddress: "reader@example.com" },
					],
				},
			});

			const result = await service.listPermissions("test@example.com", "file-123");

			expect(result).toHaveLength(2);
			expect(result[0].role).toBe("owner");
		});

		it("should handle empty permissions", async () => {
			mockDriveInstance.permissions.list.mockResolvedValue({ data: {} });

			const result = await service.listPermissions("test@example.com", "file-123");

			expect(result).toEqual([]);
		});
	});

	describe("getPermission", () => {
		it("should find permission by email", async () => {
			mockDriveInstance.permissions.list.mockResolvedValue({
				data: {
					permissions: [
						{ id: "perm-1", type: "user", role: "owner", emailAddress: "owner@example.com" },
						{ id: "perm-2", type: "user", role: "reader", emailAddress: "reader@example.com" },
					],
				},
			});

			const result = await service.getPermission("test@example.com", "file-123", "reader@example.com");

			expect(result?.id).toBe("perm-2");
		});

		it("should return null when permission not found", async () => {
			mockDriveInstance.permissions.list.mockResolvedValue({
				data: { permissions: [] },
			});

			const result = await service.getPermission("test@example.com", "file-123", "notfound@example.com");

			expect(result).toBeNull();
		});
	});

	describe("generateWebUrl", () => {
		it("should generate file URL", () => {
			const url = service.generateWebUrl("file-123");
			expect(url).toBe("https://drive.google.com/file/d/file-123/view");
		});
	});

	describe("generateFolderUrl", () => {
		it("should generate folder URL", () => {
			const url = service.generateFolderUrl("folder-123");
			expect(url).toBe("https://drive.google.com/drive/folders/folder-123");
		});
	});

	describe("clearDriveClientCache", () => {
		it("should clear specific client", async () => {
			mockDriveInstance.files.list.mockResolvedValue({ data: { files: [] } });

			await service.list("test@example.com");
			service.clearDriveClientCache("test@example.com");

			expect(service["driveClients"].has("test@example.com")).toBe(false);
		});

		it("should clear all clients", async () => {
			mockDriveInstance.files.list.mockResolvedValue({ data: { files: [] } });

			await service.list("test@example.com");
			service.clearDriveClientCache();

			expect(service["driveClients"].size).toBe(0);
		});
	});
});
