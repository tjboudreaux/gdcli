#!/usr/bin/env node

import * as fs from "node:fs";
import { parseArgs } from "node:util";
import { AccountStorage } from "./account-storage.js";
import { OAuthFlow } from "./oauth-flow.js";
import { DocsService } from "./services/docs-service.js";
import { DriveService } from "./services/drive-service.js";
import { SheetsService } from "./services/sheets-service.js";
import { SlidesService } from "./services/slides-service.js";
import type { Account } from "./types.js";

const storage = new AccountStorage();
const driveService = new DriveService(storage);
const docsService = new DocsService(storage);
const sheetsService = new SheetsService(storage);
const slidesService = new SlidesService(storage);

function usage(): never {
	console.log(`gdcli - Google Drive, Docs, Sheets, Slides CLI

USAGE

  gdcli accounts <action>                    Account management
  gdcli <email> drive <command> [options]    Google Drive operations
  gdcli <email> docs <command> [options]     Google Docs operations
  gdcli <email> sheets <command> [options]   Google Sheets operations
  gdcli <email> slides <command> [options]   Google Slides operations

ACCOUNT COMMANDS

  gdcli accounts credentials <file.json>     Set OAuth credentials (once)
  gdcli accounts list                        List configured accounts
  gdcli accounts add <email> [--manual]      Add account (--manual for browserless OAuth)
  gdcli accounts remove <email>              Remove account

DRIVE COMMANDS

  gdcli <email> drive list [--query Q] [--max N] [--type TYPE]
      List files. TYPE: document, spreadsheet, presentation, folder, pdf

  gdcli <email> drive search <query>
      Search files using Drive query syntax

  gdcli <email> drive get <fileId>
      Get file metadata

  gdcli <email> drive download <fileId> [--out PATH]
      Download file (exports Google files to PDF/XLSX)

  gdcli <email> drive upload <file> [--parent ID] [--name NAME]
      Upload file to Drive

  gdcli <email> drive mkdir <name> [--parent ID]
      Create folder

  gdcli <email> drive delete <fileId>
      Delete file

  gdcli <email> drive move <fileId> --to <folderId>
      Move file to folder

  gdcli <email> drive copy <fileId> [--name NAME]
      Copy file

  gdcli <email> drive share <fileId> --email <email> --role <reader|writer>
      Share file with user

  gdcli <email> drive permissions <fileId>
      List file permissions

  gdcli <email> drive url <fileIds...>
      Generate web URLs

DOCS COMMANDS

  gdcli <email> docs get <documentId> [--format text|md|json]
      Get document content

  gdcli <email> docs create <title>
      Create blank document

  gdcli <email> docs append <documentId> --text <text>
      Append text to document

  gdcli <email> docs replace <documentId> --find <text> --replace <text>
      Replace text in document

  gdcli <email> docs url <documentIds...>
      Generate web URLs

SHEETS COMMANDS

  gdcli <email> sheets get <spreadsheetId>
      Get spreadsheet metadata

  gdcli <email> sheets read <spreadsheetId> <range>
      Read cell values (e.g., Sheet1!A1:B10)

  gdcli <email> sheets create <title>
      Create blank spreadsheet

  gdcli <email> sheets write <spreadsheetId> <range> --values <csv>
      Write values to range

  gdcli <email> sheets append <spreadsheetId> <range> --values <csv>
      Append values to range

  gdcli <email> sheets clear <spreadsheetId> <range>
      Clear range

  gdcli <email> sheets add-sheet <spreadsheetId> <name>
      Add new sheet

  gdcli <email> sheets url <spreadsheetIds...>
      Generate web URLs

SLIDES COMMANDS

  gdcli <email> slides get <presentationId>
      Get presentation metadata

  gdcli <email> slides create <title>
      Create blank presentation

  gdcli <email> slides add-slide <presentationId> [--layout LAYOUT]
      Add slide. LAYOUT: BLANK, TITLE, TITLE_AND_BODY, etc.

  gdcli <email> slides delete-slide <presentationId> <pageId>
      Delete slide

  gdcli <email> slides replace <presentationId> --find <text> --replace <text>
      Replace text in presentation

  gdcli <email> slides thumbnail <presentationId> <pageId> [--out PATH]
      Get slide thumbnail

  gdcli <email> slides url <presentationIds...>
      Generate web URLs

DATA STORAGE

  ~/.gdcli/credentials.json   OAuth client credentials
  ~/.gdcli/accounts.json      Account tokens
  ~/.gdcli/downloads/         Downloaded files`);
	process.exit(1);
}

