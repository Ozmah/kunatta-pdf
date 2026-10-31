import { describe, expect, test } from "bun:test";

import { choosePath } from "./paths.ts";
import type { PileEntry } from "../shared/entry.ts";
import type { InputKind } from "../contract/kinds.ts";

function entry(name: string, kind: InputKind): PileEntry {
	return { id: name, name, kind, size: 10, source: new Blob(["x"]) };
}

describe("choosePath", () => {
	test("one non-PDF file dropped or picked takes the fast path", () => {
		const photo = entry("pizarron.jpg", "jpeg");

		expect(choosePath([photo], "drop")).toEqual({ kind: "fast", entry: photo });
		expect(choosePath([entry("tarea.docx", "docx")], "pick").kind).toBe("fast");
	});

	test("one PDF asks first; several files or any paste assemble", () => {
		expect(choosePath([entry("a.pdf", "pdf")], "drop").kind).toBe("single-pdf");
		expect(choosePath([entry("a.jpg", "jpeg"), entry("b.jpg", "jpeg")], "drop").kind).toBe(
			"assembly",
		);
		expect(choosePath([entry("captura.png", "png")], "paste").kind).toBe("assembly");
	});

	test("nothing accepted means nothing to do", () => {
		expect(choosePath([], "drop").kind).toBe("none");
	});
});
