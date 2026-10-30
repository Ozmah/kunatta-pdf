import { defineConfig, devices } from "@playwright/test";

const port = 4330;
const ci = process.env["CI"] !== undefined;

// End-to-end tests run against the production build (`bun run e2e` builds first).
export default defineConfig({
	testDir: "e2e",
	testMatch: "**/*.e2e.ts",
	fullyParallel: true,
	forbidOnly: ci,
	// No retries: a flaky path is a bug to fix, not to hide.
	retries: 0,
	reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: `http://localhost:${port}`,
		acceptDownloads: true,
		trace: "retain-on-failure",
	},
	webServer: {
		command: `bun e2e/support/serve.ts`,
		env: { PORT: String(port) },
		url: `http://localhost:${port}/es/`,
		reuseExistingServer: !ci,
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		{ name: "firefox", use: { ...devices["Desktop Firefox"] } },
		// The reference device is a low-end Android phone.
		{ name: "mobile", use: { ...devices["Pixel 7"] } },
	],
});
