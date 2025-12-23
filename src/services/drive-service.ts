import * as fs from "node:fs";
import * as path from "node:path";
import { type drive_v3, google } from "googleapis";
import type { DriveFile, DriveListResult, Permission } from "../types.js";
import { BaseService } from "./base-service.js";

export interface DriveSearchOptions {
	query?: string;
	mimeType?: string;
	maxResults?: number;
	pageToken?: string;
	orderBy?: string;
	fields?: string;
}

export interface DriveUploadOptions {
	name?: string;
	parentId?: string;
	mimeType?: string;
	description?: string;
}

export interface DriveShareOptions {
	role: "reader" | "writer" | "commenter" | "owner";
	type: "user" | "group" | "domain" | "anyone";
	emailAddress?: string;
	domain?: string;
	sendNotification?: boolean;
}

export class DriveService extends BaseService {
	private driveClients: Map<string, drive_v3.Drive> = new Map();

	private getDriveClient(email: string): drive_v3.Drive {
		if (!this.driveClients.has(email)) {
			const auth = this.getOAuth2Client(email);
			const drive = google.drive({ version: "v3", auth });
			this.driveClients.set(email, drive);
		}
		return this.driveClients.get(email)!;
	}

	async list(email: string, options: DriveSearchOptions = {}): Promise<DriveListResult> {
		const drive = this.getDriveClient(email);

		const params: drive_v3.Params$Resource$Files$List = {
			pageSize: options.maxResults ?? 100,
			fields:
				options.fields ??
				"nextPageToken, files(id, name, mimeType, size, modifiedTime, createdTime, parents, webViewLink, owners)",
			orderBy: options.orderBy ?? "modifiedTime desc",
		};

		if (options.query) {
			params.q = options.query;
		}

		if (options.mimeType) {
			const mimeQuery = `mimeType = '${options.mimeType}'`;
			params.q = params.q ? `${params.q} and ${mimeQuery}` : mimeQuery;
		}

		if (options.pageToken) {
			params.pageToken = options.pageToken;
		}

		const response = await drive.files.list(params);

		return {
			files: (response.data.files ?? []).map(this.mapFile),
			nextPageToken: response.data.nextPageToken ?? undefined,
		};
	}

	async search(email: string, query: string, maxResults = 100): Promise<DriveFile[]> {
		const result = await this.list(email, { query, maxResults });
		return result.files;
	}

	async get(email: string, fileId: string): Promise<DriveFile> {
		const drive = this.getDriveClient(email);

		const response = await drive.files.get({
			fileId,
			fields: "id, name, mimeType, size, modifiedTime, createdTime, parents, webViewLink, owners, description",
		});

		return this.mapFile(response.data);
	}

