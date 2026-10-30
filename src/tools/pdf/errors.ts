import { TaggedError } from "better-result";

/** Errors a conversion can end in. They live apart from the converters so the main thread can use them without loading reamkit or @libpdf/core. */

export class ConversionFailed extends TaggedError("ConversionFailed")<{
	fileName: string;
	reason: string;
	message: string;
}> {}

export class PasswordRequired extends TaggedError("PasswordRequired")<{
	fileName: string;
	message: string;
}> {}

/** The converter for a format could not be loaded (for example, the chunk failed to download). */
export class EngineUnavailable extends TaggedError("EngineUnavailable")<{
	fileName: string;
	reason: string;
	message: string;
}> {}

/** The converted files could not be joined into one document. */
export class CompositionFailed extends TaggedError("CompositionFailed")<{
	fileName: string;
	reason: string;
	message: string;
}> {}

export class WorkerCrashed extends TaggedError("WorkerCrashed")<{
	fileName: string;
	message: string;
}> {}

export class ConversionCancelled extends TaggedError("ConversionCancelled")<{
	fileName: string;
	message: string;
}> {}

/** What the worker itself can answer with. */
export type ConvertError = ConversionFailed | PasswordRequired | EngineUnavailable;

/** What composing can answer with. */
export type ComposeError = CompositionFailed | EngineUnavailable;

/** What the main thread can get back for one job. */
export type JobError = ConvertError | WorkerCrashed | ConversionCancelled;

export type ComposeJobError = ComposeError | WorkerCrashed | ConversionCancelled;

/** One file converted to a standalone PDF inside the worker. */
export interface Converted {
	readonly pdf: Uint8Array;
	/** True when content was dropped or simplified; font substitution alone does not count. */
	readonly degraded: boolean;
	/** Pages in `pdf`; undefined only for Office, whose converter does not report it. */
	readonly pages?: number;
	/** A small JPEG of an image, so the list can show which photo is which. */
	readonly thumbnail?: Uint8Array;
}

/** The text of whatever was thrown: an error's message, or the value itself (a wire reason is already text). */
export function causeMessage(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

/** A library refused the file: the bytes are damaged or use features it cannot read. */
export function conversionFailed(fileName: string, cause: unknown): ConversionFailed {
	return new ConversionFailed({
		fileName,
		reason: causeMessage(cause),
		message: `${fileName} could not be converted`,
	});
}

export function passwordRequired(fileName: string): PasswordRequired {
	return new PasswordRequired({ fileName, message: `${fileName} needs a password` });
}

export function engineUnavailable(fileName: string, cause: unknown): EngineUnavailable {
	return new EngineUnavailable({
		fileName,
		reason: causeMessage(cause),
		message: `the converter for ${fileName} is unavailable`,
	});
}

export function compositionFailed(fileName: string, cause: unknown): CompositionFailed {
	return new CompositionFailed({
		fileName,
		reason: causeMessage(cause),
		message: `${fileName} could not be composed`,
	});
}
