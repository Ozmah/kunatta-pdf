import { defineConfig, devices } from "@playwright/test";

const port = 4330;
const ci = process.env["CI"] !== undefined;

// Screenshots only match pixel for pixel inside the Playwright image (`bun run visual`).
const visual = process.env["VISUAL"] === "1";

const behavior = [
	{ name: "chromium", testMatch: "**/*.e2e.ts", use: { ...devices["Desktop Chrome"] } },
	{ name: "firefox", testMatch: "**/*.e2e.ts", use: { ...devices["Desktop Firefox"] } },
	// The reference device is a low-end Android phone.
	{ name: "mobile", testMatch: "**/*.e2e.ts", use: { ...devices["Pixel 7"] } },
];

const screens = [
	{ name: "desktop", testMatch: "**/*.visual.ts", use: { ...devices["Desktop Chrome"] } },
	{ name: "phone", testMatch: "**/*.visual.ts", use: { ...devices["Pixel 7"] } },
];

// End-to-end tests run against the production build (`bun run e2e` builds first).
export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	forbidOnly: ci,
	// No retries: a flaky path is a bug to fix, not to hide.
	retries: 0,
	reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
	snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
	expect: {
		toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css" },
	},
	use: {
		baseURL: `http://localhost:${port}`,
		acceptDownloads: true,
		trace: "retain-on-failure",
	},
	webServer: {
		// Plain Node, so the same command runs on the host and inside the Playwright image.
		command: "node e2e/support/serve.ts",
		env: { PORT: String(port) },
		url: `http://localhost:${port}/es/`,
		reuseExistingServer: !ci,
	},
	projects: visual ? screens : behavior,
});
