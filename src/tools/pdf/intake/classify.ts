import { Result, TaggedError, type Result as ResultType } from "better-result";

import {
	cfbEntryNames,
	cfbFormat,
	ooxmlFromEntries,
	zipEntryNames,
	type ByteReader,
} from "./office-sniff.ts";
import type { InputKind, OfficeFormat } from "../contract/kinds.ts";
import { looksLikeText, sniffBinary, sniffContainer, sniffLength } from "./sniff.ts";

const mebibyte = 1024 * 1024;

/** Hard limits that keep a single tab from exhausting the device's memory. */
export const limits = {
	fileBytes: 50 * mebibyte,
	totalBytes: 200 * mebibyte,
	files: 100,
} as const;

/** What the browser tells us about a file plus a way to read parts of its content. */
export interface Candidate {
	readonly name: string;
	readonly mimeType: string;
	readonly size: number;
	readonly read: ByteReader;
}

export class EmptyFile extends TaggedError("EmptyFile")<{
	fileName: string;
	message: string;
}> {}

export class FileTooLarge extends TaggedError("FileTooLarge")<{
	fileName: string;
	size: number;
	limit: number;
	message: string;
}> {}

export class UnsupportedFile extends TaggedError("UnsupportedFile")<{
	fileName: string;
	message: string;
}> {}

export type RejectedFile = EmptyFile | FileTooLarge | UnsupportedFile;

function declaresText(candidate: Candidate): boolean {
	return candidate.mimeType === "text/plain" || candidate.name.toLowerCase().endsWith(".txt");
}

async function officeFormat(
	candidate: Candidate,
	head: Uint8Array,
): Promise<OfficeFormat | undefined> {
	const container = sniffContainer(head);

	if (container === "zip") {
		const names = await zipEntryNames(candidate.read, candidate.size);

		return names === undefined ? undefined : ooxmlFromEntries(names);
	}

	if (container === "cfb") return cfbFormat(await cfbEntryNames(candidate.read), candidate.name);

	return undefined;
}

/** Decides whether one file can enter the pile, and as what. */
export async function classify(candidate: Candidate): Promise<ResultType<InputKind, RejectedFile>> {
	const fileName = candidate.name;

	if (candidate.size === 0) {
		return Result.err(new EmptyFile({ fileName, message: `${fileName} is empty` }));
	}

	if (candidate.size > limits.fileBytes) {
		return Result.err(
			new FileTooLarge({
				fileName,
				size: candidate.size,
				limit: limits.fileBytes,
				message: `${fileName} exceeds ${limits.fileBytes} bytes`,
			}),
		);
	}

	const head = await candidate.read(0, sniffLength);
	const binary = sniffBinary(head);

	if (binary !== undefined) return Result.ok(binary);

	const office = await officeFormat(candidate, head);

	if (office !== undefined) return Result.ok(office);

	if (declaresText(candidate) && looksLikeText(head)) return Result.ok("text");

	return Result.err(
		new UnsupportedFile({ fileName, message: `${fileName} is not a supported format` }),
	);
}
