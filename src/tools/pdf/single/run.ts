import type { Result as ResultType } from "better-result";

import type { MessageKey } from "../../../i18n/es.ts";
import { composeJob, convertJob, type Converter } from "../conversion/converter.ts";
import {
	CompositionFailed,
	ConversionFailed,
	EngineUnavailable,
	PasswordRequired,
	type ComposeJobError,
	type JobError,
} from "../contract/errors.ts";
import { resultName } from "../shared/file-name.ts";
import type { PileEntry } from "../intake/pile.ts";
import type { FilePdf } from "../contract/protocol.ts";
import type { Settings } from "../settings/settings.ts";
import type { InputKind } from "../intake/sniff.ts";

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
	/** The single-PDF dialog: make the PDF, go back, or add more files around it. */
	confirmSinglePdf(entry: PileEntry, name: string, pages: number): Promise<SingleChoice>;
}

export type SingleChoice = "make" | "back" | "more";

/** The user backed out of a dialog; nothing failed. */
export const backedOut = "backed-out";

/** "Add more files" from the single-PDF dialog: the opened PDF moves to an assembly. */
export interface MoreFiles {
	readonly entry: PileEntry;
	readonly file: FilePdf;
}

export type Outcome = ResultType<FastPdf, FastError> | typeof backedOut | MoreFiles;

export function isMoreFiles(outcome: Outcome): outcome is MoreFiles {
	return outcome !== backedOut && "file" in outcome;
}

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
		const converted = await converter.convert(convertJob(entry, settings, password));

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
	const composed = await converter.compose(composeJob(name, [file.pdf], settings.size, password));

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
	const name = resultName(settings.name, entry.name);
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
	const name = resultName(settings.name, entry.name);
	const opened = await convertEntry(entry, converter, settings, prompts);

	if (opened === backedOut || opened.isErr()) return opened;

	const choice = await prompts.confirmSinglePdf(entry, name, opened.value.pages);

	if (choice === "back") return backedOut;

	if (choice === "more") return { entry, file: opened.value };

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
