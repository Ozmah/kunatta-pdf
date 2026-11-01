import { describe, expect, test } from "bun:test";

import { localeHome, localePage, robots, siteOrigin, sitemap } from "./crawlers.ts";

const site = new URL("https://pdf.kunatta.tools");

describe("siteOrigin", () => {
	test("returns the configured site", () => {
		expect(siteOrigin(site)).toBe(site);
	});

	test("stops the build when the site is missing", () => {
		expect(() => siteOrigin(undefined)).toThrow("astro.config.ts has no site");
	});
});

describe("localeHome", () => {
	test("is absolute and keeps the trailing slash the routes use", () => {
		expect(localeHome(site, "en")).toBe("https://pdf.kunatta.tools/en/");
	});
});

describe("localePage", () => {
	test("puts the page under the locale prefix", () => {
		expect(localePage(site, "es", "privacy/")).toBe("https://pdf.kunatta.tools/es/privacy/");
	});
});

describe("robots", () => {
	test("allows everything and points to the absolute sitemap", () => {
		expect(robots(site)).toBe(
			"User-agent: *\nAllow: /\n\nSitemap: https://pdf.kunatta.tools/sitemap.xml\n",
		);
	});
});

describe("sitemap", () => {
	const xml = sitemap(site);

	test("lists every indexed page once per locale", () => {
		expect(xml.match(/<loc>[^<]+<\/loc>/g)).toEqual([
			"<loc>https://pdf.kunatta.tools/es/</loc>",
			"<loc>https://pdf.kunatta.tools/en/</loc>",
			"<loc>https://pdf.kunatta.tools/es/privacy/</loc>",
			"<loc>https://pdf.kunatta.tools/en/privacy/</loc>",
		]);
	});

	test("gives every entry all language versions of its own page and the default", () => {
		const entries = xml.match(/<url>.*?<\/url>/g) ?? [];

		expect(entries).toHaveLength(4);

		for (const entry of entries.slice(2)) {
			expect(entry).toContain('hreflang="en" href="https://pdf.kunatta.tools/en/privacy/"');
			expect(entry).toContain('hreflang="x-default" href="https://pdf.kunatta.tools/es/privacy/"');
		}

		for (const entry of entries.slice(0, 2)) {
			expect(entry).toContain('hreflang="es" href="https://pdf.kunatta.tools/es/"');
			expect(entry).toContain('hreflang="en" href="https://pdf.kunatta.tools/en/"');
			expect(entry).toContain('hreflang="x-default" href="https://pdf.kunatta.tools/es/"');
		}
	});
});
