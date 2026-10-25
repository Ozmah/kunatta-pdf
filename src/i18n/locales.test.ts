import { describe, expect, test } from "bun:test";

import { defaultLocale, isLocale, locales } from "./locales.ts";

describe("locales", () => {
	test("the default locale is one of the supported locales", () => {
		expect(locales).toContain(defaultLocale);
	});

	test("isLocale accepts supported locales only", () => {
		expect(isLocale("es")).toBe(true);
		expect(isLocale("en")).toBe(true);
		expect(isLocale("fr")).toBe(false);
		expect(isLocale("ES")).toBe(false);
	});
});
