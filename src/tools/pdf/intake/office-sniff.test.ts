import { describe, expect, test } from "bun:test";

import { memoryReader, officeFixture, zipWith } from "../../../../tests/support/pdf-fixtures.ts";
import { cfbEntryNames, cfbFormat, ooxmlFromEntries, zipEntryNames } from "./office-sniff.ts";

async function ooxml(content: Uint8Array): Promise<string | undefined> {
	const names = await zipEntryNames(memoryReader(content), content.length);

	return names === undefined ? undefined : ooxmlFromEntries(names);
}

async function legacy(content: Uint8Array, fileName: string): Promise<string | undefined> {
	return cfbFormat(await cfbEntryNames(memoryReader(content)), fileName);
}

describe("OOXML", () => {
	test.each([
		["SampleDoc.docx", "docx"],
		["SampleSS.xlsx", "xlsx"],
		["SampleShow.pptx", "pptx"],
	])("reads %s as %s from its central directory", async (name, format) => {
		expect(await ooxml(await officeFixture(name))).toBe(format);
	});

	test("requires [Content_Types].xml: ODF, EPUB and plain ZIPs are not Office", async () => {
		expect(await ooxml(zipWith(["mimetype", "content.xml", "styles.xml"]))).toBeUndefined();
		expect(await ooxml(zipWith(["mimetype", "META-INF/container.xml"]))).toBeUndefined();
		expect(await ooxml(zipWith(["word/notes.txt"]))).toBeUndefined();
		expect(await ooxml(zipWith(["[Content_Types].xml", "xl/workbook.xml"]))).toBe("xlsx");
	});

	test("a ZIP without its central directory is not readable", async () => {
		const truncated = (await officeFixture("SampleDoc.docx")).slice(0, 4096);

		expect(await zipEntryNames(memoryReader(truncated), truncated.length)).toBeUndefined();
	});
});

describe("OLE2", () => {
	test.each([
		["SampleDoc.doc", "doc"],
		["SampleSS.xls", "xls"],
		["SampleShow.ppt", "ppt"],
	])("reads %s as %s from its stream names", async (name, format) => {
		expect(await legacy(await officeFixture(name), name)).toBe(format);
	});

	test("an encrypted OOXML package takes its type from the file name", async () => {
		const encrypted = await officeFixture("bug53475-password-is-pass.docx");

		expect(await legacy(encrypted, "tarea.docx")).toBe("docx");
		expect(await legacy(encrypted, "tarea.bin")).toBeUndefined();
	});

	test("a compound file without Office streams is not Office", async () => {
		const document = await officeFixture("SampleDoc.doc");
		const renamed = document.slice();
		// The directory stores names as UTF-16LE.
		const target = Array.from("WordDocument", (character) => [character.charCodeAt(0), 0]).flat();

		const at = renamed.findIndex((_, index) =>
			target.every((byte, offset) => renamed[index + offset] === byte),
		);

		expect(at).toBeGreaterThan(0);
		renamed.set(new Uint8Array(target.length).fill(0x41), at);

		expect(await legacy(renamed, "a.doc")).toBeUndefined();
	});

	test("truncated or malformed compound files end quietly", async () => {
		const document = await officeFixture("SampleDoc.doc");

		expect(await cfbEntryNames(memoryReader(document.slice(0, 300)))).toEqual([]);
		expect(await legacy(document.slice(0, 1024), "a.doc")).toBeUndefined();
	});
});
