import { describe, expect, test } from "bun:test";

import { causeMessage, conversionFailed, engineUnavailable, passwordRequired } from "./errors.ts";

describe("causeMessage", () => {
	test("reads an error's message and keeps text as it is", () => {
		expect(causeMessage(new TypeError("bad xref"))).toBe("bad xref");
		expect(causeMessage("already a reason")).toBe("already a reason");
		expect(causeMessage(42)).toBe("42");
	});
});

describe("factories", () => {
	test("name the file in the message and keep the cause as the reason", () => {
		const failed = conversionFailed("a.docx", new Error("truncated zip"));

		expect(failed.message).toBe("a.docx could not be converted");
		expect(failed.reason).toBe("truncated zip");
		expect(engineUnavailable("b.ppt", "chunk failed").reason).toBe("chunk failed");
		expect(passwordRequired("c.pdf").message).toBe("c.pdf needs a password");
	});
});
