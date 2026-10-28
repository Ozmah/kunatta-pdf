import { describe, expect, test } from "bun:test";

import { PDF } from "@libpdf/core";

import { ConversionFailed } from "./errors.ts";
import { tinyJpeg, tinyPng } from "./fixtures.ts";
import { convertImage, fitWithin, type DecodeImage } from "./image.ts";

interface Decoded {
	readonly maxSide: number | undefined;
	readonly encodedAs: string;
}

/** A decoder that reports what it was asked for and hands back a real tiny image. */
function fakeDecoder(width: number, height: number, seen: Array<Decoded>): DecodeImage {
	return (_bytes, _kind, maxSide) => {
		const size = fitWithin(width, height, maxSide);

		return Promise.resolve({
			...size,
			encode(type) {
				seen.push({ maxSide, encodedAs: type });

				return Promise.resolve(type === "image/png" ? tinyPng : tinyJpeg);
			},
			close: () => undefined,
		});
	};
}

async function firstPageSize(pdf: Uint8Array): Promise<[number, number]> {
	const [page] = (await PDF.load(pdf)).getPages();

	return [page?.width ?? 0, page?.height ?? 0];
}

describe("fitWithin", () => {
	test("reduces the longest side and keeps the proportion", () => {
		expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
		expect(fitWithin(3000, 4000, 2400)).toEqual({ width: 1800, height: 2400 });
	});

	test("never enlarges, and Máxima keeps the original size", () => {
		expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
		expect(fitWithin(4000, 3000, undefined)).toEqual({ width: 4000, height: 3000 });
	});
});

describe("convertImage", () => {
	test("Normal reduces a 12 MP photo to 2400 px and sizes the page at 96 DPI", async () => {
		const seen: Array<Decoded> = [];

		const result = await convertImage(new Uint8Array(8), {
			fileName: "pizarron.jpg",
			kind: "jpeg",
			quality: "normal",
			decode: fakeDecoder(4000, 3000, seen),
		});

		expect(seen).toEqual([{ maxSide: 2400, encodedAs: "image/jpeg" }]);
		expect(await firstPageSize(result.unwrap().pdf)).toEqual([1800, 1350]);
	});

	test("PNG stays PNG only at Máxima; lighter qualities turn it into JPEG", async () => {
		const seen: Array<Decoded> = [];
		const decode = fakeDecoder(100, 100, seen);

		await convertImage(new Uint8Array(8), {
			fileName: "a.png",
			kind: "png",
			quality: "max",
			decode,
		});
		await convertImage(new Uint8Array(8), {
			fileName: "b.png",
			kind: "png",
			quality: "light",
			decode,
		});
		await convertImage(new Uint8Array(8), {
			fileName: "c.webp",
			kind: "webp",
			quality: "max",
			decode,
		});

		expect(seen.map((entry) => entry.encodedAs)).toEqual(["image/png", "image/jpeg", "image/jpeg"]);
	});

	test("an image the browser cannot decode fails with ConversionFailed", async () => {
		const result = await convertImage(new Uint8Array(8), {
			fileName: "rota.jpg",
			kind: "jpeg",
			quality: "normal",
			decode: () => Promise.reject(new Error("The source image could not be decoded.")),
		});

		expect(result.isErr() && ConversionFailed.is(result.error)).toBe(true);
	});
});
