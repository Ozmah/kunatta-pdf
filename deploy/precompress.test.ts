import { describe, expect, test } from "bun:test";

import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";

import { compressedCopies, precompress, shouldCompress } from "./precompress.ts";

describe("shouldCompress", () => {
	test("takes text and fonts above a kilobyte", () => {
		expect(shouldCompress("dist/_astro/office.js", 1_400_000)).toBe(true);
		expect(shouldCompress("dist/fonts/office/Arimo_400Regular.TTF", 400_000)).toBe(true);
	});

	test("skips tiny files and formats that are already compressed", () => {
		expect(shouldCompress("dist/robots.txt", 80)).toBe(false);
		expect(shouldCompress("dist/_astro/fonts/inter.woff2", 50_000)).toBe(false);
		expect(shouldCompress("dist/photo.png", 50_000)).toBe(false);
	});
});

describe("compressedCopies", () => {
	test("keeps only copies smaller than the original, and they decode back", () => {
		const text = Buffer.from("kunatta ".repeat(500));
		const copies = new Map(compressedCopies(text));

		expect([...copies.keys()]).toEqual([".zst", ".br", ".gz"]);
		expect(zstdDecompressSync(copies.get(".zst") ?? Buffer.alloc(0)).equals(text)).toBe(true);
	});

	test("drops every copy of bytes that do not compress", () => {
		expect(compressedCopies(Buffer.from(crypto.getRandomValues(new Uint8Array(4096))))).toEqual([]);
	});
});

describe("precompress", () => {
	test("writes the copies next to each file, in nested folders too", async () => {
		const root = await mkdtemp(join(tmpdir(), "kunatta-precompress-"));

		try {
			await mkdir(join(root, "es"));
			await writeFile(join(root, "a.js"), "export const a = 1;\n".repeat(200));
			await writeFile(join(root, "es", "index.html"), "<p>hola</p>\n".repeat(200));
			await writeFile(join(root, "tiny.css"), "a{}");

			expect(await precompress(root)).toBe(6);
			expect((await readdir(root, { recursive: true })).toSorted()).toEqual([
				"a.js",
				"a.js.br",
				"a.js.gz",
				"a.js.zst",
				"es",
				"es/index.html",
				"es/index.html.br",
				"es/index.html.gz",
				"es/index.html.zst",
				"tiny.css",
			]);
		} finally {
			await rm(root, { recursive: true });
		}
	});
});
