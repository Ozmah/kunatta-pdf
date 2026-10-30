import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PDF } from "@libpdf/core";

/** A file the tests hand to the page; the same shape Playwright's setInputFiles accepts. */
export interface Sample {
	readonly name: string;
	readonly mimeType: string;
	readonly buffer: Buffer;
}

export interface PageSize {
	readonly width: number;
	readonly height: number;
}

export const officeSamples = {
	doc: "SampleDoc.doc",
	docx: "SampleDoc.docx",
	xls: "SampleSS.xls",
	xlsx: "SampleSS.xlsx",
	ppt: "SampleShow.ppt",
	pptx: "SampleShow.pptx",
	protectedDocx: "bug53475-password-is-pass.docx",
} as const;

/** The password of `officeSamples.protectedDocx`, as its Apache POI file name says. */
export const protectedDocxPassword = "pass";

const officeDirectory = join(import.meta.dirname, "..", "..", "tests", "fixtures", "office");

export async function office(fileName: string, name = fileName): Promise<Sample> {
	return { name, mimeType: "", buffer: await readFile(join(officeDirectory, fileName)) };
}

/** A PDF with one page per size, optionally protected with a user password. */
export async function pdf(
	name: string,
	pages: ReadonlyArray<PageSize>,
	password?: string,
): Promise<Sample> {
	const document = PDF.create();

	for (const { width, height } of pages) document.addPage({ width, height });

	if (password !== undefined) document.setProtection({ userPassword: password });

	return { name, mimeType: "application/pdf", buffer: Buffer.from(await document.save()) };
}

export function text(name: string, content: string): Sample {
	return { name, mimeType: "text/plain", buffer: Buffer.from(content, "utf8") };
}

export function bytes(name: string, content: ReadonlyArray<number>, mimeType = ""): Sample {
	return { name, mimeType, buffer: Buffer.from(content) };
}

/** Starts like a JPEG, then garbage: passes the signature check and fails to decode. */
export function brokenJpeg(name: string): Sample {
	return bytes(
		name,
		[0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 1, 2, 3, 4, 5, 6],
		"image/jpeg",
	);
}

export interface PageReport {
	readonly encrypted: boolean;
	/** False when the PDF is protected and `password` is missing or wrong. */
	readonly opened: boolean;
	readonly pages: ReadonlyArray<PageSize>;
}

/** Reads a PDF the tool produced, the way a viewer would: sizes are as displayed (rotation applied). */
export async function inspect(content: Buffer, password?: string): Promise<PageReport> {
	const document = await PDF.load(
		new Uint8Array(content),
		password === undefined ? {} : { credentials: password },
	);

	const opened = !document.isEncrypted || document.isAuthenticated;

	const pages = opened
		? document
				.getPages()
				.map((page) => ({ width: Math.round(page.width), height: Math.round(page.height) }))
		: [];

	return { encrypted: document.isEncrypted, opened, pages };
}

/** US Letter and A4 in points, portrait. */
export const letter: PageSize = { width: 612, height: 792 };

export const a4: PageSize = { width: 595, height: 842 };

export function landscape(size: PageSize): PageSize {
	return { width: size.height, height: size.width };
}
