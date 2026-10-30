import { describe, expect, test } from "bun:test";

import { languageAction } from "./language-guard.ts";

const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };

describe("languageAction", () => {
	test("switches right away when there is nothing to lose", () => {
		expect(languageAction(plain, false, false)).toBe("follow");
	});

	test("asks first when the reload would lose work", () => {
		expect(languageAction(plain, false, true)).toBe("ask");
	});

	test("the current language never reloads the page, with or without work", () => {
		expect(languageAction(plain, true, false)).toBe("stay");
		expect(languageAction(plain, true, true)).toBe("stay");
	});

	test("new tabs and windows are left to the browser: this page keeps its work", () => {
		expect(languageAction({ ...plain, ctrlKey: true }, false, true)).toBe("follow");
		expect(languageAction({ ...plain, metaKey: true }, false, true)).toBe("follow");
		expect(languageAction({ ...plain, shiftKey: true }, false, true)).toBe("follow");
		expect(languageAction({ ...plain, button: 1 }, true, true)).toBe("follow");
	});
});
