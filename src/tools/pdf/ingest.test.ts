import { describe, expect, test } from "bun:test";

import { memoryReader, officeFixture, signatures, zipWith } from "./fixtures.ts";
import {
	classify,
	EmptyFile,
	FileTooLarge,
	limits,
	UnsupportedFile,
	type Candidate,
} from "./ingest.ts";

function candidate(
	name: string,
	content: Uint8Array,
	mimeType = "",
	size = content.length,
): Candidate {
	return { name, mimeType, size, read: memoryReader(content) };
}

describe("classify", () => {
	test("trusts content over the name: a PNG renamed to .jpg is a PNG", async () => {
		const verdict = await classify(candidate("foto.jpg", signatures.png, "image/jpeg"));

		expect(verdict.isOk() && verdict.value).toBe("png");
	});

	test("accepts text only when it is declared as text and decodes cleanly", async () => {
		const declared = await classify(candidate("notas.txt", signatures.text));
		const undeclared = await classify(candidate("notas", signatures.text));

		expect(declared.isOk() && declared.value).toBe("text");
		expect(undeclared.isErr() && UnsupportedFile.is(undeclared.error)).toBe(true);
	});

	test("rejects empty and oversized files before reading their content", async () => {
		const empty = await classify(candidate("a.pdf", signatures.pdf, "", 0));
		const huge = await classify(candidate("b.pdf", signatures.pdf, "", limits.fileBytes + 1));

		expect(empty.isErr() && EmptyFile.is(empty.error)).toBe(true);
		expect(huge.isErr() && FileTooLarge.is(huge.error) && huge.error.limit).toBe(limits.fileBytes);
	});

	test("accepts Office documents by their content, whatever their name", async () => {
		const word = await classify(candidate("tarea", await officeFixture("SampleDoc.docx")));
		const slides = await classify(candidate("expo.pdf", await officeFixture("SampleShow.ppt")));

		expect(word.isOk() && word.value).toBe("docx");
		expect(slides.isOk() && slides.value).toBe("ppt");
	});

	test("rejects GIF, AVIF, HEIC, OpenDocument and archives that are not Office", async () => {
		const rejected = await Promise.all([
			classify(candidate("a.gif", signatures.gif)),
			classify(candidate("b.avif", signatures.avif)),
			classify(candidate("IMG_0001.heic", signatures.heic)),
			classify(candidate("c.odt", zipWith(["mimetype", "content.xml"]))),
			classify(candidate("d.docx", signatures.docx)),
		]);

		expect(rejected.every((verdict) => verdict.isErr() && UnsupportedFile.is(verdict.error))).toBe(
			true,
		);
	});
});
