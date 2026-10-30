import { describe, expect, test } from "bun:test";

import { defaultSettings, readSettings } from "./settings.ts";

describe("readSettings", () => {
	test("keeps valid choices", () => {
		expect(readSettings("a4", "max", "on", "reporte")).toEqual({
			size: "a4",
			quality: "max",
			password: "on",
			name: "reporte",
		});
	});

	test("falls back to the defaults for missing or tampered values", () => {
		expect(readSettings(null, null, null, null)).toEqual(defaultSettings);
		expect(readSettings("legal", "<img>", "yes", "   ")).toEqual(defaultSettings);
	});

	test("cleans the typed name the same way as any file name", () => {
		expect(readSettings(null, null, null, ' tarea: "final".pdf ').name).toBe("tarea final");
	});
});
