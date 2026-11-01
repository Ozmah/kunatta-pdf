import { Panic } from "better-result";

import { defaultLocale, locales } from "../i18n/locales.ts";

/** Indexable pages under each locale prefix, as the routes spell them ("" is the home). */
export const indexedPages = ["", "privacy/"] as const;

/** The deployed origin from `site` in astro.config.ts. Absolute URLs cannot be built without it. */
export function siteOrigin(site: URL | undefined): URL {
	if (site === undefined) throw new Panic({ message: "astro.config.ts has no site" });

	return site;
}

/** One page in one locale, absolute: hreflang and sitemaps ignore relative URLs. */
export function localePage(site: URL, locale: string, page = ""): string {
	return new URL(`/${locale}/${page}`, site).href;
}

/** The home page of a locale, absolute. */
export function localeHome(site: URL, locale: string): string {
	return localePage(site, locale);
}

/** Production crawler rules. Preview deployments are kept out of indexes by the server instead. */
export function robots(site: URL): string {
	return [
		"User-agent: *",
		"Allow: /",
		"",
		`Sitemap: ${new URL("/sitemap.xml", site).href}`,
		"",
	].join("\n");
}

/** Every language version of one page, including itself and the default. */
function alternates(site: URL, page: string): string {
	return [
		...locales.map(
			(code) =>
				`<xhtml:link rel="alternate" hreflang="${code}" href="${localePage(site, code, page)}"/>`,
		),
		`<xhtml:link rel="alternate" hreflang="x-default" href="${localePage(site, defaultLocale, page)}"/>`,
	].join("");
}

/** One entry per page and locale, each listing every language version of that page. */
export function sitemap(site: URL): string {
	const entries = indexedPages
		.flatMap((page) =>
			locales.map(
				(code) => `<url><loc>${localePage(site, code, page)}</loc>${alternates(site, page)}</url>`,
			),
		)
		.join("");

	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries}</urlset>\n`;
}
