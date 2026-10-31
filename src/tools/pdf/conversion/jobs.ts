import { convertSettings, type ConvertSettings, type PageSize } from "../contract/options.ts";
import type { PileEntry } from "../shared/entry.ts";
import type { ComposeJob, ConvertJob } from "./converter.ts";

/** Converting one entry: its file, the settings that shape it and, once asked for, its password. */
export function convertJob(
	entry: PileEntry,
	settings: ConvertSettings,
	password: string | undefined,
): ConvertJob {
	const job = {
		fileName: entry.name,
		kind: entry.kind,
		file: entry.source,
		settings: convertSettings(settings),
	};

	return password === undefined ? job : { ...job, password };
}

/** Joining converted parts into the PDF the user downloads, protected when a password is given. */
export function composeJob(
	fileName: string,
	parts: Array<Blob>,
	size: PageSize,
	password: string | undefined,
): ComposeJob {
	const job = { fileName, parts, size };

	return password === undefined ? job : { ...job, password };
}
