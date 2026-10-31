import type { Result as ResultType } from "better-result";

import { PasswordRequired, type ComposeJobError, type JobError } from "../contract/errors.ts";
import type { FilePdf } from "../contract/protocol.ts";
import type { Converter } from "../conversion/converter.ts";
import { composeJob, convertJob } from "../conversion/jobs.ts";
import type { PileEntry } from "../shared/entry.ts";
import { resultName } from "../shared/file-name.ts";
import { backedOut, type MadePdf } from "../shared/outcome.ts";
import type { Prompts } from "../shared/prompts.ts";
import type { Settings } from "../shared/settings.ts";

export type FastError = JobError | ComposeJobError;

/** "Add more files" from the single-PDF dialog: the opened PDF moves to an assembly. */
export interface MoreFiles {
	readonly entry: PileEntry;
	readonly file: FilePdf;
}

export type Outcome = ResultType<MadePdf, FastError> | typeof backedOut | MoreFiles;

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
): Promise<ResultType<MadePdf, FastError>> {
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
