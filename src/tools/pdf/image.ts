import { PDF } from "@libpdf/core";
import { Result, type Result as ResultType } from "better-result";

import { conversionFailed, type Converted, type ConvertError } from "./errors.ts";
import type { Quality } from "./settings.ts";
import type { ImageKind } from "./sniff.ts";

type Encoding = "image/jpeg" | "image/png";

/** A decoded image, already turned by its EXIF orientation and reduced to its final size. */
export interface Raster {
	readonly width: number;
	readonly height: number;
	/** JPEG is drawn over white, so transparent areas do not turn black. */
	encode(type: Encoding, quality: number): Promise<Uint8Array>;
	close(): void;
}

export type DecodeImage = (
	bytes: Uint8Array<ArrayBuffer>,
	kind: ImageKind,
	maxSide: number | undefined,
) => Promise<Raster>;

interface Profile {
	readonly maxSide: number | undefined;
	readonly jpegQuality: number;
	readonly keepPng: boolean;
}

/** Every image is re-encoded, which also drops its metadata (EXIF, including GPS location). */
export const imageProfiles: Readonly<Record<Quality, Profile>> = {
	light: { maxSide: 1600, jpegQuality: 0.7, keepPng: false },
	normal: { maxSide: 2400, jpegQuality: 0.82, keepPng: false },
	max: { maxSide: undefined, jpegQuality: 0.92, keepPng: true },
};

/** Pages for images are sized at 96 DPI: one CSS pixel is three quarters of a point. */
export const pointsPerPixel = 72 / 96;

export interface Size {
	readonly width: number;
	readonly height: number;
}

export function fitWithin(width: number, height: number, maxSide: number | undefined): Size {
	const longest = Math.max(width, height);

	if (maxSide === undefined || longest <= maxSide) return { width, height };

	const scale = maxSide / longest;

	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

/** Decodes with the browser: createImageBitmap applies EXIF orientation, OffscreenCanvas re-encodes. */
export const decodeInBrowser: DecodeImage = async (bytes, kind, maxSide) => {
	const full = await createImageBitmap(new Blob([bytes], { type: `image/${kind}` }), {
		imageOrientation: "from-image",
	});

	const size = fitWithin(full.width, full.height, maxSide);
	let bitmap = full;

	if (size.width !== full.width || size.height !== full.height) {
		bitmap = await createImageBitmap(full, {
			resizeWidth: size.width,
			resizeHeight: size.height,
			resizeQuality: "high",
		});
		full.close();
	}

	return {
		width: bitmap.width,
		height: bitmap.height,
		async encode(type, quality) {
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			const context = canvas.getContext("2d");

			if (context === null) throw new Error("2D canvas is not available in this worker");

			if (type === "image/jpeg") {
				context.fillStyle = "#fff";
				context.fillRect(0, 0, bitmap.width, bitmap.height);
			}

			context.drawImage(bitmap, 0, 0);
			const blob = await canvas.convertToBlob({ type, quality });

			return new Uint8Array(await blob.arrayBuffer());
		},
		close: () => bitmap.close(),
	};
};

export interface ImageOptions {
	readonly fileName: string;
	readonly kind: ImageKind;
	readonly quality: Quality;
	readonly decode?: DecodeImage;
}

/** One image becomes a one-page PDF at its own size; Letter and A4 are applied when composing. */
export async function convertImage(
	bytes: Uint8Array<ArrayBuffer>,
	options: ImageOptions,
): Promise<ResultType<Converted, ConvertError>> {
	const { fileName, kind, quality, decode = decodeInBrowser } = options;
	const profile = imageProfiles[quality];
	const encoding: Encoding = profile.keepPng && kind === "png" ? "image/png" : "image/jpeg";

	return Result.tryPromise({
		try: async () => {
			const raster = await decode(bytes, kind, profile.maxSide);

			try {
				const encoded = await raster.encode(encoding, profile.jpegQuality);
				const pdf = PDF.create();
				const image = encoding === "image/png" ? pdf.embedPng(encoded) : pdf.embedJpeg(encoded);
				const width = raster.width * pointsPerPixel;
				const height = raster.height * pointsPerPixel;

				pdf.addPage({ width, height }).drawImage(image, { x: 0, y: 0, width, height });

				return { pdf: await pdf.save(), degraded: false, pages: 1 };
			} finally {
				raster.close();
			}
		},
		catch: (cause) => conversionFailed(fileName, cause),
	});
}
