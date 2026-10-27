import { describe, expect, test } from "bun:test";

import { Glob } from "bun";

const fetchCall = /\bfetch\s*\(/;

// Constructs that make the browser fetch something. Plain links (<a href>) and
// XML namespaces are not requests and stay allowed.
const loadingPatterns: ReadonlyArray<RegExp> = [
	/<(?:script|img|iframe|source|video|audio|embed)\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i,
	/<link\b[^>]*\bhref\s*=\s*["']?(?:https?:)?\/\//i,
	/url\(\s*["']?(?:https?:)?\/\//i,
	/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i,
	/\bfrom\s+["'](?:https?:)?\/\//i,
	/\bimport\(\s*["'](?:https?:)?\/\//i,
	fetchCall,
	/\b(?:EventSource|WebSocket|sendBeacon)\s*\(/,
	/new\s+XMLHttpRequest\b/,
];

// Files allowed to call fetch, each with the reason. Every entry must only reach the site's own
// origin, and the Content-Security-Policy (connect-src 'self') enforces that in the browser.
const sameOriginFetch: ReadonlyMap<string, string> = new Map([
	[
		"src/tools/pdf/office-fonts.ts",
		"loads the bundled substitute fonts for Office documents from /fonts/office/",
	],
]);

const scanned = new Glob("{src,public}/**/*.{astro,ts,css,html,svg,js,mjs}");

async function offenders(): Promise<Array<string>> {
	const found: Array<string> = [];

	for await (const path of scanned.scan({ dot: false })) {
		if (path.endsWith(".test.ts")) continue;

		const source = await Bun.file(path).text();

		for (const pattern of loadingPatterns) {
			if (pattern === fetchCall && sameOriginFetch.has(path)) continue;

			if (pattern.test(source)) found.push(`${path} matches ${pattern.source}`);
		}
	}

	return found;
}

describe("privacy", () => {
	test("no source file loads resources from another origin or opens network connections", async () => {
		expect(await offenders()).toEqual([]);
	});

	test("every same-origin fetch exception still exists and still fetches", async () => {
		for (const path of sameOriginFetch.keys()) {
			expect(fetchCall.test(await Bun.file(path).text())).toBe(true);
		}
	});

	test("the guard catches a third-party stylesheet", () => {
		const sample = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">';

		expect(loadingPatterns.some((pattern) => pattern.test(sample))).toBe(true);
	});

	test("the guard allows plain links and SVG namespaces", () => {
		const sample =
			'<a href="https://github.com/Ozmah">Ozmah</a><svg xmlns="http://www.w3.org/2000/svg"></svg>';

		expect(loadingPatterns.some((pattern) => pattern.test(sample))).toBe(false);
	});
});
