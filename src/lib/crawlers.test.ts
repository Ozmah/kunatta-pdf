import { describe, expect, test } from "bun:test";

import { localeHome, robots, siteOrigin, sitemap } from "./crawlers.ts";

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

describe("robots", () => {
	test("allows everything and points to the absolute sitemap", () => {
		expect(robots(site)).toBe(
			"User-agent: *\nAllow: /\n\nSitemap: https://pdf.kunatta.tools/sitemap.xml\n",
		);
	});
});

describe("sitemap", () => {
	const xml = sitemap(site);

	test("lists each locale home once", () => {
		expect(xml.match(/<loc>[^<]+<\/loc>/g)).toEqual([
			"<loc>https://pdf.kunatta.tools/es/</loc>",
			"<loc>https://pdf.kunatta.tools/en/</loc>",
		]);
	});

	test("gives every entry all language versions and the default", () => {
		const entries = xml.match(/<url>.*?<\/url>/g) ?? [];

		expect(entries).toHaveLength(2);

		for (const entry of entries) {
			expect(entry).toContain('hreflang="es" href="https://pdf.kunatta.tools/es/"');
			expect(entry).toContain('hreflang="en" href="https://pdf.kunatta.tools/en/"');
			expect(entry).toContain('hreflang="x-default" href="https://pdf.kunatta.tools/es/"');
		}
	});
});
