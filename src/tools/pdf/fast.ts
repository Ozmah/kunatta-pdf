import type { Result as ResultType } from "better-result";

import type { MessageKey } from "../../i18n/es.ts";
import type { Converter } from "./converter.ts";
import {
	CompositionFailed,
	ConversionFailed,
	EngineUnavailable,
	PasswordRequired,
	type ComposeJobError,
	type JobError,
} from "./errors.ts";
import { pdfName } from "./file-name.ts";
import type { PileEntry } from "./pile.ts";
import type { Settings } from "./settings.ts";
import type { InputKind } from "./sniff.ts";

export interface FastPdf {
	readonly name: string;
	readonly pdf: Blob;
	readonly pages: number;
	readonly degraded: boolean;
}

export type FastError = JobError | ComposeJobError;

/** One file, straight to a download: convert it, then compose it so Letter, A4 and the password apply. */
export async function runFast(
	entry: PileEntry,
	converter: Converter,
	settings: Settings,
): Promise<ResultType<FastPdf, FastError>> {
	const name = pdfName(entry.name);

	const converted = await converter.convert({
		fileName: entry.name,
		kind: entry.kind,
		file: entry.source,
		settings,
	});

	if (converted.isErr()) return converted;

	const composed = await converter.compose({
		fileName: name,
		parts: [converted.value.pdf],
		size: settings.size,
	});

	return composed.map(({ pdf, pages }) => ({
		name,
		pdf,
		pages,
		degraded: converted.value.degraded,
	}));
}

/** The notice shown after a degraded conversion, chosen by what usually goes wrong for that kind. */
export function degradedNotice(kind: InputKind): MessageKey {
	switch (kind) {
		case "doc":
		case "xls":
		case "ppt":
			return `degraded.${kind}`;
		case "text":
			return "degraded.text";
		default:
			return "degraded.other";
	}
}

/** What the failed card says about why. */
export function failureReason(error: FastError): MessageKey {
	if (PasswordRequired.is(error)) return "reason.password";

	if (EngineUnavailable.is(error)) return "reason.engine";

	if (CompositionFailed.is(error)) return "reason.composition";

	if (ConversionFailed.is(error)) return "reason.damaged";

	// WorkerCrashed, or a cancellation the fast path never asks for.
	return "reason.crashed";
}
