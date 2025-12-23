import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountStorage } from "../account-storage.js";
import type { Account } from "../types.js";
import { BaseService } from "./base-service.js";

class TestService extends BaseService {
	public testGetOAuth2Client(email: string) {
		return this.getOAuth2Client(email);
	}

	public testCreateOAuth2Client(account: Account) {
		return this.createOAuth2Client(account);
	}
}

describe("BaseService", () => {
	let tempDir: string;
	let storage: AccountStorage;
	let service: TestService;

	const testAccount: Account = {
		email: "test@example.com",
		oauth2: {
			clientId: "test-client-id",
			clientSecret: "test-client-secret",
			refreshToken: "test-refresh-token",
			accessToken: "test-access-token",
		},
	};

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gdcli-test-"));
		storage = new AccountStorage(tempDir);
		service = new TestService(storage);
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	describe("constructor", () => {
		it("should create service with provided storage", () => {
			const svc = new TestService(storage);
			expect(svc.getAccountStorage()).toBe(storage);
		});

		it("should create service with default storage when none provided", () => {
			const originalHome = process.env.HOME;
			process.env.HOME = tempDir;

			const svc = new TestService();
			expect(svc.getAccountStorage()).toBeInstanceOf(AccountStorage);

			process.env.HOME = originalHome;
		});
	});

	describe("getOAuth2Client", () => {
		it("should throw error for non-existent account", () => {
			expect(() => service.testGetOAuth2Client("nonexistent@example.com")).toThrow(
				"Account 'nonexistent@example.com' not found",
			);
		});

		it("should return OAuth2Client for existing account", () => {
			storage.addAccount(testAccount);

			const client = service.testGetOAuth2Client("test@example.com");

			expect(client).toBeDefined();
			expect(client.credentials.refresh_token).toBe("test-refresh-token");
		});

		it("should cache OAuth2Client", () => {
			storage.addAccount(testAccount);

			const client1 = service.testGetOAuth2Client("test@example.com");
			const client2 = service.testGetOAuth2Client("test@example.com");

			expect(client1).toBe(client2);
		});

		it("should create separate clients for different accounts", () => {
			storage.addAccount(testAccount);
			storage.addAccount({
				email: "other@example.com",
				oauth2: {
					clientId: "other-client-id",
					clientSecret: "other-client-secret",
					refreshToken: "other-refresh-token",
				},
			});

			const client1 = service.testGetOAuth2Client("test@example.com");
			const client2 = service.testGetOAuth2Client("other@example.com");

			expect(client1).not.toBe(client2);
		});
	});

	describe("createOAuth2Client", () => {
		it("should create client with correct credentials", () => {
			const client = service.testCreateOAuth2Client(testAccount);

			expect(client.credentials.refresh_token).toBe("test-refresh-token");
			expect(client.credentials.access_token).toBe("test-access-token");
		});

		it("should handle account without access token", () => {
			const accountNoAccess: Account = {
				email: "noaccess@example.com",
				oauth2: {
					clientId: "client-id",
					clientSecret: "client-secret",
					refreshToken: "refresh-token",
				},
			};

			const client = service.testCreateOAuth2Client(accountNoAccess);

			expect(client.credentials.refresh_token).toBe("refresh-token");
			expect(client.credentials.access_token).toBeUndefined();
		});
	});

	describe("clearClientCache", () => {
		it("should clear specific client from cache", () => {
			storage.addAccount(testAccount);
			storage.addAccount({
				email: "other@example.com",
				oauth2: {
					clientId: "other-client-id",
					clientSecret: "other-client-secret",
					refreshToken: "other-refresh-token",
				},
			});

			const client1 = service.testGetOAuth2Client("test@example.com");
			service.testGetOAuth2Client("other@example.com");

			service.clearClientCache("test@example.com");

			const client1New = service.testGetOAuth2Client("test@example.com");
			expect(client1New).not.toBe(client1);
		});

		it("should clear all clients from cache", () => {
			storage.addAccount(testAccount);

			const client1 = service.testGetOAuth2Client("test@example.com");
			service.clearClientCache();
			const client2 = service.testGetOAuth2Client("test@example.com");

			expect(client1).not.toBe(client2);
		});
	});

	describe("getAccountStorage", () => {
		it("should return the account storage instance", () => {
			expect(service.getAccountStorage()).toBe(storage);
		});
	});
});
