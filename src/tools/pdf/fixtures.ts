import { bundledFontFetch } from "./office-fonts.ts";
import type { ByteReader } from "./office-sniff.ts";

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
	heic: bytes([0x00, 0x00, 0x00, 0x18], "ftypheic", [0x00, 0x00, 0x00, 0x00], "mif1heic"),
	pdf: bytes("%PDF-1.7\n%"),
	pdfWithPreamble: bytes([0xef, 0xbb, 0xbf], "garbage\n%PDF-1.4\n"),
	docx: bytes([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
	ole2: bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
	text: new TextEncoder().encode("Apuntes de biología: la célula ✓\n"),
	binary: bytes([0x00, 0x01, 0x02, 0x03]),
} as const;

/** Reads a slice of in-memory bytes the way `Blob.slice` does: out-of-range ends are clamped. */
export function memoryReader(content: Uint8Array): ByteReader {
	return (start, end) => Promise.resolve(content.slice(start, end));
}

function u16(value: number): Array<number> {
	return [value & 0xff, (value >> 8) & 0xff];
}

function u32(value: number): Array<number> {
	return [...u16(value & 0xffff), ...u16(value >>> 16)];
}

/** A stored (uncompressed) ZIP with empty entries: enough for the central directory to list them. */
export function zipWith(names: ReadonlyArray<string>): Uint8Array<ArrayBuffer> {
	const encoder = new TextEncoder();
	const local: Array<number> = [];
	const central: Array<number> = [];

	for (const name of names) {
		const encoded = [...encoder.encode(name)];
		const offset = local.length;

		local.push(...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u32(0), ...u32(0));
		local.push(...u32(0), ...u32(0), ...u16(encoded.length), ...u16(0), ...encoded);
		central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u32(0));
		central.push(...u32(0), ...u32(0), ...u32(0), ...u16(encoded.length), ...u16(0), ...u16(0));
		central.push(...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...encoded);
	}

	const end = [
		...u32(0x06054b50),
		...u16(0),
		...u16(0),
		...u16(names.length),
		...u16(names.length),
	];

	end.push(...u32(central.length), ...u32(local.length), ...u16(0));

	return Uint8Array.from([...local, ...central, ...end]);
}

export async function officeFixture(name: string): Promise<Uint8Array<ArrayBuffer>> {
	return new Uint8Array(await Bun.file(`tests/fixtures/office/${name}`).arrayBuffer());
}

export function fileFrom(content: Uint8Array<ArrayBuffer>, name: string, mimeType = ""): File {
	return new File([content], name, { type: mimeType });
}

/**
 * Every font path reamkit asked for during the test run. reamkit caches fonts per URL for the
 * whole process, so all tests share one recorder instead of each expecting its own requests.
 */
export const requestedFontPaths: Array<string> = [];

/** Serves the bundled faces from disk, as the site would from /fonts/office/. */
export const fixtureFontFetch = bundledFontFetch("https://kunatta.test", (url) => {
	requestedFontPaths.push(url.pathname);

	return Promise.resolve(new Response(Bun.file(`public${url.pathname}`)));
});
