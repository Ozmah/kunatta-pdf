import { describe, expect, test } from "bun:test";

import { signatures } from "./fixtures.ts";
import { looksLikeText, sniffBinary } from "./sniff.ts";

describe("sniffBinary", () => {
	test("recognizes every supported binary format by its signature", () => {
		expect(sniffBinary(signatures.jpeg)).toBe("jpeg");
		expect(sniffBinary(signatures.png)).toBe("png");
		expect(sniffBinary(signatures.gif)).toBe("gif");
		expect(sniffBinary(signatures.webp)).toBe("webp");
		expect(sniffBinary(signatures.avif)).toBe("avif");
		expect(sniffBinary(signatures.pdf)).toBe("pdf");
	});

	test("finds AVIF in the compatible brands and PDF after a preamble", () => {
		expect(sniffBinary(signatures.avifCompatible)).toBe("avif");
		expect(sniffBinary(signatures.pdfWithPreamble)).toBe("pdf");
	});

	test("rejects formats outside v1 and truncated input", () => {
		expect(sniffBinary(signatures.heic)).toBeUndefined();
		expect(sniffBinary(signatures.docx)).toBeUndefined();
		expect(sniffBinary(signatures.text)).toBeUndefined();
		expect(sniffBinary(new Uint8Array([0xff, 0xd8]))).toBeUndefined();
		expect(sniffBinary(new Uint8Array())).toBeUndefined();
	});
});

describe("looksLikeText", () => {
	test("accepts UTF-8 text, including a character cut at the end of the sample", () => {
		expect(looksLikeText(signatures.text)).toBe(true);
		expect(looksLikeText(signatures.text.slice(0, -2))).toBe(true);
	});

	test("rejects NUL bytes and invalid UTF-8", () => {
		expect(looksLikeText(signatures.binary)).toBe(false);
		expect(looksLikeText(new Uint8Array([0x41, 0xc3, 0x28, 0x42]))).toBe(false);
	});
});
