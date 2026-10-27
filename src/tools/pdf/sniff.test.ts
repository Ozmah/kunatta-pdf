import { describe, expect, test } from "bun:test";

import { signatures } from "./fixtures.ts";
import { looksLikeText, sniffBinary, sniffContainer } from "./sniff.ts";

describe("sniffBinary", () => {
	test("recognizes every supported binary format by its signature", () => {
		expect(sniffBinary(signatures.jpeg)).toBe("jpeg");
		expect(sniffBinary(signatures.png)).toBe("png");
		expect(sniffBinary(signatures.webp)).toBe("webp");
		expect(sniffBinary(signatures.pdf)).toBe("pdf");
	});

	test("finds a PDF header after a preamble", () => {
		expect(sniffBinary(signatures.pdfWithPreamble)).toBe("pdf");
	});

	test("rejects formats outside v1 and truncated input", () => {
		expect(sniffBinary(signatures.gif)).toBeUndefined();
		expect(sniffBinary(signatures.avif)).toBeUndefined();
		expect(sniffBinary(signatures.heic)).toBeUndefined();
		expect(sniffBinary(signatures.docx)).toBeUndefined();
		expect(sniffBinary(signatures.text)).toBeUndefined();
		expect(sniffBinary(new Uint8Array([0xff, 0xd8]))).toBeUndefined();
		expect(sniffBinary(new Uint8Array())).toBeUndefined();
	});
});

describe("sniffContainer", () => {
	test("spots ZIP and OLE2 archives, which may hold Office documents", () => {
		expect(sniffContainer(signatures.docx)).toBe("zip");
		expect(sniffContainer(signatures.ole2)).toBe("cfb");
		expect(sniffContainer(signatures.pdf)).toBeUndefined();
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
