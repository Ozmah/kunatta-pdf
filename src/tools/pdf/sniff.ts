/** File kinds the PDF tool can turn into pages. */
export type InputKind = "jpeg" | "png" | "gif" | "webp" | "avif" | "pdf" | "text";

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

function isAvif(bytes: Uint8Array): boolean {
	if (!asciiAt(bytes, "ftyp", 4)) return false;

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const boxEnd = Math.min(view.getUint32(0), bytes.length);

	// Major brand at 8, minor version at 12, compatible brands from 16 in steps of 4.
	for (let offset = 8; offset + 4 <= boxEnd; offset += offset === 8 ? 8 : 4) {
		if (asciiAt(bytes, "avif", offset) || asciiAt(bytes, "avis", offset)) return true;
	}

	return false;
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
export function sniffBinary(bytes: Uint8Array): InputKind | undefined {
	if (matchesAt(bytes, [0xff, 0xd8, 0xff], 0)) return "jpeg";

	if (matchesAt(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)) return "png";

	if (asciiAt(bytes, "GIF87a", 0) || asciiAt(bytes, "GIF89a", 0)) return "gif";

	if (asciiAt(bytes, "RIFF", 0) && asciiAt(bytes, "WEBP", 8)) return "webp";

	if (isAvif(bytes)) return "avif";

	if (isPdf(bytes)) return "pdf";

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
