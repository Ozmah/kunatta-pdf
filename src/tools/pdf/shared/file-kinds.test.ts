import { describe, expect, test } from "bun:test";

import { fileKinds, pickerAccept } from "./file-kinds.ts";

describe("pickerAccept", () => {
	test("offers every kind, by MIME type where pickers know it and by extension for Office", () => {
		expect(new Set(pickerAccept.split(","))).toEqual(
			new Set([
				"image/jpeg",
				"image/png",
				"image/webp",
				"application/pdf",
				"text/plain",
				".txt",
				".doc",
				".docx",
				".xls",
				".xlsx",
				".ppt",
				".pptx",
			]),
		);
	});

	test("every kind has a label", () => {
		expect(Object.values(fileKinds).every((kind) => kind.label.length > 0)).toBe(true);
	});
});
