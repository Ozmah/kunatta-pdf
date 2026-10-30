export const locales = ["es", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "es";

/** Each language in its own words, the way language pickers name them. */
export const localeNames: Readonly<Record<Locale, string>> = { es: "Español", en: "English" };

export function isLocale(value: string): value is Locale {
	return locales.some((locale) => locale === value);
}
