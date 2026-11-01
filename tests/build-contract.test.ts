import { describe, expect, test } from "bun:test";

import { Glob } from "bun";

import config from "../astro.config.ts";
import { defaultLocale, locales } from "../src/i18n/locales.ts";
import { indexedPages } from "../src/lib/crawlers.ts";

/**
 * What the built site promises to browsers and crawlers, checked on `dist/` itself.
 * `bun run check` builds before it tests.
 */

const site = new URL(config.site ?? "");

/** Every value of one attribute on the elements a selector matches. */
function attributes(html: string, selector: string, name: string): ReadonlyArray<string> {
	const found: Array<string> = [];

	new HTMLRewriter()
		.on(selector, {
			element(element) {
				found.push(element.getAttribute(name) ?? "");
			},
		})
		.transform(html);

	return found;
}

async function built(path: string): Promise<string> {
	const file = Bun.file(`dist/${path}`);

	if (!(await file.exists())) throw new Error(`dist/${path} is missing: run bun run build first`);

	return file.text();
}

/** Every indexable page with the path after its locale prefix ("" is the home). */
const indexed = indexedPages.flatMap((rest) =>
	locales.map((lang) => [`${lang}/${rest}index.html`, lang, rest] as const),
);

const notFound = locales.map((lang) => `${lang}/404/index.html`);

describe("build contract", () => {
	test("ships no source maps", async () => {
		const maps = await Array.fromAsync(new Glob("**/*.map").scan({ cwd: "dist" }));

		expect(maps).toEqual([]);
	});

	test("every page loads its scripts from its own origin", async () => {
		const pages = await Array.fromAsync(new Glob("**/*.html").scan({ cwd: "dist" }));

		expect(pages.length).toBeGreaterThan(0);

		for (const page of pages) {
			const remote = attributes(await built(page), "script[src]", "src").filter(
				(src) => new URL(src, site).origin !== site.origin,
			);

			expect({ page, remote }).toEqual({ page, remote: [] });
		}
	});

	test("only a production build with a project key loads analytics", async () => {
		const expected =
			process.env["APP_ENV"] === "production" &&
			(process.env["PUBLIC_POSTHOG_KEY"] ?? "").startsWith("phc_");

		const pages = await Array.fromAsync(new Glob("**/*.html").scan({ cwd: "dist" }));

		for (const page of pages.filter((path) => path !== "index.html")) {
			const loads = attributes(await built(page), "script[src]", "src").some((src) =>
				src.includes("/Analytics."),
			);

			expect({ page, loads }).toEqual({ page, loads: expected });
		}
	});

	test.each(indexed)(
		"%s has an absolute canonical and points to itself in every language",
		async (page, lang, rest) => {
			const html = await built(page);

			expect(attributes(html, 'link[rel="canonical"]', "href")).toEqual([
				new URL(`/${lang}/${rest}`, site).href,
			]);
			expect(attributes(html, 'link[rel="alternate"]', "hreflang").toSorted()).toEqual(
				[...locales, "x-default"].toSorted(),
			);
			expect(attributes(html, 'link[rel="alternate"]', "href").toSorted()).toEqual(
				[...locales, defaultLocale]
					.map((code) => new URL(`/${code}/${rest}`, site).href)
					.toSorted(),
			);

			expect(attributes(html, 'meta[name="robots"]', "content")).toEqual([]);
		},
	);

	test.each(notFound)("%s stays out of search results", async (page) => {
		const html = await built(page);

		expect(attributes(html, 'meta[name="robots"]', "content")).toEqual(["noindex"]);
		expect(attributes(html, 'link[rel="canonical"]', "href")).toEqual([]);
		expect(attributes(html, 'link[rel="alternate"]', "href")).toEqual([]);
	});

	test("the root redirect is not indexed and points to the default home", async () => {
		const html = await built("index.html");

		expect(attributes(html, 'meta[name="robots"]', "content")).toEqual(["noindex"]);
		expect(attributes(html, 'link[rel="canonical"]', "href")).toEqual([
			new URL(`/${defaultLocale}/`, site).href,
		]);
	});

	test("robots.txt points to the absolute sitemap, which lists every indexed page", async () => {
		expect(await built("robots.txt")).toContain(`Sitemap: ${new URL("/sitemap.xml", site).href}`);

		const sitemap = await built("sitemap.xml");

		for (const [, lang, rest] of indexed) {
			expect(sitemap).toContain(`<loc>${new URL(`/${lang}/${rest}`, site).href}</loc>`);
		}

		expect(sitemap).not.toContain("/404/");
	});
});
