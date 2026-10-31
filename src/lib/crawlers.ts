import { Panic } from "better-result";

import { defaultLocale, locales } from "../i18n/locales.ts";

/** The deployed origin from `site` in astro.config.ts. Absolute URLs cannot be built without it. */
export function siteOrigin(site: URL | undefined): URL {
	if (site === undefined) throw new Panic({ message: "astro.config.ts has no site" });

	return site;
}

/** The home page of a locale, absolute: hreflang and sitemaps ignore relative URLs. */
export function localeHome(site: URL, locale: string): string {
	return new URL(`/${locale}/`, site).href;
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

/** One entry per locale home, each listing every language version including itself. */
export function sitemap(site: URL): string {
	const alternates = [
		...locales.map(
			(code) => `<xhtml:link rel="alternate" hreflang="${code}" href="${localeHome(site, code)}"/>`,
		),
		`<xhtml:link rel="alternate" hreflang="x-default" href="${localeHome(site, defaultLocale)}"/>`,
	].join("");

	const entries = locales
		.map((code) => `<url><loc>${localeHome(site, code)}</loc>${alternates}</url>`)
		.join("");

	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries}</urlset>\n`;
}
