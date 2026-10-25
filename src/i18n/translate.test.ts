import { describe, expect, test } from "bun:test";

import { en } from "./en.ts";
import { es, type MessageKey } from "./es.ts";
import { locales } from "./locales.ts";
import { routeLocale, translate } from "./translate.ts";

function isMessageKey(name: string): name is MessageKey {
	return Object.hasOwn(es, name);
}

describe("dictionaries", () => {
	test("every locale defines exactly the keys of the source dictionary", () => {
		expect(Object.keys(en).toSorted()).toEqual(Object.keys(es).toSorted());
	});

	test("no message is empty in any locale", () => {
		for (const locale of locales) {
			for (const key of Object.keys(es)) {
				if (!isMessageKey(key)) throw new Error(`Unexpected key: ${key}`);

				expect(translate(locale, key).trim().length).toBeGreaterThan(0);
			}
		}
	});
});

describe("translate", () => {
	test("returns the message for the requested locale", () => {
		expect(translate("es", "footer.notice")).toBe("Tus archivos nunca salen de tu navegador.");
		expect(translate("en", "footer.notice")).toBe("Your files never leave your browser.");
	});
});

describe("routeLocale", () => {
	test("accepts supported locales", () => {
		expect(routeLocale("es")).toBe("es");
		expect(routeLocale("en")).toBe("en");
	});

	test("treats any other value as a routing bug", () => {
		expect(() => routeLocale("fr")).toThrow();
		expect(() => routeLocale(undefined)).toThrow();
	});
});
