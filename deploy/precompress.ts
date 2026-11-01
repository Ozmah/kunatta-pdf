// Writes .zst, .br and .gz next to every compressible file in the built site, so Caddy serves
// them as they are (`file_server { precompressed }`) instead of compressing on every request.
// Plain Node, so it runs in the image's build stage: `node deploy/precompress.ts dist`.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { brotliCompressSync, constants, gzipSync, zstdCompressSync } from "node:zlib";

const compressible = new Set([".html", ".js", ".css", ".svg", ".xml", ".txt", ".ttf", ".json"]);

/** Below this a compressed copy saves less than the headers it costs. */
const minimumBytes = 1024;

const encoders: ReadonlyArray<readonly [string, (bytes: Buffer) => Buffer]> = [
	[
		".zst",
		(bytes) => zstdCompressSync(bytes, { params: { [constants.ZSTD_c_compressionLevel]: 19 } }),
	],
	[
		".br",
		(bytes) => brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
	],
	[".gz", (bytes) => gzipSync(bytes, { level: 9 })],
];

export function shouldCompress(path: string, size: number): boolean {
	return compressible.has(extname(path).toLowerCase()) && size >= minimumBytes;
}

/** Every copy that is smaller than the original, keyed by the suffix it is saved under. */
export function compressedCopies(bytes: Buffer): ReadonlyArray<readonly [string, Buffer]> {
	return encoders.flatMap(([suffix, encode]) => {
		const copy = encode(bytes);

		return copy.length < bytes.length ? [[suffix, copy] as const] : [];
	});
}

export async function precompress(root: string): Promise<number> {
	const entries = await readdir(root, { recursive: true, withFileTypes: true });
	let written = 0;

	for (const entry of entries) {
		if (!entry.isFile()) continue;

		const path = join(entry.parentPath, entry.name);
		const bytes = await readFile(path);

		if (!shouldCompress(path, bytes.length)) continue;

		for (const [suffix, copy] of compressedCopies(bytes)) {
			await writeFile(`${path}${suffix}`, copy);
			written += 1;
		}
	}

	return written;
}

if (import.meta.main === true) {
	const root = process.argv[2] ?? "dist";

	console.log(`Precompressed ${await precompress(root)} files in ${root}`);
}