function error(msg: string): never {
	console.error("Error:", msg);
	process.exit(1);
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		usage();
	}

	const first = args[0];
	const rest = args.slice(1);

	try {
		if (first === "accounts") {
			await handleAccounts(rest);
			return;
		}

		const account = first;
		const service = rest[0];
		const serviceArgs = rest.slice(1);

		if (!service) {
			error("Missing service. Use: drive, docs, sheets, slides");
		}

		switch (service) {
			case "drive":
				await handleDrive(account, serviceArgs);
				break;
			case "docs":
				await handleDocs(account, serviceArgs);
				break;
			case "sheets":
				await handleSheets(account, serviceArgs);
				break;
			case "slides":
				await handleSlides(account, serviceArgs);
				break;
			default:
				error(`Unknown service: ${service}`);
		}
	} catch (e) {
		error(e instanceof Error ? e.message : String(e));
	}
}

async function handleAccounts(args: string[]) {
	const action = args[0];
	if (!action) error("Missing action: list|add|remove|credentials");

	switch (action) {
		case "list": {
			const accounts = storage.getAllAccounts();
			if (accounts.length === 0) {
				console.log("No accounts configured");
			} else {
				for (const a of accounts) {
					console.log(a.email);
				}
			}
			break;
		}
		case "credentials": {
			const credFile = args[1];
			if (!credFile) error("Usage: accounts credentials <credentials.json>");
			const creds = JSON.parse(fs.readFileSync(credFile, "utf8"));
			const installed = creds.installed || creds.web;
			if (!installed) error("Invalid credentials file");
			storage.setCredentials(installed.client_id, installed.client_secret);
			console.log("Credentials saved");
			break;
		}
		case "add": {
			const manual = args.includes("--manual");
			const filtered = args.slice(1).filter((a) => a !== "--manual");
			const email = filtered[0];
			if (!email) error("Usage: accounts add <email> [--manual]");
			if (storage.hasAccount(email)) error(`Account '${email}' already exists`);
			const creds = storage.getCredentials();
			if (!creds) error("No credentials configured. Run: gdcli accounts credentials <credentials.json>");
			const flow = new OAuthFlow({ clientId: creds.clientId, clientSecret: creds.clientSecret });
			const result = await flow.authorize(manual);
			const account: Account = {
				email,
				oauth2: {
					clientId: creds.clientId,
					clientSecret: creds.clientSecret,
					refreshToken: result.refreshToken,
					accessToken: result.accessToken,
				},
			};
			storage.addAccount(account);
			console.log(`Account '${email}' added`);
			break;
		}
		case "remove": {
			const email = args[1];
			if (!email) error("Usage: accounts remove <email>");
			const deleted = storage.deleteAccount(email);
			console.log(deleted ? `Removed '${email}'` : `Not found: ${email}`);
			break;
		}
		default:
			error(`Unknown action: ${action}`);
	}
}

