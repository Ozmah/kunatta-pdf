import { Result, type Result as ResultType } from "better-result";
import { Ream, WrongPasswordError, type LossReport } from "reamkit";

import { conversionFailed, passwordRequired, type Converted, type ConvertError } from "./errors.ts";
import type { FontFetch } from "./office-fonts.ts";
import { officeFormats, type OfficeFormat } from "./office-sniff.ts";

export interface OfficePdf extends Converted {
	readonly format: OfficeFormat;
}

export interface OfficeOptions {
	readonly fileName: string;
	readonly fontFetch: FontFetch;
	readonly password?: string;
}

// reamkit also reads PDF, which goes through @libpdf/core instead.
function isOfficeFormat(format: string): format is OfficeFormat {
	return officeFormats.some((known) => known === format);
}

/** The binary formats from before 2007. reamkit reads them only in part, so they always warn the user. */
const legacyFormats: ReadonlySet<OfficeFormat> = new Set(["doc", "xls", "ppt"]);

/**
 * Legacy formats are always degraded, whatever reamkit reports. For the rest, open substitutes are
 * expected for every document; only real content changes matter to the user.
 */
export function isDegraded(format: OfficeFormat, losses: LossReport): boolean {
	return legacyFormats.has(format) || losses.some((loss) => loss.severity !== "substituted");
}

function failure(fileName: string, cause: unknown): ConvertError {
	if (cause instanceof WrongPasswordError) {
		return passwordRequired(fileName);
	}

	return conversionFailed(fileName, cause);
}

/** Converts one Word, Excel or PowerPoint file into PDF bytes, entirely in memory. */
export async function convertOffice(
	bytes: Uint8Array,
	options: OfficeOptions,
): Promise<ResultType<OfficePdf, ConvertError>> {
	const { fileName, fontFetch, password } = options;

	return Result.tryPromise({
		try: async () => {
			const document = Ream.parse(bytes, password === undefined ? {} : { password });
			const format = document.format;

			if (!isOfficeFormat(format)) {
				throw new Error(`reamkit read ${fileName} as ${format}, not an Office format`);
			}

			const { bytes: pdf, losses } = await document.convertWithReport("pdf", {
				fileName,
				fontFetch,
			});

			return { format, pdf, degraded: isDegraded(format, losses) };
		},
		catch: (cause) => failure(fileName, cause),
	});
}