	async download(email: string, fileId: string, outputPath?: string): Promise<string> {
		const drive = this.getDriveClient(email);
		const fileInfo = await this.get(email, fileId);

		const fileName = outputPath ?? path.join(this.accountStorage.getDownloadsDir(), fileInfo.name);
		const dirName = path.dirname(fileName);

		if (!fs.existsSync(dirName)) {
			fs.mkdirSync(dirName, { recursive: true });
		}

		if (fileInfo.mimeType.startsWith("application/vnd.google-apps.")) {
			return this.exportGoogleFile(drive, fileId, fileInfo.mimeType, fileName);
		}

		const response = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });

		return new Promise((resolve, reject) => {
			const dest = fs.createWriteStream(fileName);
			response.data
				.on("error", reject)
				.pipe(dest)
				.on("error", reject)
				.on("finish", () => resolve(fileName));
		});
	}

	private async exportGoogleFile(
		drive: drive_v3.Drive,
		fileId: string,
		mimeType: string,
		basePath: string,
	): Promise<string> {
		const exportMimeTypes: Record<string, { mime: string; ext: string }> = {
			"application/vnd.google-apps.document": { mime: "application/pdf", ext: ".pdf" },
			"application/vnd.google-apps.spreadsheet": {
				mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				ext: ".xlsx",
			},
			"application/vnd.google-apps.presentation": { mime: "application/pdf", ext: ".pdf" },
			"application/vnd.google-apps.drawing": { mime: "image/png", ext: ".png" },
		};

		const exportConfig = exportMimeTypes[mimeType];
		if (!exportConfig) {
			throw new Error(`Cannot export Google file type: ${mimeType}`);
		}

		const outputPath = basePath.includes(".") ? basePath : basePath + exportConfig.ext;

		const response = await drive.files.export({ fileId, mimeType: exportConfig.mime }, { responseType: "stream" });

		return new Promise((resolve, reject) => {
			const dest = fs.createWriteStream(outputPath);
			response.data
				.on("error", reject)
				.pipe(dest)
				.on("error", reject)
				.on("finish", () => resolve(outputPath));
		});
	}

	async upload(email: string, filePath: string, options: DriveUploadOptions = {}): Promise<DriveFile> {
		const drive = this.getDriveClient(email);

		const fileName = options.name ?? path.basename(filePath);
		const mimeType = options.mimeType ?? this.getMimeType(filePath);

		const fileMetadata: drive_v3.Schema$File = {
			name: fileName,
			description: options.description,
		};

		if (options.parentId) {
			fileMetadata.parents = [options.parentId];
		}

		const media = {
			mimeType,
			body: fs.createReadStream(filePath),
		};

		const response = await drive.files.create({
			requestBody: fileMetadata,
			media,
			fields: "id, name, mimeType, size, modifiedTime, createdTime, parents, webViewLink, owners",
		});

		return this.mapFile(response.data);
	}

	async createFolder(email: string, name: string, parentId?: string): Promise<DriveFile> {
		const drive = this.getDriveClient(email);

		const fileMetadata: drive_v3.Schema$File = {
			name,
			mimeType: "application/vnd.google-apps.folder",
		};

		if (parentId) {
			fileMetadata.parents = [parentId];
		}

		const response = await drive.files.create({
			requestBody: fileMetadata,
			fields: "id, name, mimeType, modifiedTime, createdTime, parents, webViewLink",
		});

		return this.mapFile(response.data);
	}

	async delete(email: string, fileId: string): Promise<void> {
		const drive = this.getDriveClient(email);
		await drive.files.delete({ fileId });
	}

	async move(email: string, fileId: string, newParentId: string): Promise<DriveFile> {
		const drive = this.getDriveClient(email);

		const file = await drive.files.get({
			fileId,
			fields: "parents",
		});

		const previousParents = (file.data.parents ?? []).join(",");

		const response = await drive.files.update({
			fileId,
			addParents: newParentId,
			removeParents: previousParents,
			fields: "id, name, mimeType, size, modifiedTime, parents, webViewLink",
		});

		return this.mapFile(response.data);
	}

	async copy(email: string, fileId: string, name?: string, parentId?: string): Promise<DriveFile> {
		const drive = this.getDriveClient(email);

		const requestBody: drive_v3.Schema$File = {};
		if (name) requestBody.name = name;
		if (parentId) requestBody.parents = [parentId];

		const response = await drive.files.copy({
			fileId,
			requestBody,
			fields: "id, name, mimeType, size, modifiedTime, parents, webViewLink",
		});

		return this.mapFile(response.data);
	}

	async rename(email: string, fileId: string, newName: string): Promise<DriveFile> {
		const drive = this.getDriveClient(email);

		const response = await drive.files.update({
			fileId,
			requestBody: { name: newName },
			fields: "id, name, mimeType, size, modifiedTime, parents, webViewLink",
		});

		return this.mapFile(response.data);
	}

	async share(email: string, fileId: string, options: DriveShareOptions): Promise<Permission> {
		const drive = this.getDriveClient(email);

		const permission: drive_v3.Schema$Permission = {
			role: options.role,
			type: options.type,
		};

		if (options.emailAddress) {
			permission.emailAddress = options.emailAddress;
		}

		if (options.domain) {
			permission.domain = options.domain;
		}

		const response = await drive.permissions.create({
			fileId,
			requestBody: permission,
			sendNotificationEmail: options.sendNotification ?? false,
			fields: "id, type, role, emailAddress, displayName",
		});

		return {
			id: response.data.id ?? "",
			type: response.data.type ?? "",
			role: response.data.role ?? "",
			emailAddress: response.data.emailAddress ?? undefined,
			displayName: response.data.displayName ?? undefined,
		};
	}

	async unshare(email: string, fileId: string, permissionId: string): Promise<void> {
		const drive = this.getDriveClient(email);
		await drive.permissions.delete({ fileId, permissionId });
	}

	async listPermissions(email: string, fileId: string): Promise<Permission[]> {
		const drive = this.getDriveClient(email);

		const response = await drive.permissions.list({
			fileId,
			fields: "permissions(id, type, role, emailAddress, displayName)",
		});

		return (response.data.permissions ?? []).map((p) => ({
			id: p.id ?? "",
			type: p.type ?? "",
			role: p.role ?? "",
			emailAddress: p.emailAddress ?? undefined,
			displayName: p.displayName ?? undefined,
		}));
	}

	async getPermission(email: string, fileId: string, emailToFind: string): Promise<Permission | null> {
		const permissions = await this.listPermissions(email, fileId);
		return permissions.find((p) => p.emailAddress === emailToFind) ?? null;
	}

	generateWebUrl(fileId: string): string {
		return `https://drive.google.com/file/d/${fileId}/view`;
	}

	generateFolderUrl(folderId: string): string {
		return `https://drive.google.com/drive/folders/${folderId}`;
	}

	private mapFile(file: drive_v3.Schema$File): DriveFile {
		return {
			id: file.id ?? "",
			name: file.name ?? "",
			mimeType: file.mimeType ?? "",
			size: file.size ?? undefined,
			modifiedTime: file.modifiedTime ?? undefined,
			createdTime: file.createdTime ?? undefined,
			parents: file.parents ?? undefined,
			webViewLink: file.webViewLink ?? undefined,
			owners: file.owners?.map((o) => ({
				emailAddress: o.emailAddress ?? "",
				displayName: o.displayName ?? undefined,
			})),
		};
	}

	private getMimeType(filePath: string): string {
		const ext = path.extname(filePath).toLowerCase();
		const mimeTypes: Record<string, string> = {
			".pdf": "application/pdf",
			".doc": "application/msword",
			".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			".xls": "application/vnd.ms-excel",
			".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			".ppt": "application/vnd.ms-powerpoint",
			".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
			".png": "image/png",
			".jpg": "image/jpeg",
			".jpeg": "image/jpeg",
			".gif": "image/gif",
			".svg": "image/svg+xml",
			".txt": "text/plain",
			".html": "text/html",
			".css": "text/css",
			".js": "application/javascript",
			".json": "application/json",
			".xml": "application/xml",
			".zip": "application/zip",
			".csv": "text/csv",
			".md": "text/markdown",
		};
		return mimeTypes[ext] ?? "application/octet-stream";
	}

	clearDriveClientCache(email?: string): void {
		if (email) {
			this.driveClients.delete(email);
		} else {
			this.driveClients.clear();
		}
		this.clearClientCache(email);
	}
}
