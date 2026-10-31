import { describe, expect, test } from "bun:test";

import type { OfficeFormat } from "../../intake/office-sniff.ts";
import { fixtureFontFetch, requestedFontPaths } from "../../../../../tests/support/pdf-fixtures.ts";
import { WrongPasswordError } from "reamkit";

import { ConversionFailed, EngineUnavailable, PasswordRequired } from "../../contract/errors.ts";
import { bundledFontFetch } from "../office-fonts.ts";
import { convertOffice, isDegraded, officeFailure, watchFonts } from "./office.ts";

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

	test("reports every legacy format as degraded and every OOXML one as faithful", async () => {
		for (const [legacy, modern] of [
			["SampleDoc.doc", "SampleDoc.docx"],
			["SampleSS.xls", "SampleSS.xlsx"],
			["SampleShow.ppt", "SampleShow.pptx"],
		] as const) {
			const old = await convertOffice(await fixture(legacy), { fileName: legacy, fontFetch });
			const current = await convertOffice(await fixture(modern), { fileName: modern, fontFetch });

			expect(old.unwrap().degraded).toBe(true);
			expect(current.unwrap().degraded).toBe(false);
		}
	});

	test("a legacy format is degraded even when reamkit reports no loss", () => {
		const substituted = [
			{ severity: "substituted", feature: "font", detail: "Calibri → Carlito" },
		] as const;

		expect(isDegraded("xls", [])).toBe(true);
		expect(isDegraded("xlsx", [])).toBe(false);
		expect(isDegraded("docx", substituted)).toBe(false);
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

// reamkit caches faces for the whole process, so "offline" cannot be staged through convertOffice
// here; the e2e suite covers it on a fresh worker.
describe("fonts that do not load", () => {
	const cdn = "https://cdn.example/arimo/Arimo_400Regular.ttf";
	const cjk = "https://cdn.example/noto/NotoSansJP_400Regular.ttf";

	test("a bundled face that fails or answers 404 is remembered; one we do not bundle is not", async () => {
		const offline = watchFonts(
			bundledFontFetch("https://kunatta.test", () =>
				Promise.reject(new TypeError("Failed to fetch")),
			),
		);

		const missingFile = watchFonts(
			bundledFontFetch("https://kunatta.test", () =>
				Promise.resolve(new Response("", { status: 404 })),
			),
		);

		await expect(offline.fetch(cdn)).rejects.toThrow("Failed to fetch");
		await missingFile.fetch(cdn);
		await missingFile.fetch(cjk);

		expect(offline.failure()).toBe("Failed to fetch");
		expect(missingFile.failure()).toBe(`${cdn} did not load`);

		const unbundledOnly = watchFonts(bundledFontFetch("https://kunatta.test"));

		await unbundledOnly.fetch(cjk);
		expect(unbundledOnly.failure()).toBeUndefined();
	});

	test("a font failure reports the converter as unavailable, unless the password was wrong", () => {
		const generic = new Error("Failed to download font");

		expect(EngineUnavailable.is(officeFailure("a.docx", generic, "Failed to fetch"))).toBe(true);
		expect(ConversionFailed.is(officeFailure("a.docx", generic, undefined))).toBe(true);
		expect(
			PasswordRequired.is(
				officeFailure("a.docx", new WrongPasswordError("wrong"), "Failed to fetch"),
			),
		).toBe(true);
	});
});
