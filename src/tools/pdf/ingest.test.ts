import { describe, expect, test } from "bun:test";

import { signatures } from "./fixtures.ts";
import { classify, EmptyFile, FileTooLarge, limits, UnsupportedFile } from "./ingest.ts";

describe("classify", () => {
	test("trusts content over the name: a PNG renamed to .jpg is a PNG", () => {
		const verdict = classify({
			name: "foto.jpg",
			mimeType: "image/jpeg",
			size: 10,
			head: signatures.png,
		});

		expect(verdict.isOk() && verdict.value).toBe("png");
	});

	test("accepts text only when it is declared as text and decodes cleanly", () => {
		const declared = classify({ name: "notas.txt", mimeType: "", size: 10, head: signatures.text });
		const undeclared = classify({ name: "notas", mimeType: "", size: 10, head: signatures.text });

		expect(declared.isOk() && declared.value).toBe("text");
		expect(undeclared.isErr() && UnsupportedFile.is(undeclared.error)).toBe(true);
	});

	test("rejects empty and oversized files before reading their content", () => {
		const empty = classify({ name: "a.pdf", mimeType: "", size: 0, head: signatures.pdf });

		const huge = classify({
			name: "b.pdf",
			mimeType: "",
			size: limits.fileBytes + 1,
			head: signatures.pdf,
		});

		expect(empty.isErr() && EmptyFile.is(empty.error)).toBe(true);
		expect(huge.isErr() && FileTooLarge.is(huge.error) && huge.error.limit).toBe(limits.fileBytes);
	});

	test("rejects office documents and HEIC in v1", () => {
		const docx = classify({ name: "tarea.docx", mimeType: "", size: 10, head: signatures.docx });
		const heic = classify({ name: "IMG_0001.heic", mimeType: "", size: 10, head: signatures.heic });

		expect(docx.isErr() && UnsupportedFile.is(docx.error)).toBe(true);
		expect(heic.isErr() && UnsupportedFile.is(heic.error)).toBe(true);
	});
});
