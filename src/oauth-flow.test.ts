import { describe, expect, it, vi } from "vitest";
import { OAuthFlow } from "./oauth-flow.js";

describe("OAuthFlow", () => {
	const defaultOptions = {
		clientId: "test-client-id",
		clientSecret: "test-client-secret",
	};

	describe("constructor", () => {
		it("should create OAuth flow with default scopes", () => {
			const flow = new OAuthFlow(defaultOptions);
			expect(flow).toBeDefined();
		});

		it("should create OAuth flow with custom scopes", () => {
			const flow = new OAuthFlow({
				...defaultOptions,
				scopes: ["https://www.googleapis.com/auth/drive.readonly"],
			});
			expect(flow).toBeDefined();
		});

		it("should create OAuth flow with custom redirect port", () => {
			const flow = new OAuthFlow({
				...defaultOptions,
				redirectPort: 8080,
			});
			expect(flow).toBeDefined();
		});
	});

	describe("getAuthUrl", () => {
		it("should generate a valid authorization URL", () => {
			const flow = new OAuthFlow(defaultOptions);
			const url = flow.getAuthUrl();

			expect(url).toContain("accounts.google.com");
			expect(url).toContain("client_id=test-client-id");
			expect(url).toContain("access_type=offline");
			expect(url).toContain("prompt=consent");
		});

		it("should include all scopes in URL", () => {
			const flow = new OAuthFlow(defaultOptions);
			const url = flow.getAuthUrl();

			expect(url).toContain("scope=");
			expect(url).toContain("drive");
			expect(url).toContain("documents");
			expect(url).toContain("spreadsheets");
			expect(url).toContain("presentations");
		});
	});

	describe("extractCodeFromUrl", () => {
		it("should extract code from valid redirect URL", () => {
			const flow = new OAuthFlow(defaultOptions);
			const url = "http://localhost:3000?code=abc123&scope=something";

			const code = flow.extractCodeFromUrl(url);
			expect(code).toBe("abc123");
		});

		it("should extract code from URL with encoded characters", () => {
			const flow = new OAuthFlow(defaultOptions);
			const url = "http://localhost:3000?code=abc%2F123%3D%3D";

			const code = flow.extractCodeFromUrl(url);
			expect(code).toBe("abc/123==");
		});

		it("should throw error for URL without code", () => {
			const flow = new OAuthFlow(defaultOptions);
			const url = "http://localhost:3000?error=access_denied";

			expect(() => flow.extractCodeFromUrl(url)).toThrow();
		});

		it("should handle malformed URL with code parameter", () => {
			const flow = new OAuthFlow(defaultOptions);
			const url = "not-a-url?code=abc123";

			const code = flow.extractCodeFromUrl(url);
			expect(code).toBe("abc123");
		});

		it("should throw error for completely invalid URL", () => {
			const flow = new OAuthFlow(defaultOptions);
			const url = "not-a-url-at-all";

			expect(() => flow.extractCodeFromUrl(url)).toThrow("Invalid redirect URL");
		});
	});

	describe("exchangeCode", () => {
		it("should throw error when no refresh token received", async () => {
			const flow = new OAuthFlow(defaultOptions);

			const mockGetToken = vi.fn().mockResolvedValue({
				tokens: { access_token: "access", refresh_token: null },
			});
			flow.getOAuth2Client().getToken = mockGetToken;

			await expect(flow.exchangeCode("test-code")).rejects.toThrow("No refresh token received");
		});

		it("should return tokens when exchange is successful", async () => {
			const flow = new OAuthFlow(defaultOptions);

			const mockGetToken = vi.fn().mockResolvedValue({
				tokens: { access_token: "access-token", refresh_token: "refresh-token" },
			});
			flow.getOAuth2Client().getToken = mockGetToken;

			const result = await flow.exchangeCode("test-code");

			expect(result.refreshToken).toBe("refresh-token");
			expect(result.accessToken).toBe("access-token");
		});

		it("should handle missing access token", async () => {
			const flow = new OAuthFlow(defaultOptions);

			const mockGetToken = vi.fn().mockResolvedValue({
				tokens: { refresh_token: "refresh-token" },
			});
			flow.getOAuth2Client().getToken = mockGetToken;

			const result = await flow.exchangeCode("test-code");

			expect(result.refreshToken).toBe("refresh-token");
			expect(result.accessToken).toBeUndefined();
		});
	});

	describe("getOAuth2Client", () => {
		it("should return the OAuth2Client instance", () => {
			const flow = new OAuthFlow(defaultOptions);
			const client = flow.getOAuth2Client();

			expect(client).toBeDefined();
		});
	});

	describe("getDefaultScopes", () => {
		it("should return default scopes", () => {
			const scopes = OAuthFlow.getDefaultScopes();

			expect(scopes).toContain("https://www.googleapis.com/auth/drive");
			expect(scopes).toContain("https://www.googleapis.com/auth/documents");
			expect(scopes).toContain("https://www.googleapis.com/auth/spreadsheets");
			expect(scopes).toContain("https://www.googleapis.com/auth/presentations");
		});

		it("should return a copy of scopes array", () => {
			const scopes1 = OAuthFlow.getDefaultScopes();
			const scopes2 = OAuthFlow.getDefaultScopes();

			scopes1.push("modified");
			expect(scopes2).not.toContain("modified");
		});
	});
});
