import { en } from "./en.ts";
import { es, type MessageKey, type Messages } from "./es.ts";
import { isLocale, type Locale } from "./locales.ts";

const dictionaries = { es, en } satisfies { readonly [Code in Locale]: Messages };

export function translate(locale: Locale, key: MessageKey): string {
	return dictionaries[locale][key];
}

/** Narrows a route parameter produced by `getStaticPaths`; anything else is a routing bug. */
export function routeLocale(param: string | undefined): Locale {
	if (param !== undefined && isLocale(param)) return param;

	throw new Error(`Route rendered with an unsupported locale: ${String(param)}`);
}
