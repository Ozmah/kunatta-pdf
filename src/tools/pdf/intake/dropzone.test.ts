import { describe, expect, test } from "bun:test";

import { carriesFiles, isApplePlatform } from "./dropzone.ts";

describe("carriesFiles", () => {
	test("reacts only to drags that carry files", () => {
		expect(carriesFiles(["Files"])).toBe(true);
		expect(carriesFiles(["text/plain", "Files"])).toBe(true);
		expect(carriesFiles(["text/plain", "text/uri-list"])).toBe(false);
		expect(carriesFiles([])).toBe(false);
	});
});

describe("isApplePlatform", () => {
	test("detects Apple platforms for the ⌘ hint", () => {
		expect(isApplePlatform("MacIntel")).toBe(true);
		expect(isApplePlatform("iPhone")).toBe(true);
		expect(isApplePlatform("Win32")).toBe(false);
		expect(isApplePlatform("Linux x86_64")).toBe(false);
	});
});
