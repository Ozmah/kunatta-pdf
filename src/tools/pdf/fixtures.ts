// Minimal byte prefixes for each supported format. Only the signatures matter to the sniffer.
function bytes(...parts: ReadonlyArray<string | ReadonlyArray<number>>): Uint8Array<ArrayBuffer> {
	const codes = parts.flatMap((part) =>
		Array.isArray(part)
			? [...part]
			: Array.from(String(part), (character) => character.charCodeAt(0)),
	);

	return Uint8Array.from(codes);
}

export const signatures = {
	jpeg: bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], "JFIF"),
	png: bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]),
	gif: bytes("GIF89a", [0x01, 0x00]),
	webp: bytes("RIFF", [0x24, 0x00, 0x00, 0x00], "WEBPVP8 "),
	avif: bytes([0x00, 0x00, 0x00, 0x1c], "ftypavif", [0x00, 0x00, 0x00, 0x00], "avifmif1miaf"),
	avifCompatible: bytes([0x00, 0x00, 0x00, 0x18], "ftypmif1", [0x00, 0x00, 0x00, 0x00], "mif1avif"),
	heic: bytes([0x00, 0x00, 0x00, 0x18], "ftypheic", [0x00, 0x00, 0x00, 0x00], "mif1heic"),
	pdf: bytes("%PDF-1.7\n%"),
	pdfWithPreamble: bytes([0xef, 0xbb, 0xbf], "garbage\n%PDF-1.4\n"),
	docx: bytes([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
	text: new TextEncoder().encode("Apuntes de biología: la célula ✓\n"),
	binary: bytes([0x00, 0x01, 0x02, 0x03]),
} as const;

export function fileFrom(content: Uint8Array<ArrayBuffer>, name: string, mimeType = ""): File {
	return new File([content], name, { type: mimeType });
}