async function handleDrive(account: string, args: string[]) {
	const command = args[0];
	const cmdArgs = args.slice(1);

	if (!command) error("Missing drive command");

	switch (command) {
		case "list": {
			const { values } = parseArgs({
				args: cmdArgs,
				options: {
					query: { type: "string", short: "q" },
					max: { type: "string", short: "m" },
					type: { type: "string", short: "t" },
					page: { type: "string", short: "p" },
				},
			});
			const mimeTypes: Record<string, string> = {
				document: "application/vnd.google-apps.document",
				spreadsheet: "application/vnd.google-apps.spreadsheet",
				presentation: "application/vnd.google-apps.presentation",
				folder: "application/vnd.google-apps.folder",
				pdf: "application/pdf",
			};
			const result = await driveService.list(account, {
				query: values.query,
				mimeType: values.type ? mimeTypes[values.type] : undefined,
				maxResults: values.max ? Number(values.max) : undefined,
				pageToken: values.page,
			});
			console.log("ID\tNAME\tTYPE\tSIZE\tMODIFIED");
			for (const f of result.files) {
				const size = f.size ? formatSize(Number(f.size)) : "-";
				const modified = f.modifiedTime ? f.modifiedTime.slice(0, 16).replace("T", " ") : "-";
				console.log(`${f.id}\t${f.name}\t${f.mimeType.split(".").pop()}\t${size}\t${modified}`);
			}
			if (result.nextPageToken) {
				console.log(`\n# Next page: --page ${result.nextPageToken}`);
			}
			break;
		}
		case "search": {
			const query = cmdArgs.join(" ");
			if (!query) error("Usage: drive search <query>");
			const files = await driveService.search(account, query);
			console.log("ID\tNAME\tTYPE");
			for (const f of files) {
				console.log(`${f.id}\t${f.name}\t${f.mimeType.split(".").pop()}`);
			}
			break;
		}
		case "get": {
			const fileId = cmdArgs[0];
			if (!fileId) error("Usage: drive get <fileId>");
			const file = await driveService.get(account, fileId);
			console.log(JSON.stringify(file, null, 2));
			break;
		}
		case "download": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: { out: { type: "string", short: "o" } },
				allowPositionals: true,
			});
			const fileId = positionals[0];
			if (!fileId) error("Usage: drive download <fileId> [--out PATH]");
			const path = await driveService.download(account, fileId, values.out);
			console.log(`Downloaded: ${path}`);
			break;
		}
		case "upload": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: {
					parent: { type: "string", short: "p" },
					name: { type: "string", short: "n" },
				},
				allowPositionals: true,
			});
			const filePath = positionals[0];
			if (!filePath) error("Usage: drive upload <file> [--parent ID] [--name NAME]");
			const file = await driveService.upload(account, filePath, {
				parentId: values.parent,
				name: values.name,
			});
			console.log(`Uploaded: ${file.id}\t${file.name}`);
			break;
		}
		case "mkdir": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: { parent: { type: "string", short: "p" } },
				allowPositionals: true,
			});
			const name = positionals[0];
			if (!name) error("Usage: drive mkdir <name> [--parent ID]");
			const folder = await driveService.createFolder(account, name, values.parent);
			console.log(`Created: ${folder.id}\t${folder.name}`);
			break;
		}
		case "delete": {
			const fileId = cmdArgs[0];
			if (!fileId) error("Usage: drive delete <fileId>");
			await driveService.delete(account, fileId);
			console.log("Deleted");
			break;
		}
		case "move": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: { to: { type: "string" } },
				allowPositionals: true,
			});
			const fileId = positionals[0];
			if (!fileId || !values.to) error("Usage: drive move <fileId> --to <folderId>");
			const file = await driveService.move(account, fileId, values.to);
			console.log(`Moved: ${file.id}\t${file.name}`);
			break;
		}
		case "copy": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: { name: { type: "string", short: "n" } },
				allowPositionals: true,
			});
			const fileId = positionals[0];
			if (!fileId) error("Usage: drive copy <fileId> [--name NAME]");
			const file = await driveService.copy(account, fileId, values.name);
			console.log(`Copied: ${file.id}\t${file.name}`);
			break;
		}
		case "share": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: {
					email: { type: "string", short: "e" },
					role: { type: "string", short: "r" },
				},
				allowPositionals: true,
			});
			const fileId = positionals[0];
			if (!fileId || !values.email || !values.role) {
				error("Usage: drive share <fileId> --email <email> --role <reader|writer>");
			}
			const perm = await driveService.share(account, fileId, {
				type: "user",
				emailAddress: values.email,
				role: values.role as "reader" | "writer",
			});
			console.log(`Shared: ${perm.id}\t${perm.emailAddress}\t${perm.role}`);
			break;
		}
		case "permissions": {
			const fileId = cmdArgs[0];
			if (!fileId) error("Usage: drive permissions <fileId>");
			const perms = await driveService.listPermissions(account, fileId);
			console.log("ID\tTYPE\tROLE\tEMAIL");
			for (const p of perms) {
				console.log(`${p.id}\t${p.type}\t${p.role}\t${p.emailAddress || "-"}`);
			}
			break;
		}
		case "url": {
			if (cmdArgs.length === 0) error("Usage: drive url <fileIds...>");
			for (const id of cmdArgs) {
				console.log(`${id}\t${driveService.generateWebUrl(id)}`);
			}
			break;
		}
		default:
			error(`Unknown drive command: ${command}`);
	}
}

