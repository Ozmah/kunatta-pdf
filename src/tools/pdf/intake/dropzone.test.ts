import { describe, expect, test } from "bun:test";

import { isApplePlatform } from "./dropzone.ts";

describe("isApplePlatform", () => {
	test("detects Apple platforms for the ⌘ hint", () => {
		expect(isApplePlatform("MacIntel")).toBe(true);
		expect(isApplePlatform("iPhone")).toBe(true);
		expect(isApplePlatform("Win32")).toBe(false);
		expect(isApplePlatform("Linux x86_64")).toBe(false);
	});
});
