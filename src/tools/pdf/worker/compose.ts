import { PDF, type PDFEmbeddedPage } from "@libpdf/core";
import { Result, type Result as ResultType } from "better-result";

import { compositionFailed, type CompositionFailed } from "../contract/errors.ts";
import type { PageSize } from "../contract/options.ts";

export interface ComposeOptions {
	/** Name of the resulting PDF, for error messages. */
	readonly fileName: string;
	readonly size: PageSize;
	/** When present the result is encrypted with AES-256 and needs it to open. */
	readonly password?: string;
}

export interface Composed {
	readonly pdf: Uint8Array;
	readonly pages: number;
}

export interface Box {
	readonly width: number;
	readonly height: number;
}

export interface Placement extends Box {
	readonly x: number;
	readonly y: number;
}

/** Scales a page to fit the sheet, centered and undistorted, without margins. */
export function fitOnSheet(page: Box, sheet: Box): Placement {
	const scale = Math.min(sheet.width / page.width, sheet.height / page.height);
	const width = page.width * scale;
	const height = page.height * scale;

	return { x: (sheet.width - width) / 2, y: (sheet.height - height) / 2, width, height };
}

/**
 * Draws one source page on a new sheet. `embedded.width/height` are the page as viewers show it
 * (after /Rotate); `embedded.box` is the unrotated content, which embedPage does not turn, so
 * the drawing is rotated clockwise by the page's own rotation around the placement's center.
 */
function placeOnSheet(
	document: PDF,
	embedded: PDFEmbeddedPage,
	rotation: number,
	size: "letter" | "a4",
): void {
	// A landscape page (a slide, a photo held sideways) gets a landscape sheet.
	const orientation = embedded.width > embedded.height ? "landscape" : "portrait";
	const sheet = document.addPage({ size, orientation });
	const placement = fitOnSheet(embedded, sheet);
	const scale = placement.width / embedded.width;
	const center = { x: placement.x + placement.width / 2, y: placement.y + placement.height / 2 };

	sheet.drawPage(embedded, {
		x: center.x - (embedded.box.width * scale) / 2,
		y: center.y - (embedded.box.height * scale) / 2,
		scale,
		rotate: { angle: -rotation, origin: center },
	});
}

/**
 * Joins the converted files in list order. Each part is read, copied and released before the
 * next one, so only one source document is in memory at a time.
 */
export async function composePdf(
	parts: ReadonlyArray<Blob>,
	options: ComposeOptions,
): Promise<ResultType<Composed, CompositionFailed>> {
	const { fileName, size, password } = options;

	return Result.tryPromise({
		try: async () => {
			const document = PDF.create();

			for (const part of parts) {
				const source = await PDF.load(new Uint8Array(await part.arrayBuffer()));
				const pages = source.getPages();
				const indices = pages.map((_, index) => index);

				if (size === "original") {
					await document.copyPagesFrom(source, indices);
				} else {
					for (const [index, page] of pages.entries()) {
						placeOnSheet(document, await document.embedPage(source, index), page.rotation, size);
					}
				}
			}

			if (password !== undefined) document.setProtection({ userPassword: password });

			return { pdf: await document.save(), pages: document.getPages().length };
		},
		catch: (cause) => compositionFailed(fileName, cause),
	});
}
