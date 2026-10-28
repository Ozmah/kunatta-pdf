import { describe, expect, test } from "bun:test";

import type { OfficeFormat } from "./office-sniff.ts";
import { ConversionFailed, PasswordRequired } from "./errors.ts";
import { fixtureFontFetch, requestedFontPaths } from "./fixtures.ts";
import { convertOffice } from "./office.ts";

const fixtures = "tests/fixtures/office";
const fontFetch = fixtureFontFetch;

async function fixture(name: string): Promise<Uint8Array> {
	return new Uint8Array(await Bun.file(`${fixtures}/${name}`).arrayBuffer());
}

function isPdf(bytes: Uint8Array): boolean {
	return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}

const samples: ReadonlyArray<[string, OfficeFormat]> = [
	["SampleDoc.docx", "docx"],
	["SampleDoc.doc", "doc"],
	["SampleSS.xlsx", "xlsx"],
	["SampleSS.xls", "xls"],
	["SampleShow.pptx", "pptx"],
	["SampleShow.ppt", "ppt"],
];

describe("convertOffice", () => {
	test.each(samples)("converts %s to a PDF", async (name, format) => {
		const result = await convertOffice(await fixture(name), { fileName: name, fontFetch });

		expect(result.isOk()).toBe(true);
		const value = result.unwrap();
		expect(value.format).toBe(format);
		expect(isPdf(value.pdf)).toBe(true);
	});

	test("only requests bundled faces", () => {
		expect(requestedFontPaths.length).toBeGreaterThan(0);
		expect(requestedFontPaths.every((path) => path.startsWith("/fonts/office/"))).toBe(true);
	});

	test("reports legacy Word as degraded and OOXML Word as faithful", async () => {
		const legacy = await convertOffice(await fixture("SampleDoc.doc"), {
			fileName: "a.doc",
			fontFetch,
		});

		const modern = await convertOffice(await fixture("SampleDoc.docx"), {
			fileName: "a.docx",
			fontFetch,
		});

		expect(legacy.unwrap().degraded).toBe(true);
		expect(modern.unwrap().degraded).toBe(false);
	});

	test("asks for a password when an encrypted document arrives without one", async () => {
		const name = "bug53475-password-is-pass.docx";
		const locked = await convertOffice(await fixture(name), { fileName: name, fontFetch });

		const opened = await convertOffice(await fixture(name), {
			fileName: name,
			fontFetch,
			password: "pass",
		});

		expect(locked.isErr() && PasswordRequired.is(locked.error)).toBe(true);
		expect(opened.isOk()).toBe(true);
	});

	test("fails with ConversionFailed for a damaged file", async () => {
		const damaged = (await fixture("SampleDoc.docx")).subarray(0, 2048);
		const result = await convertOffice(damaged, { fileName: "broken.docx", fontFetch });

		expect(result.isErr() && ConversionFailed.is(result.error)).toBe(true);
	});

	test("refuses a PDF, which belongs to @libpdf/core", async () => {
		const pdf = (
			await convertOffice(await fixture("SampleDoc.docx"), { fileName: "a.docx", fontFetch })
		).unwrap().pdf;

		const result = await convertOffice(pdf, { fileName: "a.pdf", fontFetch });

		expect(result.isErr() && ConversionFailed.is(result.error)).toBe(true);
	});
});
