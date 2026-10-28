import { describe, expect, test } from "bun:test";

import { PDF } from "@libpdf/core";

import { convertText, wrapLine } from "./text.ts";

const font = new Uint8Array(
	await Bun.file("public/fonts/office/Cousine_400Regular.ttf").arrayBuffer(),
);

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("wrapLine", () => {
	test("breaks at the last space before the limit", () => {
		expect(wrapLine("la célula es la unidad", 10)).toEqual(["la célula", "es la", "unidad"]);
	});

	test("cuts words longer than a line and keeps short lines whole", () => {
		expect(wrapLine("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
		expect(wrapLine("corto", 10)).toEqual(["corto"]);
		expect(wrapLine("", 10)).toEqual([""]);
	});
});

describe("convertText", () => {
	test("uses the chosen page size; Original falls back to Letter", async () => {
		for (const [size, width] of [
			["a4", 595.28],
			["letter", 612],
			["original", 612],
		] as const) {
			const result = await convertText(encode("Apuntes de biología"), {
				fileName: "a.txt",
				size,
				font,
			});

			const [page] = (await PDF.load(result.unwrap().pdf)).getPages();

			expect(page?.width).toBeCloseTo(width, 1);
		}
	});

	test("long text continues on new pages", async () => {
		const text = Array.from({ length: 120 }, (_, line) => `renglón ${line + 1}`).join("\n");
		const result = await convertText(encode(text), { fileName: "a.txt", size: "letter", font });

		expect((await PDF.load(result.unwrap().pdf)).getPages().length).toBeGreaterThan(1);
	});

	test("characters outside the font are replaced and the file is marked degraded", async () => {
		const plain = await convertText(encode("Ñandú, acción"), {
			fileName: "a.txt",
			size: "letter",
			font,
		});

		const emoji = await convertText(encode("tarea lista ✅🎉"), {
			fileName: "b.txt",
			size: "letter",
			font,
		});

		expect(plain.unwrap().degraded).toBe(false);
		expect(emoji.unwrap().degraded).toBe(true);
	});
});
