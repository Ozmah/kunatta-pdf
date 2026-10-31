import { describe, expect, test } from "bun:test";

import { isKeyboardActivation } from "./panel.ts";

describe("isKeyboardActivation", () => {
	test("treats clicks without pointer presses as keyboard activations", () => {
		expect(isKeyboardActivation(0)).toBe(true);
		expect(isKeyboardActivation(1)).toBe(false);
		expect(isKeyboardActivation(2)).toBe(false);
	});
});
