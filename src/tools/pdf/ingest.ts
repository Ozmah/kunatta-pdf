import { Result, TaggedError, type Result as ResultType } from "better-result";

import { looksLikeText, sniffBinary, type InputKind } from "./sniff.ts";

const mebibyte = 1024 * 1024;

/** Hard limits that keep a single tab from exhausting the device's memory. */
export const limits = {
	fileBytes: 50 * mebibyte,
	totalBytes: 200 * mebibyte,
	files: 100,
} as const;

/** What the browser tells us about a file plus the first bytes of its content. */
export interface Candidate {
	readonly name: string;
	readonly mimeType: string;
	readonly size: number;
	readonly head: Uint8Array;
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

/** Decides whether one file can enter the pile, and as what. */
export function classify(candidate: Candidate): ResultType<InputKind, RejectedFile> {
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

	const binary = sniffBinary(candidate.head);

	if (binary !== undefined) return Result.ok(binary);

	if (declaresText(candidate) && looksLikeText(candidate.head)) return Result.ok("text");

	return Result.err(
		new UnsupportedFile({ fileName, message: `${fileName} is not a supported format` }),
	);
}
