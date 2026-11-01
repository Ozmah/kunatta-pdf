import { describe, expect, test } from "bun:test";

import type { CaptureResult, Properties } from "posthog-js";
import * as v from "valibot";

import { isProjectKey, privacyRequested, sanitize, type Catalog, type Context } from "./events.ts";

const site = new URL("https://pdf.kunatta.tools");
const token = "phc_abcdefghijklmnopqrstuvwxyz0123";
const where: Context = { page: "tool", lang: "es" };

/** What the SDK adds to every event before `before_send` sees it. */
const sdk = {
	token,
	distinct_id: "019a3b2c-1d2e-7f30-8a41-5b6c7d8e9f00",
	$session_id: "019a3b2c-1d2e-7f30-8a41-5b6c7d8e9f01",
	$lib: "web",
	$lib_version: "1.444.0",
	$browser: "Firefox",
	$os: "Android",
	$device_type: "Mobile",
	$referring_domain: "www.reddit.com",
	$process_person_profile: false,
	$current_url: "https://pdf.kunatta.tools/es/?utm_source=reddit#secret",
	$referrer: "https://www.reddit.com/r/mexico/comments/abc/mi_tesis/",
	$raw_user_agent: "Mozilla/5.0 (Linux; Android 14; Pixel 7)",
	$screen_width: 412,
	$timezone: "America/Mexico_City",
};

/** A tool's catalog, as a tool would bring it. */
const catalog: Catalog = {
	pdf_made: v.object({
		path: v.picklist(["fast", "assembly"]),
		files: v.picklist(["1", "2-5"]),
		pages: v.picklist(["1", "2-10"]),
		size: v.picklist(["<1MB"]),
		seconds: v.picklist(["1-5s"]),
		page_size: v.picklist(["letter", "a4"]),
		quality: v.picklist(["normal"]),
		protected: v.boolean(),
		degraded: v.boolean(),
	}),
	pdf_failed: v.object({ path: v.picklist(["fast"]), reason: v.picklist(["WorkerCrashed"]) }),
};

function event(name: string, properties: Properties): CaptureResult {
	return { uuid: "1", event: name, properties: { ...sdk, ...properties }, $set: { a: 1 } };
}

function send(name: string, properties: Properties, page: Context = where): CaptureResult | null {
	return sanitize(event(name, properties), catalog, page, site, token);
}

const made = {
	path: "fast",
	files: "1",
	pages: "2-10",
	size: "<1MB",
	seconds: "1-5s",
	page_size: "a4",
	quality: "normal",
	protected: false,
	degraded: false,
};

describe("sanitize", () => {
	test("keeps allowlisted properties and replaces the address with the canonical page", () => {
		const sent = send("pdf_made", made);

		expect(sent?.properties).toEqual({
			...made,
			...where,
			token,
			distinct_id: sdk.distinct_id,
			$session_id: sdk.$session_id,
			$lib: "web",
			$lib_version: "1.444.0",
			$browser: "Firefox",
			$os: "Android",
			$device_type: "Mobile",
			$referring_domain: "www.reddit.com",
			$process_person_profile: false,
			$current_url: "https://pdf.kunatta.tools/es/",
			$host: "pdf.kunatta.tools",
			$pathname: "/es/",
		});
		expect(sent?.$set).toBeUndefined();
	});

	test("drops the full referrer, the user agent, the screen and the time zone", () => {
		const sent = JSON.stringify(send("pdf_made", made));

		for (const leak of ["mi_tesis", "Pixel 7", "412", "Mexico_City", "secret"]) {
			expect(sent).not.toContain(leak);
		}
	});

	test("refuses an event that is not on the list", () => {
		expect(send("$autocapture", {})).toBeNull();
		expect(send("$identify", {})).toBeNull();
	});

	test("refuses a value outside its range instead of trimming it", () => {
		expect(send("pdf_made", { ...made, pages: "37" })).toBeNull();
		expect(send("pdf_failed", { path: "fast", reason: "secreto.docx is broken" })).toBeNull();
	});

	test("refuses an event that would build a person profile", () => {
		expect(send("pdf_made", { ...made, $process_person_profile: true })).toBeNull();
	});

	test("keeps short campaign tags and refuses anything that looks like text", () => {
		const tagged = send("$pageview", { utm_source: "Reddit" });

		expect(tagged?.properties["utm_source"]).toBe("reddit");
		expect(send("$pageview", { utm_campaign: "mi correo juan@example.com" })).toBeNull();
	});

	test("names the not-found page by its canonical address", () => {
		const sent = send("$pageview", {}, { page: "not_found", lang: "en" });

		expect(sent?.properties["$current_url"]).toBe("https://pdf.kunatta.tools/en/404/");
	});

	test("passes null through, for events another hook already dropped", () => {
		expect(sanitize(null, catalog, where, site, token)).toBeNull();
	});
});

describe("privacyRequested", () => {
	test("reads Global Privacy Control and every Do Not Track spelling", () => {
		expect(privacyRequested(true)).toBe(true);
		expect(privacyRequested(undefined, "1")).toBe(true);
		expect(privacyRequested(undefined, "yes")).toBe(true);
		expect(privacyRequested(false, "0", null, "unspecified")).toBe(false);
	});
});

describe("isProjectKey", () => {
	test("accepts a PostHog project key and nothing else", () => {
		expect(isProjectKey(token)).toBe(true);
		expect(isProjectKey("phx_personal_api_key_that_is_secret")).toBe(false);
		expect(isProjectKey("")).toBe(false);
		expect(isProjectKey(undefined)).toBe(false);
	});
});
