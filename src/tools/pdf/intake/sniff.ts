import type { InputKind, OfficeFormat } from "../contract/kinds.ts";

/** Archives that may hold an Office document; their entries decide the exact format. */
export type Container = "zip" | "cfb";

/** Bytes read from the start of each file; enough for every signature below. */
export const sniffLength = 4096;

const pdfHeaderWindow = 1024;

function matchesAt(bytes: Uint8Array, signature: ReadonlyArray<number>, offset: number): boolean {
	if (bytes.length < offset + signature.length) return false;

	return signature.every((byte, index) => bytes[offset + index] === byte);
}

function asciiCodes(text: string): ReadonlyArray<number> {
	return Array.from(text, (character) => character.charCodeAt(0));
}

function asciiAt(bytes: Uint8Array, text: string, offset: number): boolean {
	return matchesAt(bytes, asciiCodes(text), offset);
}

function isPdf(bytes: Uint8Array): boolean {
	const marker = asciiCodes("%PDF-");
	const last = Math.min(bytes.length, pdfHeaderWindow) - marker.length;

	// The spec tolerates leading garbage before the header within the first kilobyte.
	for (let offset = 0; offset <= last; offset += 1) {
		if (matchesAt(bytes, marker, offset)) return true;
	}

	return false;
}

/** Identifies a binary format by its signature, never by its name or declared MIME type. */
export function sniffBinary(
	bytes: Uint8Array,
): Exclude<InputKind, "text" | OfficeFormat> | undefined {
	if (matchesAt(bytes, [0xff, 0xd8, 0xff], 0)) return "jpeg";

	if (matchesAt(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)) return "png";

	if (asciiAt(bytes, "RIFF", 0) && asciiAt(bytes, "WEBP", 8)) return "webp";

	if (isPdf(bytes)) return "pdf";

	return undefined;
}

/** ZIP (local file header or an empty archive) and OLE2 compound files. */
export function sniffContainer(bytes: Uint8Array): Container | undefined {
	if (
		matchesAt(bytes, [0x50, 0x4b, 0x03, 0x04], 0) ||
		matchesAt(bytes, [0x50, 0x4b, 0x05, 0x06], 0)
	) {
		return "zip";
	}

	if (matchesAt(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0)) return "cfb";

	return undefined;
}

/** Plain text has no signature: it must be valid UTF-8 without NUL bytes. */
export function looksLikeText(bytes: Uint8Array): boolean {
	if (bytes.includes(0)) return false;

	// A multi-byte character may be cut at the end of the sample; `stream` tolerates that.
	try {
		new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true });

		return true;
	} catch {
		return false;
	}
}
