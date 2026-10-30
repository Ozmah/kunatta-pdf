import type { Locale } from "./locales.ts";
import { translate } from "./translate.ts";

type Plural = "one" | "other";

function plural(locale: Locale, count: number): Plural {
	return new Intl.PluralRules(locale).select(count) === "one" ? "one" : "other";
}

/** "1 página", "14 páginas": plural rules come from the locale. */
export function pageCount(locale: Locale, count: number): string {
	return interpolate(translate(locale, `count.pages.${plural(locale, count)}`), { count });
}

export function fileCount(locale: Locale, count: number): string {
	return interpolate(translate(locale, `count.files.${plural(locale, count)}`), { count });
}

/** "· las 6 páginas se ajustan" under the size in the single-PDF dialog. */
export function fitNote(locale: Locale, count: number): string {
	return interpolate(translate(locale, `single.fit.${plural(locale, count)}`), { count });
}

/** Sizes as people read them on their phones: 380 KB, 9.8 MB (decimal units, locale separators). */
export function fileSize(locale: Locale, bytes: number): string {
	const megabytes = bytes / 1_000_000;

	if (megabytes < 1) return `${Math.max(1, Math.round(bytes / 1000))} KB`;

	return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(megabytes)} MB`;
}

/**
 * Fills the {slots} of a message in one pass. Values go in literally: a file name such as
 * "a$'b.pdf" or "{total}.pdf" is neither read as a replacement pattern nor filled again. A slot
 * without a value stays visible, so a copy mistake shows up instead of vanishing.
 */
export function interpolate(
	template: string,
	values: Readonly<Record<string, string | number>>,
): string {
	return template.replaceAll(/\{(\w+)\}/gu, (slot: string, key: string) => {
		const value = values[key];

		return value === undefined ? slot : String(value);
	});
}
