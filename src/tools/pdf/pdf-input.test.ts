import { describe, expect, test } from "bun:test";

import { PDF } from "@libpdf/core";

import { ConversionFailed, PasswordRequired } from "./errors.ts";
import { openPdf } from "./pdf-input.ts";

async function samplePdf(password?: string): Promise<Uint8Array> {
	const pdf = PDF.create();

	pdf.addPage({ size: "a4" });
	pdf.addPage({ size: "letter" });

	if (password !== undefined) pdf.setProtection({ userPassword: password });

	return pdf.save();
}

describe("openPdf", () => {
	test("an unprotected PDF passes through untouched", async () => {
		const bytes = await samplePdf();
		const result = await openPdf(bytes, { fileName: "apuntes.pdf" });

		expect(result.unwrap().pdf).toBe(bytes);
	});

	test("a protected PDF asks for its password, also when the password is wrong", async () => {
		const bytes = await samplePdf("secreto");
		const missing = await openPdf(bytes, { fileName: "constancia.pdf" });
		const wrong = await openPdf(bytes, { fileName: "constancia.pdf", password: "otro" });

		expect(missing.isErr() && PasswordRequired.is(missing.error)).toBe(true);
		expect(wrong.isErr() && PasswordRequired.is(wrong.error)).toBe(true);
	});

	test("with the right password the result keeps every page and no encryption", async () => {
		const opened = await openPdf(await samplePdf("secreto"), {
			fileName: "constancia.pdf",
			password: "secreto",
		});

		const reloaded = await PDF.load(opened.unwrap().pdf);

		expect(reloaded.isEncrypted).toBe(false);
		expect(reloaded.getPages()).toHaveLength(2);
	});

	test("bytes that are not a PDF fail with ConversionFailed", async () => {
		const result = await openPdf(new Uint8Array([1, 2, 3]), { fileName: "roto.pdf" });

		expect(result.isErr() && ConversionFailed.is(result.error)).toBe(true);
	});
});
