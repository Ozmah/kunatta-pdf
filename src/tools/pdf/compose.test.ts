import { describe, expect, test } from "bun:test";

import { PDF } from "@libpdf/core";

import { composePdf, fitOnSheet } from "./compose.ts";
import { pdfBlob } from "./protocol.ts";
import { CompositionFailed } from "./errors.ts";

interface PageSpec {
	readonly width: number;
	readonly height: number;
	readonly rotate?: number;
}

async function part(...pages: ReadonlyArray<PageSpec>): Promise<Blob> {
	const pdf = PDF.create();

	for (const page of pages) pdf.addPage(page);

	return pdfBlob(await pdf.save());
}

async function sizes(bytes: Uint8Array, password?: string): Promise<Array<[number, number]>> {
	const pdf = await PDF.load(bytes, password === undefined ? {} : { credentials: password });

	return pdf.getPages().map((page) => [Math.round(page.width), Math.round(page.height)]);
}

describe("fitOnSheet", () => {
	test("scales to the limiting side and centers the rest", () => {
		expect(fitOnSheet({ width: 1000, height: 500 }, { width: 500, height: 500 })).toEqual({
			x: 0,
			y: 125,
			width: 500,
			height: 250,
		});
	});
});

describe("composePdf", () => {
	test("Letter puts every page on a Letter sheet, landscape when the page is wider", async () => {
		const parts = [
			await part({ width: 595, height: 842 }),
			await part({ width: 960, height: 540 }),
		];

		const result = await composePdf(parts, { fileName: "tarea.pdf", size: "letter" });

		expect(result.unwrap().pages).toBe(2);
		expect(await sizes(result.unwrap().pdf)).toEqual([
			[612, 792],
			[792, 612],
		]);
	});

	test("a page rotated in its source counts with its visible orientation", async () => {
		const result = await composePdf([await part({ width: 595, height: 842, rotate: 90 })], {
			fileName: "tarea.pdf",
			size: "a4",
		});

		expect(await sizes(result.unwrap().pdf)).toEqual([[842, 595]]);
	});

	test("Original keeps every page as it came, in list order", async () => {
		const parts = [
			await part({ width: 300, height: 400 }, { width: 500, height: 200 }),
			await part({ width: 100, height: 100 }),
		];

		const result = await composePdf(parts, { fileName: "tarea.pdf", size: "original" });

		expect(await sizes(result.unwrap().pdf)).toEqual([
			[300, 400],
			[500, 200],
			[100, 100],
		]);
	});

	test("a password encrypts the result and opens it again", async () => {
		const result = await composePdf([await part({ width: 595, height: 842 })], {
			fileName: "tarea.pdf",
			size: "a4",
			password: "s3creta",
		});

		const pdf = result.unwrap().pdf;

		expect((await PDF.load(pdf)).isAuthenticated).toBe(false);
		expect((await PDF.load(pdf, { credentials: "s3creta" })).isAuthenticated).toBe(true);
	});

	test("a damaged part fails with CompositionFailed", async () => {
		const result = await composePdf([new Blob(["%PDF-roto"])], {
			fileName: "tarea.pdf",
			size: "letter",
		});

		expect(result.isErr() && CompositionFailed.is(result.error)).toBe(true);
	});
});