async function handleDocs(account: string, args: string[]) {
	const command = args[0];
	const cmdArgs = args.slice(1);

	if (!command) error("Missing docs command");

	switch (command) {
		case "get": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: { format: { type: "string", short: "f" } },
				allowPositionals: true,
			});
			const docId = positionals[0];
			if (!docId) error("Usage: docs get <documentId> [--format text|md|json]");
			const doc = await docsService.get(account, docId);
			const format = values.format || "text";
			if (format === "json") {
				console.log(JSON.stringify(doc, null, 2));
			} else if (format === "md") {
				console.log(docsService.extractMarkdown(doc));
			} else {
				console.log(docsService.extractText(doc));
			}
			break;
		}
		case "create": {
			const title = cmdArgs.join(" ");
			if (!title) error("Usage: docs create <title>");
			const doc = await docsService.create(account, title);
			console.log(`Created: ${doc.documentId}\t${doc.title}`);
			break;
		}
		case "append": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: { text: { type: "string", short: "t" } },
				allowPositionals: true,
			});
			const docId = positionals[0];
			if (!docId || !values.text) error("Usage: docs append <documentId> --text <text>");
			await docsService.appendText(account, docId, values.text);
			console.log("Text appended");
			break;
		}
		case "replace": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: {
					find: { type: "string", short: "f" },
					replace: { type: "string", short: "r" },
				},
				allowPositionals: true,
			});
			const docId = positionals[0];
			if (!docId || !values.find || values.replace === undefined) {
				error("Usage: docs replace <documentId> --find <text> --replace <text>");
			}
			await docsService.replaceText(account, docId, { find: values.find, replace: values.replace });
			console.log("Text replaced");
			break;
		}
		case "url": {
			if (cmdArgs.length === 0) error("Usage: docs url <documentIds...>");
			for (const id of cmdArgs) {
				console.log(`${id}\t${docsService.generateWebUrl(id)}`);
			}
			break;
		}
		default:
			error(`Unknown docs command: ${command}`);
	}
}

async function handleSheets(account: string, args: string[]) {
	const command = args[0];
	const cmdArgs = args.slice(1);

	if (!command) error("Missing sheets command");

	switch (command) {
		case "get": {
			const sheetId = cmdArgs[0];
			if (!sheetId) error("Usage: sheets get <spreadsheetId>");
			const sheet = await sheetsService.get(account, sheetId);
			console.log(JSON.stringify(sheet, null, 2));
			break;
		}
		case "read": {
			const [sheetId, range] = cmdArgs;
			if (!sheetId || !range) error("Usage: sheets read <spreadsheetId> <range>");
			const result = await sheetsService.read(account, sheetId, { range });
			for (const row of result.values ?? []) {
				console.log(row.join("\t"));
			}
			break;
		}
		case "create": {
			const title = cmdArgs.join(" ");
			if (!title) error("Usage: sheets create <title>");
			const sheet = await sheetsService.create(account, title);
			console.log(`Created: ${sheet.spreadsheetId}\t${sheet.properties?.title}`);
			break;
		}
		case "write": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: { values: { type: "string", short: "v" } },
				allowPositionals: true,
			});
			const [sheetId, range] = positionals;
			if (!sheetId || !range || !values.values) {
				error("Usage: sheets write <spreadsheetId> <range> --values <csv>");
			}
			const data = sheetsService.parseCsv(values.values);
			const updated = await sheetsService.write(account, sheetId, { range, values: data });
			console.log(`Updated ${updated} cells`);
			break;
		}
		case "append": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: { values: { type: "string", short: "v" } },
				allowPositionals: true,
			});
			const [sheetId, range] = positionals;
			if (!sheetId || !range || !values.values) {
				error("Usage: sheets append <spreadsheetId> <range> --values <csv>");
			}
			const data = sheetsService.parseCsv(values.values);
			const updated = await sheetsService.append(account, sheetId, { range, values: data });
			console.log(`Appended ${updated} cells`);
			break;
		}
		case "clear": {
			const [sheetId, range] = cmdArgs;
			if (!sheetId || !range) error("Usage: sheets clear <spreadsheetId> <range>");
			const cleared = await sheetsService.clear(account, sheetId, range);
			console.log(`Cleared: ${cleared}`);
			break;
		}
		case "add-sheet": {
			const [sheetId, name] = cmdArgs;
			if (!sheetId || !name) error("Usage: sheets add-sheet <spreadsheetId> <name>");
			const sheet = await sheetsService.addSheet(account, sheetId, name);
			console.log(`Added: ${sheet.properties?.sheetId}\t${sheet.properties?.title}`);
			break;
		}
		case "url": {
			if (cmdArgs.length === 0) error("Usage: sheets url <spreadsheetIds...>");
			for (const id of cmdArgs) {
				console.log(`${id}\t${sheetsService.generateWebUrl(id)}`);
			}
			break;
		}
		default:
			error(`Unknown sheets command: ${command}`);
	}
}

