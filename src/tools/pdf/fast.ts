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
import type { FilePdf } from "./protocol.ts";
import type { Settings } from "./settings.ts";
import type { InputKind } from "./sniff.ts";

export interface FastPdf {
	readonly name: string;
	readonly pdf: Blob;
	readonly pages: number;
	readonly degraded: boolean;
}

export type FastError = JobError | ComposeJobError;

/** What the user can be asked along the way. Each prompt resolves to undefined when they back out. */
export interface Prompts {
	/** A protected file needs its password; `retry` is true after a wrong one. */
	incomingPassword(entry: PileEntry, retry: boolean): Promise<string | undefined>;
	/** The password for the result, typed twice; only asked when the setting is on. */
	resultPassword(name: string, pages: number | undefined): Promise<string | undefined>;
	/** The single-PDF dialog: true to make the PDF, false to go back. */
	confirmSinglePdf(entry: PileEntry, name: string, pages: number): Promise<boolean>;
}

/** The user backed out of a dialog; nothing failed. */
export const backedOut = "backed-out";

export type Outcome = ResultType<FastPdf, FastError> | typeof backedOut;

/** Converts one file, asking for its password as many times as needed. */
async function convertEntry(
	entry: PileEntry,
	converter: Converter,
	settings: Settings,
	prompts: Prompts,
): Promise<ResultType<FilePdf, JobError> | typeof backedOut> {
	let password: string | undefined;
	let retry = false;

	for (;;) {
		// The worker only needs what shapes the conversion; the password setting stays here.
		const job = {
			fileName: entry.name,
			kind: entry.kind,
			file: entry.source,
			settings: { size: settings.size, quality: settings.quality },
		};

		const converted = await converter.convert(password === undefined ? job : { ...job, password });

		if (converted.isOk() || !PasswordRequired.is(converted.error)) return converted;

		password = await prompts.incomingPassword(entry, retry);

		if (password === undefined) return backedOut;

		retry = true;
	}
}

async function compose(
	converter: Converter,
	file: FilePdf,
	name: string,
	settings: Settings,
	password: string | undefined,
): Promise<ResultType<FastPdf, FastError>> {
	const job = { fileName: name, parts: [file.pdf], size: settings.size };
	const composed = await converter.compose(password === undefined ? job : { ...job, password });

	return composed.map(({ pdf, pages }) => ({ name, pdf, pages, degraded: file.degraded }));
}

/**
 * One file that is not a PDF, straight to a download. The result password, when the setting is
 * on, is asked before converting; a protected Office file asks for its own password on the way.
 */
export async function runFast(
	entry: PileEntry,
	converter: Converter,
	settings: Settings,
	prompts: Prompts,
): Promise<Outcome> {
	const name = pdfName(entry.name);
	let password: string | undefined;

	if (settings.password === "on") {
		password = await prompts.resultPassword(name, undefined);

		if (password === undefined) return backedOut;
	}

	const converted = await convertEntry(entry, converter, settings, prompts);

	if (converted === backedOut || converted.isErr()) return converted;

	return compose(converter, converted.value, name, settings, password);
}

/**
 * One PDF: open it first (asking for its password if needed) so the dialog can show its pages,
 * confirm, then ask for the result password and compose.
 */
export async function runSinglePdf(
	entry: PileEntry,
	converter: Converter,
	settings: Settings,
	prompts: Prompts,
): Promise<Outcome> {
	const name = pdfName(entry.name);
	const opened = await convertEntry(entry, converter, settings, prompts);

	if (opened === backedOut || opened.isErr()) return opened;

	if (!(await prompts.confirmSinglePdf(entry, name, opened.value.pages))) return backedOut;

	let password: string | undefined;

	if (settings.password === "on") {
		password = await prompts.resultPassword(name, opened.value.pages);

		if (password === undefined) return backedOut;
	}

	return compose(converter, opened.value, name, settings, password);
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
