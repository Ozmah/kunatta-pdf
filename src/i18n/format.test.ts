import { describe, expect, test } from "bun:test";

import { fileSize, pageCount } from "./format.ts";

describe("pageCount", () => {
	test("uses the singular only for one page", () => {
		expect(pageCount("es", 1)).toBe("1 página");
		expect(pageCount("es", 14)).toBe("14 páginas");
		expect(pageCount("en", 1)).toBe("1 page");
		expect(pageCount("en", 0)).toBe("0 pages");
	});
});

describe("fileSize", () => {
	test("shows KB under a megabyte and MB with the locale's decimal separator", () => {
		expect(fileSize("es", 380_000)).toBe("380 KB");
		expect(fileSize("es", 9_800_000)).toBe("9,8 MB");
		expect(fileSize("en", 9_800_000)).toBe("9.8 MB");
		expect(fileSize("en", 120)).toBe("1 KB");
	});
});
