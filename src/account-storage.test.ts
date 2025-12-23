import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountStorage } from "./account-storage.js";
import type { Account } from "./types.js";

describe("AccountStorage", () => {
	let tempDir: string;
	let storage: AccountStorage;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gdcli-test-"));
		storage = new AccountStorage(tempDir);
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	describe("constructor", () => {
		it("should create config directory if it does not exist", () => {
			const newDir = path.join(tempDir, "subdir", "config");
			new AccountStorage(newDir);
			expect(fs.existsSync(newDir)).toBe(true);
		});

		it("should load existing accounts from file", () => {
			const account: Account = {
				email: "test@example.com",
				oauth2: {
					clientId: "client-id",
					clientSecret: "client-secret",
					refreshToken: "refresh-token",
				},
			};
			fs.writeFileSync(path.join(tempDir, "accounts.json"), JSON.stringify([account]));

			const newStorage = new AccountStorage(tempDir);
			expect(newStorage.getAccount("test@example.com")).toEqual(account);
		});

		it("should handle invalid JSON in accounts file", () => {
			fs.writeFileSync(path.join(tempDir, "accounts.json"), "invalid json{");
			const newStorage = new AccountStorage(tempDir);
			expect(newStorage.getAllAccounts()).toEqual([]);
		});

		it("should handle non-array data in accounts file", () => {
			fs.writeFileSync(path.join(tempDir, "accounts.json"), JSON.stringify({ not: "an array" }));
			const newStorage = new AccountStorage(tempDir);
			expect(newStorage.getAllAccounts()).toEqual([]);
		});

		it("should skip invalid account entries", () => {
			const invalidAccounts = [
				{ email: "valid@example.com", oauth2: { clientId: "a", clientSecret: "b", refreshToken: "c" } },
				{ email: "missing-oauth2" },
				{ oauth2: { clientId: "a", clientSecret: "b", refreshToken: "c" } },
				null,
				"string",
				{ email: "invalid-oauth2", oauth2: "not-an-object" },
				{ email: "missing-fields", oauth2: { clientId: "a" } },
			];
			fs.writeFileSync(path.join(tempDir, "accounts.json"), JSON.stringify(invalidAccounts));

			const newStorage = new AccountStorage(tempDir);
			expect(newStorage.getAllAccounts()).toHaveLength(1);
			expect(newStorage.getAccount("valid@example.com")).toBeDefined();
		});
	});

	describe("addAccount", () => {
		it("should add a new account", () => {
			const account: Account = {
				email: "new@example.com",
				oauth2: {
					clientId: "client-id",
					clientSecret: "client-secret",
					refreshToken: "refresh-token",
				},
			};

			storage.addAccount(account);

			expect(storage.getAccount("new@example.com")).toEqual(account);
			expect(storage.hasAccount("new@example.com")).toBe(true);
		});

		it("should persist account to file", () => {
			const account: Account = {
				email: "persist@example.com",
				oauth2: {
					clientId: "client-id",
					clientSecret: "client-secret",
					refreshToken: "refresh-token",
				},
			};

			storage.addAccount(account);

			const fileContent = JSON.parse(fs.readFileSync(path.join(tempDir, "accounts.json"), "utf8"));
			expect(fileContent).toContainEqual(account);
		});

		it("should overwrite existing account with same email", () => {
			const account1: Account = {
				email: "same@example.com",
				oauth2: { clientId: "old", clientSecret: "old", refreshToken: "old" },
			};
			const account2: Account = {
				email: "same@example.com",
				oauth2: { clientId: "new", clientSecret: "new", refreshToken: "new" },
			};

			storage.addAccount(account1);
			storage.addAccount(account2);

			expect(storage.getAllAccounts()).toHaveLength(1);
			expect(storage.getAccount("same@example.com")?.oauth2.clientId).toBe("new");
		});
	});

	describe("getAccount", () => {
		it("should return undefined for non-existent account", () => {
			expect(storage.getAccount("nonexistent@example.com")).toBeUndefined();
		});

		it("should return the account for existing email", () => {
			const account: Account = {
				email: "exists@example.com",
				oauth2: { clientId: "a", clientSecret: "b", refreshToken: "c" },
			};
			storage.addAccount(account);

			expect(storage.getAccount("exists@example.com")).toEqual(account);
		});
	});

	describe("getAllAccounts", () => {
		it("should return empty array when no accounts", () => {
			expect(storage.getAllAccounts()).toEqual([]);
		});

		it("should return all accounts", () => {
			const account1: Account = {
				email: "one@example.com",
				oauth2: { clientId: "a", clientSecret: "b", refreshToken: "c" },
			};
			const account2: Account = {
				email: "two@example.com",
				oauth2: { clientId: "d", clientSecret: "e", refreshToken: "f" },
			};

			storage.addAccount(account1);
			storage.addAccount(account2);

			const accounts = storage.getAllAccounts();
			expect(accounts).toHaveLength(2);
			expect(accounts).toContainEqual(account1);
			expect(accounts).toContainEqual(account2);
		});
	});

	describe("deleteAccount", () => {
		it("should return false when deleting non-existent account", () => {
			expect(storage.deleteAccount("nonexistent@example.com")).toBe(false);
		});

		it("should delete existing account and return true", () => {
			const account: Account = {
				email: "delete@example.com",
				oauth2: { clientId: "a", clientSecret: "b", refreshToken: "c" },
			};
			storage.addAccount(account);

			expect(storage.deleteAccount("delete@example.com")).toBe(true);
			expect(storage.hasAccount("delete@example.com")).toBe(false);
		});

		it("should persist deletion to file", () => {
			const account: Account = {
				email: "delete@example.com",
				oauth2: { clientId: "a", clientSecret: "b", refreshToken: "c" },
			};
			storage.addAccount(account);
			storage.deleteAccount("delete@example.com");

			const newStorage = new AccountStorage(tempDir);
			expect(newStorage.hasAccount("delete@example.com")).toBe(false);
		});
	});

	describe("hasAccount", () => {
		it("should return false for non-existent account", () => {
			expect(storage.hasAccount("nonexistent@example.com")).toBe(false);
		});

		it("should return true for existing account", () => {
			const account: Account = {
				email: "exists@example.com",
				oauth2: { clientId: "a", clientSecret: "b", refreshToken: "c" },
			};
			storage.addAccount(account);

			expect(storage.hasAccount("exists@example.com")).toBe(true);
		});
	});

	describe("setCredentials", () => {
		it("should save credentials to file", () => {
			storage.setCredentials("my-client-id", "my-client-secret");

			const fileContent = JSON.parse(fs.readFileSync(path.join(tempDir, "credentials.json"), "utf8"));
			expect(fileContent).toEqual({
				clientId: "my-client-id",
				clientSecret: "my-client-secret",
			});
		});

		it("should overwrite existing credentials", () => {
			storage.setCredentials("old-id", "old-secret");
			storage.setCredentials("new-id", "new-secret");

			const fileContent = JSON.parse(fs.readFileSync(path.join(tempDir, "credentials.json"), "utf8"));
			expect(fileContent.clientId).toBe("new-id");
		});
	});

	describe("getCredentials", () => {
		it("should return null when no credentials file exists", () => {
			expect(storage.getCredentials()).toBeNull();
		});

		it("should return credentials when file exists", () => {
			storage.setCredentials("client-id", "client-secret");

			expect(storage.getCredentials()).toEqual({
				clientId: "client-id",
				clientSecret: "client-secret",
			});
		});

		it("should return null for invalid JSON", () => {
			fs.writeFileSync(path.join(tempDir, "credentials.json"), "invalid{json");

			expect(storage.getCredentials()).toBeNull();
		});

		it("should return null for missing fields", () => {
			fs.writeFileSync(path.join(tempDir, "credentials.json"), JSON.stringify({ clientId: "only-id" }));

			expect(storage.getCredentials()).toBeNull();
		});

		it("should return null for wrong field types", () => {
			fs.writeFileSync(
				path.join(tempDir, "credentials.json"),
				JSON.stringify({ clientId: 123, clientSecret: "secret" }),
			);

			expect(storage.getCredentials()).toBeNull();
		});
	});

	describe("getConfigDir", () => {
		it("should return the config directory", () => {
			expect(storage.getConfigDir()).toBe(tempDir);
		});
	});

	describe("getDownloadsDir", () => {
		it("should return downloads directory path", () => {
			const downloadsDir = storage.getDownloadsDir();
			expect(downloadsDir).toBe(path.join(tempDir, "downloads"));
		});

		it("should create downloads directory if it does not exist", () => {
			const downloadsDir = storage.getDownloadsDir();
			expect(fs.existsSync(downloadsDir)).toBe(true);
		});

		it("should return existing downloads directory", () => {
			const downloadsDir = path.join(tempDir, "downloads");
			fs.mkdirSync(downloadsDir);

			expect(storage.getDownloadsDir()).toBe(downloadsDir);
		});
	});
});