async function handleSlides(account: string, args: string[]) {
	const command = args[0];
	const cmdArgs = args.slice(1);

	if (!command) error("Missing slides command");

	switch (command) {
		case "get": {
			const presId = cmdArgs[0];
			if (!presId) error("Usage: slides get <presentationId>");
			const pres = await slidesService.get(account, presId);
			console.log(JSON.stringify(pres, null, 2));
			break;
		}
		case "create": {
			const title = cmdArgs.join(" ");
			if (!title) error("Usage: slides create <title>");
			const pres = await slidesService.create(account, title);
			console.log(`Created: ${pres.presentationId}\t${pres.title}`);
			break;
		}
		case "add-slide": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: { layout: { type: "string", short: "l" } },
				allowPositionals: true,
			});
			const presId = positionals[0];
			if (!presId) error("Usage: slides add-slide <presentationId> [--layout LAYOUT]");
			const slideId = await slidesService.addSlide(account, presId, {
				layout: values.layout as "BLANK" | "TITLE" | undefined,
			});
			console.log(`Added slide: ${slideId}`);
			break;
		}
		case "delete-slide": {
			const [presId, pageId] = cmdArgs;
			if (!presId || !pageId) error("Usage: slides delete-slide <presentationId> <pageId>");
			await slidesService.deleteSlide(account, presId, pageId);
			console.log("Deleted");
			break;
		}
		case "replace": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: {
					find: { type: "string", short: "f" },
					replace: { type: "string", short: "r" },
				},
				allowPositionals: true,
			});
			const presId = positionals[0];
			if (!presId || !values.find || values.replace === undefined) {
				error("Usage: slides replace <presentationId> --find <text> --replace <text>");
			}
			const count = await slidesService.replaceAllText(account, presId, {
				find: values.find,
				replace: values.replace,
			});
			console.log(`Replaced ${count} occurrences`);
			break;
		}
		case "thumbnail": {
			const { values, positionals } = parseArgs({
				args: cmdArgs,
				options: { out: { type: "string", short: "o" } },
				allowPositionals: true,
			});
			const [presId, pageId] = positionals;
			if (!presId || !pageId) error("Usage: slides thumbnail <presentationId> <pageId> [--out PATH]");
			const thumb = await slidesService.getThumbnail(account, presId, pageId);
			if (values.out) {
				const response = await fetch(thumb.contentUrl);
				const buffer = Buffer.from(await response.arrayBuffer());
				fs.writeFileSync(values.out, buffer);
				console.log(`Saved: ${values.out}`);
			} else {
				console.log(thumb.contentUrl);
			}
			break;
		}
		case "url": {
			if (cmdArgs.length === 0) error("Usage: slides url <presentationIds...>");
			for (const id of cmdArgs) {
				console.log(`${id}\t${slidesService.generateWebUrl(id)}`);
			}
			break;
		}
		default:
			error(`Unknown slides command: ${command}`);
	}
}

function formatSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

main();
