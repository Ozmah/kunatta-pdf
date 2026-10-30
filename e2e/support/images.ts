import type { Page } from "@playwright/test";

import type { Sample } from "./samples.ts";

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export interface ImageSpec {
	readonly width: number;
	readonly height: number;
	readonly type: ImageType;
	/** Random pixels: real photos barely compress, flat colors would hide quality changes. */
	readonly noise?: boolean;
}

/** Encodes an image with the browser under test, so no image library is needed in Node. */
export async function image(page: Page, name: string, spec: ImageSpec): Promise<Sample> {
	const base64 = await page.evaluate(async ({ width, height, type, noise }) => {
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d");

		if (context === null) throw new Error("No 2D context to draw the sample");

		if (noise === true) {
			const pixels = context.createImageData(width, height);

			for (let index = 0; index < pixels.data.length; index += 1) {
				pixels.data[index] = index % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
			}

			context.putImageData(pixels, 0, 0);
		} else {
			const gradient = context.createLinearGradient(0, 0, width, height);

			gradient.addColorStop(0, "#002233");
			gradient.addColorStop(1, "#ddff55");
			context.fillStyle = gradient;
			context.fillRect(0, 0, width, height);
		}

		const blob = await canvas.convertToBlob({ type, quality: 0.92 });

		// Browsers fall back to PNG for types they cannot encode; that would test the wrong format.
		if (blob.type !== type) throw new Error(`This browser encodes ${type} as ${blob.type}`);

		const encoded = new Uint8Array(await blob.arrayBuffer());
		let binary = "";

		for (let start = 0; start < encoded.length; start += 0x8000) {
			binary += String.fromCharCode(...encoded.subarray(start, start + 0x8000));
		}

		return btoa(binary);
	}, spec);

	return { name, mimeType: spec.type, buffer: Buffer.from(base64, "base64") };
}

function u16(value: number): Array<number> {
	return [value & 0xff, (value >> 8) & 0xff];
}

function u32(value: number): Array<number> {
	return [...u16(value & 0xffff), ...u16(value >>> 16)];
}

function entry(
	tag: number,
	type: number,
	count: number,
	value: ReadonlyArray<number>,
): Array<number> {
	return [
		...u16(tag),
		...u16(type),
		...u32(count),
		...value,
		...Array.from({ length: 4 - value.length }, () => 0),
	];
}

/**
 * Adds an EXIF block the way phone cameras write it: orientation, a description carrying
 * `marker`, and a GPS position. The tool must apply the orientation and drop everything else.
 */
export function withExif(sample: Sample, orientation: number, marker: string): Sample {
	const description = [...Buffer.from(`${marker}\0`, "latin1")];

	if (description.length % 2 === 1) description.push(0);

	const ifd0Size = 2 + 3 * 12 + 4;
	const descriptionOffset = 8 + ifd0Size;
	const gpsOffset = descriptionOffset + description.length;
	const gpsSize = 2 + 2 * 12 + 4;
	const latitudeOffset = gpsOffset + gpsSize;

	const tiff = [
		0x49,
		0x49,
		0x2a,
		0x00,
		...u32(8),
		...u16(3),
		...entry(0x010e, 2, description.length, u32(descriptionOffset)),
		...entry(0x0112, 3, 1, u16(orientation)),
		...entry(0x8825, 4, 1, u32(gpsOffset)),
		...u32(0),
		...description,
		...u16(2),
		...entry(0x0001, 2, 2, [0x4e, 0x00]),
		...entry(0x0002, 5, 3, u32(latitudeOffset)),
		...u32(0),
		...[19, 1, 25, 1, 0, 1].flatMap(u32),
	];

	const payload = [...Buffer.from("Exif\0\0", "latin1"), ...tiff];
	const segment = [0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
	const jpeg = sample.buffer;
	// After the JFIF APP0 segment when there is one, where cameras put it.
	const insertAt = jpeg[3] === 0xe0 ? 4 + jpeg.readUInt16BE(4) : 2;

	return {
		...sample,
		buffer: Buffer.concat([
			jpeg.subarray(0, insertAt),
			Buffer.from(segment),
			jpeg.subarray(insertAt),
		]),
	};
}
