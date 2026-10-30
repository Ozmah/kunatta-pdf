import { Result, type Result as ResultType } from "better-result";
import * as v from "valibot";

import {
	compositionFailed,
	conversionFailed,
	EngineUnavailable,
	engineUnavailable,
	PasswordRequired,
	passwordRequired,
	type ComposeError,
	type ConvertError,
} from "./errors.ts";
import { pageSizes, qualities } from "./settings.ts";
import { inputKinds } from "./sniff.ts";

/**
 * Messages between the main thread and the conversion worker. Both sides validate what
 * arrives: a message that does not match is a bug, never user input. Files and PDFs travel
 * as Blobs, which are passed by reference: the main thread never holds their bytes.
 */

const jobId = v.pipe(v.string(), v.minLength(1));
const password = v.optional(v.pipe(v.string(), v.minLength(1)));

export const ConvertRequestSchema = v.strictObject({
	type: v.literal("convert"),
	jobId,
	fileName: v.string(),
	kind: v.picklist(inputKinds),
	file: v.instance(Blob),
	password,
	settings: v.strictObject({ size: v.picklist(pageSizes), quality: v.picklist(qualities) }),
});

export type ConvertRequest = v.InferOutput<typeof ConvertRequestSchema>;

export const ComposeRequestSchema = v.strictObject({
	type: v.literal("compose"),
	jobId,
	/** The name of the resulting PDF, used in errors. */
	fileName: v.string(),
	parts: v.pipe(v.array(v.instance(Blob)), v.minLength(1)),
	size: v.picklist(pageSizes),
	password,
});

export type ComposeRequest = v.InferOutput<typeof ComposeRequestSchema>;

export const WorkerRequestSchema = v.variant("type", [ConvertRequestSchema, ComposeRequestSchema]);

export type WorkerRequest = ConvertRequest | ComposeRequest;

/** One file turned into a standalone PDF, ready to be composed with the others. */
export interface FilePdf {
	readonly pdf: Blob;
	/** True when the converter simplified or dropped content. */
	readonly degraded: boolean;
	readonly pages: number;
}

/** The final document. */
export interface ComposedPdf {
	readonly pdf: Blob;
	readonly pages: number;
}

// `tag` mirrors the TaggedError `_tag` on the wire.
const failed = v.strictObject({
	tag: v.literal("ConversionFailed"),
	fileName: v.string(),
	reason: v.string(),
});

const locked = v.strictObject({ tag: v.literal("PasswordRequired"), fileName: v.string() });

const unavailable = v.strictObject({
	tag: v.literal("EngineUnavailable"),
	fileName: v.string(),
	reason: v.string(),
});

const composeFailed = v.strictObject({
	tag: v.literal("CompositionFailed"),
	fileName: v.string(),
	reason: v.string(),
});

function envelope<Value extends v.GenericSchema, Failure extends v.GenericSchema>(
	value: Value,
	error: Failure,
) {
	return v.strictObject({
		jobId: v.string(),
		result: v.variant("status", [
			v.strictObject({ status: v.literal("ok"), value }),
			v.strictObject({ status: v.literal("error"), error }),
		]),
	});
}

export const ConvertResponseSchema = envelope(
	v.strictObject({
		pdf: v.instance(Blob),
		degraded: v.boolean(),
		pages: v.pipe(v.number(), v.integer(), v.minValue(1)),
	}),
	v.variant("tag", [failed, locked, unavailable]),
);

export type ConvertResponse = v.InferOutput<typeof ConvertResponseSchema>;

export const ComposeResponseSchema = envelope(
	v.strictObject({ pdf: v.instance(Blob), pages: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
	v.variant("tag", [composeFailed, unavailable]),
);

export type ComposeResponse = v.InferOutput<typeof ComposeResponseSchema>;

/** The worker could not answer the current job at all (a bug or a broken runtime); the host replaces it. */
export const FatalSchema = v.strictObject({
	type: v.literal("fatal"),
	reason: v.string(),
});

export type Fatal = v.InferOutput<typeof FatalSchema>;

type ConvertWire =
	| v.InferOutput<typeof failed>
	| v.InferOutput<typeof locked>
	| v.InferOutput<typeof unavailable>;

type ComposeWire = v.InferOutput<typeof composeFailed> | v.InferOutput<typeof unavailable>;

type WireError = ConvertWire | ComposeWire;

function toWire(error: ConvertError): ConvertWire {
	const { fileName } = error;

	if (PasswordRequired.is(error)) return { tag: "PasswordRequired", fileName };

	if (EngineUnavailable.is(error))
		return { tag: "EngineUnavailable", fileName, reason: error.reason };

	return { tag: "ConversionFailed", fileName, reason: error.reason };
}

function fromWire(error: ConvertWire): ConvertError;
function fromWire(error: ComposeWire): ComposeError;
function fromWire(error: WireError): ConvertError | ComposeError {
	const { fileName } = error;

	switch (error.tag) {
		case "PasswordRequired":
			return passwordRequired(fileName);
		case "EngineUnavailable":
			return engineUnavailable(fileName, error.reason);
		case "CompositionFailed":
			return compositionFailed(fileName, error.reason);
		case "ConversionFailed":
			return conversionFailed(fileName, error.reason);
	}
}

export function encodeConverted(
	id: string,
	result: ResultType<FilePdf, ConvertError>,
): ConvertResponse {
	return result.isOk()
		? { jobId: id, result: { status: "ok", value: result.value } }
		: { jobId: id, result: { status: "error", error: toWire(result.error) } };
}

export function encodeComposed(
	id: string,
	result: ResultType<ComposedPdf, ComposeError>,
): ComposeResponse {
	if (result.isOk()) return { jobId: id, result: { status: "ok", value: result.value } };

	const error = result.error;

	const wire = EngineUnavailable.is(error)
		? { tag: "EngineUnavailable" as const, fileName: error.fileName, reason: error.reason }
		: { tag: "CompositionFailed" as const, fileName: error.fileName, reason: error.reason };

	return { jobId: id, result: { status: "error", error: wire } };
}

export function decodeConverted(response: ConvertResponse): ResultType<FilePdf, ConvertError> {
	const { result } = response;

	return result.status === "ok" ? Result.ok(result.value) : Result.err(fromWire(result.error));
}

export function decodeComposed(response: ComposeResponse): ResultType<ComposedPdf, ComposeError> {
	const { result } = response;

	return result.status === "ok" ? Result.ok(result.value) : Result.err(fromWire(result.error));
}

/** Wraps PDF bytes in a Blob; the Blob keeps its own copy, so the buffer can be released afterwards. */
export function pdfBlob(bytes: Uint8Array): Blob {
	const view =
		bytes.buffer instanceof ArrayBuffer
			? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
			: bytes.slice();

	return new Blob([view], { type: "application/pdf" });
}
