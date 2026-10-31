import { describe, expect, test } from "bun:test";

import { PasswordRequired, WorkerCrashed } from "../contract/errors.ts";
import { degradedNotice, failureReason, kindLabel } from "./labels.ts";

describe("kindLabel", () => {
	test("reads like the file extension people know", () => {
		expect(kindLabel("jpeg")).toBe("JPG");
		expect(kindLabel("text")).toBe("TXT");
		expect(kindLabel("docx")).toBe("DOCX");
	});
});

describe("messages", () => {
	test("legacy Office and text get their own notice, everything else the generic one", () => {
		expect(degradedNotice("ppt")).toBe("degraded.ppt");
		expect(degradedNotice("text")).toBe("degraded.text");
		expect(degradedNotice("docx")).toBe("degraded.other");
	});

	test("each failure maps to a reason the user can act on", () => {
		const fileName = "a.docx";

		expect(failureReason(new PasswordRequired({ fileName, message: "x" }))).toBe("reason.password");
		expect(failureReason(new WorkerCrashed({ fileName, message: "x" }))).toBe("reason.crashed");
	});
});
