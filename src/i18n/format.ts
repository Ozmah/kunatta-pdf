import type { Locale } from "./locales.ts";
import { translate } from "./translate.ts";

/** "1 página", "14 páginas": plural rules come from the locale. */
export function pageCount(locale: Locale, count: number): string {
	const form = new Intl.PluralRules(locale).select(count) === "one" ? "one" : "other";

	return translate(locale, `count.pages.${form}`).replace("{count}", String(count));
}

/** Sizes as people read them on their phones: 380 KB, 9.8 MB (decimal units, locale separators). */
export function fileSize(locale: Locale, bytes: number): string {
	const megabytes = bytes / 1_000_000;

	if (megabytes < 1) return `${Math.max(1, Math.round(bytes / 1000))} KB`;

	return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(megabytes)} MB`;
}

/** Messages with a {count} slot. */
export function withCount(text: string, count: number): string {
	return text.replace("{count}", String(count));
}
