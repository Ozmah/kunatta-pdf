import { Result, type Result as ResultType } from "better-result";
import * as v from "valibot";

import {
	ConversionFailed,
	EngineUnavailable,
	PasswordRequired,
	type ConvertError,
} from "./errors.ts";
import { pageSizes, qualities } from "./settings.ts";
import { inputKinds } from "./sniff.ts";

/**
 * Messages between the main thread and the conversion worker. Both sides validate
 * what arrives: a message that does not match is a bug, never user input.
 */

export const ConvertRequestSchema = v.strictObject({
	type: v.literal("convert"),
	jobId: v.pipe(v.string(), v.minLength(1)),
	fileName: v.string(),
	kind: v.picklist(inputKinds),
	bytes: v.instance(ArrayBuffer),
	password: v.optional(v.string()),
	settings: v.strictObject({
		size: v.picklist(pageSizes),
		quality: v.picklist(qualities),
	}),
});

export type ConvertRequest = v.InferOutput<typeof ConvertRequestSchema>;

/** One file turned into a standalone PDF, ready to be composed with the others. */
export interface FilePdf {
	readonly pdf: ArrayBuffer;
	/** True when the converter simplified or dropped content. */
	readonly degraded: boolean;
}

const FilePdfSchema = v.strictObject({
	pdf: v.instance(ArrayBuffer),
	degraded: v.boolean(),
});

// `tag` mirrors the TaggedError `_tag` on the wire.
const WireErrorSchema = v.variant("tag", [
	v.strictObject({
		tag: v.literal("ConversionFailed"),
		fileName: v.string(),
		reason: v.string(),
	}),
	v.strictObject({
		tag: v.literal("PasswordRequired"),
		fileName: v.string(),
	}),
	v.strictObject({
		tag: v.literal("EngineUnavailable"),
		fileName: v.string(),
		reason: v.string(),
	}),
]);

type WireError = v.InferOutput<typeof WireErrorSchema>;

export const ConvertResponseSchema = v.strictObject({
	jobId: v.string(),
	result: v.variant("status", [
		v.strictObject({ status: v.literal("ok"), value: FilePdfSchema }),
		v.strictObject({ status: v.literal("error"), error: WireErrorSchema }),
	]),
});

export type ConvertResponse = v.InferOutput<typeof ConvertResponseSchema>;

/** The worker could not answer the current job at all (a bug or a broken runtime); the host replaces it. */
export const FatalSchema = v.strictObject({
	type: v.literal("fatal"),
	reason: v.string(),
});

export type Fatal = v.InferOutput<typeof FatalSchema>;

export const WorkerMessageSchema = v.union([ConvertResponseSchema, FatalSchema]);

function toWire(error: ConvertError): WireError {
	const { fileName } = error;

	if (PasswordRequired.is(error)) return { tag: "PasswordRequired", fileName };

	if (EngineUnavailable.is(error))
		return { tag: "EngineUnavailable", fileName, reason: error.reason };

	return { tag: "ConversionFailed", fileName, reason: error.reason };
}

function fromWire(error: WireError): ConvertError {
	if (error.tag === "PasswordRequired") {
		return new PasswordRequired({
			fileName: error.fileName,
			message: `${error.fileName} needs a password`,
		});
	}

	if (error.tag === "EngineUnavailable") {
		return new EngineUnavailable({
			fileName: error.fileName,
			reason: error.reason,
			message: `the converter for ${error.fileName} is unavailable`,
		});
	}

	return new ConversionFailed({
		fileName: error.fileName,
		reason: error.reason,
		message: `${error.fileName} could not be converted`,
	});
}

export function encodeResponse(
	jobId: string,
	result: ResultType<FilePdf, ConvertError>,
): ConvertResponse {
	return result.isOk()
		? { jobId, result: { status: "ok", value: result.value } }
		: { jobId, result: { status: "error", error: toWire(result.error) } };
}

export function decodeResult(response: ConvertResponse): ResultType<FilePdf, ConvertError> {
	const { result } = response;

	return result.status === "ok" ? Result.ok(result.value) : Result.err(fromWire(result.error));
}

/** An ArrayBuffer that holds exactly the view's bytes, so it can be transferred without copying the rest. */
export function ownBuffer(view: Uint8Array): ArrayBuffer {
	const { buffer, byteOffset, byteLength } = view;

	if (buffer instanceof ArrayBuffer && byteOffset === 0 && byteLength === buffer.byteLength) {
		return buffer;
	}

	return view.slice().buffer;
}
