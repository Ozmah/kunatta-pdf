import { PDF } from "@libpdf/core";
import { Result, type Result as ResultType } from "better-result";

import { conversionFailed, passwordRequired, type Converted, type ConvertError } from "./errors.ts";

export interface PdfOptions {
	readonly fileName: string;
	readonly password?: string;
}

/**
 * Opens an incoming PDF. An unprotected one passes through untouched; a protected one is
 * opened with its password and saved without encryption, because the result never keeps it.
 * Letter and A4 are applied when composing.
 */
export async function openPdf(
	bytes: Uint8Array,
	options: PdfOptions,
): Promise<ResultType<Converted, ConvertError>> {
	const { fileName, password } = options;

	const loaded = await Result.tryPromise({
		try: () => PDF.load(bytes, password === undefined ? {} : { credentials: password }),
		catch: (cause) => conversionFailed(fileName, cause),
	});

	if (loaded.isErr()) return loaded;

	const pdf = loaded.value;

	const pages = pdf.getPages().length;

	if (!pdf.isEncrypted) return Result.ok({ pdf: bytes, degraded: false, pages });

	// libpdf opens protected files without throwing; a missing or wrong password leaves them unauthenticated.
	if (!pdf.isAuthenticated) {
		return Result.err(passwordRequired(fileName));
	}

	pdf.removeProtection({ ignorePermissions: true });

	return Result.tryPromise({
		try: async () => ({ pdf: await pdf.save(), degraded: false, pages }),
		catch: (cause) => conversionFailed(fileName, cause),
	});
}

/** Counts the pages of a PDF this tool produced; used for Office, whose converter does not say. */
export async function countPages(bytes: Uint8Array): Promise<number> {
	return (await PDF.load(bytes)).getPages().length;
}
