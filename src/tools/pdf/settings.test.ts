import { describe, expect, test } from "bun:test";

import { defaultSettings, readSettings } from "./settings.ts";

describe("readSettings", () => {
	test("keeps valid choices", () => {
		expect(readSettings("a4", "max")).toEqual({ size: "a4", quality: "max" });
	});

	test("falls back to the defaults for missing or tampered values", () => {
		expect(readSettings(null, null)).toEqual(defaultSettings);
		expect(readSettings("legal", "<img>")).toEqual(defaultSettings);
	});
});
