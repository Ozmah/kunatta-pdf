import { describe, expect, test } from "bun:test";

import * as v from "valibot";

import { ConversionFailed, EngineUnavailable, PasswordRequired } from "./errors.ts";
import { fixtureFontFetch, officeFixture, tinyJpeg } from "./fixtures.ts";
import {
	ConvertResponseSchema,
	decodeResult,
	FatalSchema,
	type ConvertRequest,
} from "./protocol.ts";
import type { DecodeImage } from "./image.ts";
import { engines, handleMessage, type Engines } from "./worker.ts";

const fontFetch = fixtureFontFetch;

const settings = { size: "letter", quality: "normal" } as const;

/** Stands in for createImageBitmap, which Bun does not have. */
const decodeTiny: DecodeImage = () =>
	Promise.resolve({
		width: 4,
		height: 4,
		encode: () => Promise.resolve(tinyJpeg),
		close: () => undefined,
	});

async function request(name: string): Promise<ConvertRequest> {
	const bytes = (await officeFixture(name)).buffer;

	return { type: "convert", jobId: "job-1", fileName: name, kind: "docx", bytes, settings };
}

interface MalformedRequest {
	readonly type: string;
	readonly jobId: string;
	readonly bytes: string;
}

function handle(
	data: ConvertRequest | MalformedRequest,
	available: Engines = engines,
): ReturnType<typeof handleMessage> {
	return handleMessage(new MessageEvent<unknown>("message", { data }), fontFetch, available);
}

function decoded(
	reply: Awaited<ReturnType<typeof handleMessage>>,
): ReturnType<typeof decodeResult> {
	return decodeResult(v.parse(ConvertResponseSchema, reply.message));
}

describe("handleMessage", () => {
	test("answers a valid request with a PDF it can transfer", async () => {
		const reply = await handle(await request("SampleDoc.docx"));
		const response = v.parse(ConvertResponseSchema, reply.message);
		const result = decodeResult(response);

		expect(response.jobId).toBe("job-1");
		expect(result.isOk()).toBe(true);
		expect(reply.transfer).toEqual([result.unwrap().pdf]);
	});

	test("carries expected failures as typed errors", async () => {
		const locked = await handle(await request("bug53475-password-is-pass.docx"));

		const broken = await handle({
			...(await request("SampleDoc.docx")),
			bytes: new ArrayBuffer(64),
		});

		const lockedResult = decodeResult(v.parse(ConvertResponseSchema, locked.message));
		const brokenResult = decodeResult(v.parse(ConvertResponseSchema, broken.message));

		expect(lockedResult.isErr() && PasswordRequired.is(lockedResult.error)).toBe(true);
		expect(brokenResult.isErr() && ConversionFailed.is(brokenResult.error)).toBe(true);
		expect(locked.transfer).toEqual([]);
	});

	test("reports a converter that cannot be loaded", async () => {
		const reply = await handle(await request("SampleDoc.docx"), {
			...engines,
			office: () => Promise.reject(new Error("chunk failed to load")),
		});

		const result = decodeResult(v.parse(ConvertResponseSchema, reply.message));

		expect(result.isErr() && EngineUnavailable.is(result.error) && result.error.reason).toBe(
			"chunk failed to load",
		);
	});

	test("turns a malformed request into a fatal reply instead of hanging", async () => {
		const reply = await handle({ type: "convert", jobId: "", bytes: "nope" });

		expect(v.is(FatalSchema, reply.message)).toBe(true);
	});

	test("routes PDFs, plain text and images to their own converter", async () => {
		const pdf = await handle({
			type: "convert",
			jobId: "pdf",
			fileName: "garbage.pdf",
			kind: "pdf",
			bytes: new Uint8Array([1, 2, 3]).buffer,
			settings,
		});

		const text = await handle({
			type: "convert",
			jobId: "txt",
			fileName: "notas.txt",
			kind: "text",
			bytes: new TextEncoder().encode("Apuntes").buffer,
			settings,
		});

		const image = await handle(
			{
				type: "convert",
				jobId: "img",
				fileName: "a.jpg",
				kind: "jpeg",
				bytes: tinyJpeg.buffer,
				settings,
			},
			{
				...engines,
				image: async () => {
					const module = await engines.image();

					return {
						...module,
						convertImage: (bytes, options) =>
							module.convertImage(bytes, { ...options, decode: decodeTiny }),
					};
				},
			},
		);

		const pdfResult = decoded(pdf);

		expect(pdfResult.isErr() && ConversionFailed.is(pdfResult.error)).toBe(true);
		expect(decoded(text).isOk()).toBe(true);
		expect(decoded(image).isOk()).toBe(true);
	});
});
