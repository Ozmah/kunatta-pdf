import { PDF, type EmbeddedFont } from "@libpdf/core";
import { Result, type Result as ResultType } from "better-result";

import { conversionFailed, type Converted, type ConvertError } from "../../contract/errors.ts";
import type { PageSize } from "../../contract/options.ts";

/** Page sizes in points. Original has no meaning for plain text, so it uses Letter. */
const pagePoints: Readonly<Record<PageSize, { width: number; height: number }>> = {
	letter: { width: 612, height: 792 },
	a4: { width: 595.28, height: 841.89 },
	original: { width: 612, height: 792 },
};

const fontSize = 11;
const lineHeight = fontSize * 1.35;
const margin = (2 / 2.54) * 72; // 2 cm
const tabWidth = 4;

export interface TextOptions {
	readonly fileName: string;
	readonly size: PageSize;
	/** Cousine Regular: monospaced, and already shipped for Office documents. */
	readonly font: Uint8Array;
}

/** Breaks one line into pieces no wider than `columns`, preferring the last space before the limit. */
export function wrapLine(line: string, columns: number): ReadonlyArray<string> {
	const pieces: Array<string> = [];
	let rest = line;

	while (rest.length > columns) {
		const space = rest.lastIndexOf(" ", columns);
		const cut = space > 0 ? space : columns;

		pieces.push(rest.slice(0, cut));
		rest = rest.slice(space > 0 ? cut + 1 : cut);
	}

	pieces.push(rest);

	return pieces;
}

/** Characters the font cannot draw become "?", and the file is reported as degraded. */
interface Drawable {
	readonly text: string;
	readonly degraded: boolean;
}

function drawable(text: string, font: EmbeddedFont): Drawable {
	// Line breaks are layout, not glyphs; the font is only asked about what gets drawn.
	const missing = new Set(font.getUnencodableCharacters(text.replaceAll("\n", "")));

	if (missing.size === 0) return { text, degraded: false };

	return {
		text: Array.from(text, (character) => (missing.has(character) ? "?" : character)).join(""),
		degraded: true,
	};
}

/** Lays plain text out on pages of the chosen size, with 2 cm margins. */
export async function convertText(
	bytes: Uint8Array,
	options: TextOptions,
): Promise<ResultType<Converted, ConvertError>> {
	const { fileName, size, font: fontBytes } = options;

	return Result.tryPromise({
		try: async () => {
			const pdf = PDF.create();
			const font = pdf.embedFont(fontBytes);
			const page = pagePoints[size];
			const decoded = new TextDecoder("utf-8").decode(bytes).replaceAll(/\r\n?/g, "\n");
			const { text, degraded } = drawable(decoded.replaceAll("\t", " ".repeat(tabWidth)), font);

			const columns = Math.max(
				1,
				Math.floor((page.width - 2 * margin) / font.widthOfTextAtSize("M", fontSize)),
			);

			const rows = Math.max(1, Math.floor((page.height - 2 * margin) / lineHeight));
			const lines = text.split("\n").flatMap((line) => wrapLine(line, columns));

			for (let start = 0; start < lines.length; start += rows) {
				const current = pdf.addPage(page);

				lines.slice(start, start + rows).forEach((line, row) => {
					if (line.length === 0) return;

					current.drawText(line, {
						x: margin,
						y: page.height - margin - fontSize - row * lineHeight,
						font,
						size: fontSize,
					});
				});
			}

			return { pdf: await pdf.save({ subsetFonts: true }), degraded, pages: pdf.getPages().length };
		},
		catch: (cause) => conversionFailed(fileName, cause),
	});
}
