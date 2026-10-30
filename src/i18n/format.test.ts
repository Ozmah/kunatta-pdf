import { describe, expect, test } from "bun:test";

import { fileSize, interpolate, pageCount } from "./format.ts";

describe("pageCount", () => {
	test("uses the singular only for one page", () => {
		expect(pageCount("es", 1)).toBe("1 página");
		expect(pageCount("es", 14)).toBe("14 páginas");
		expect(pageCount("en", 1)).toBe("1 page");
		expect(pageCount("en", 0)).toBe("0 pages");
	});
});

describe("interpolate", () => {
	test("fills every slot, including repeated ones", () => {
		expect(interpolate("{done} of {total}, {done} done", { done: 3, total: 7 })).toBe(
			"3 of 7, 3 done",
		);
	});

	test("inserts values literally, without replacement patterns", () => {
		expect(interpolate("Grab {name} now", { name: "a$'b$&.pdf" })).toBe("Grab a$'b$&.pdf now");
	});

	test("never fills a slot that came in with a value", () => {
		expect(
			interpolate("{name}, {position} of {total}", { name: "{total}.pdf", position: 1, total: 5 }),
		).toBe("{total}.pdf, 1 of 5");
	});

	test("leaves a slot without a value visible", () => {
		expect(interpolate("{count} files", {})).toBe("{count} files");
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
