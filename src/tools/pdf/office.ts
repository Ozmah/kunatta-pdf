import { Result, type Result as ResultType } from "better-result";
import { Ream, WrongPasswordError, type LossReport } from "reamkit";

import {
	causeMessage,
	conversionFailed,
	engineUnavailable,
	passwordRequired,
	type Converted,
	type ConvertError,
} from "./errors.ts";
import { bundledFontPath, type FontFetch } from "./office-fonts.ts";
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

export interface WatchedFonts {
	readonly fetch: FontFetch;
	/** Why a bundled face could not be loaded, when one could not. */
	readonly failure: () => string | undefined;
}

/**
 * reamkit throws a generic error when a face it needs does not load, so the fetch is watched to tell
 * a network problem from a damaged file. Faces we do not bundle answer "missing" on purpose and
 * never count.
 */
export function watchFonts(fontFetch: FontFetch): WatchedFonts {
	let failure: string | undefined;

	return {
		fetch: async (url) => {
			try {
				const font = await fontFetch(url);

				if (!font.ok && bundledFontPath(url) !== undefined) failure ??= `${url} did not load`;

				return font;
			} catch (cause) {
				failure ??= causeMessage(cause);
				// reamkit's fetch contract: a rejection is how it learns the face is unavailable.
				throw cause;
			}
		},
		failure: () => failure,
	};
}

export function officeFailure(
	fileName: string,
	cause: unknown,
	fontFailure: string | undefined,
): ConvertError {
	if (cause instanceof WrongPasswordError) return passwordRequired(fileName);

	// Offline or a missing deploy file: the converter could not run, the document is not at fault.
	if (fontFailure !== undefined) return engineUnavailable(fileName, fontFailure);

	return conversionFailed(fileName, cause);
}

/** Converts one Word, Excel or PowerPoint file into PDF bytes, entirely in memory. */
export async function convertOffice(
	bytes: Uint8Array,
	options: OfficeOptions,
): Promise<ResultType<OfficePdf, ConvertError>> {
	const { fileName, password } = options;
	const fonts = watchFonts(options.fontFetch);

	return Result.tryPromise({
		try: async () => {
			const document = Ream.parse(bytes, password === undefined ? {} : { password });
			const format = document.format;

			if (!isOfficeFormat(format)) {
				throw new Error(`reamkit read ${fileName} as ${format}, not an Office format`);
			}

			const { bytes: pdf, losses } = await document.convertWithReport("pdf", {
				fileName,
				fontFetch: fonts.fetch,
			});

			return { format, pdf, degraded: isDegraded(format, losses) };
		},
		catch: (cause) => officeFailure(fileName, cause, fonts.failure()),
	});
}
