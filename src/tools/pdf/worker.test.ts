import { describe, expect, test } from "bun:test";

import { PDF } from "@libpdf/core";
import * as v from "valibot";

import {
	CompositionFailed,
	ConversionFailed,
	EngineUnavailable,
	PasswordRequired,
} from "./errors.ts";
import { fixtureFontFetch, officeFixture, tinyJpeg } from "./fixtures.ts";
import type { DecodeImage } from "./image.ts";
import {
	ComposeResponseSchema,
	ConvertResponseSchema,
	decodeComposed,
	decodeConverted,
	FatalSchema,
	type ComposeRequest,
	type ConvertRequest,
} from "./protocol.ts";
import { engines, handleMessage, type Engines, type Reply } from "./worker.ts";

const settings = { size: "letter", quality: "normal" } as const;

/** Stands in for createImageBitmap, which Bun does not have. */
const decodeTiny: DecodeImage = () =>
	Promise.resolve({
		width: 4,
		height: 4,
		encode: () => Promise.resolve(tinyJpeg),
		close: () => undefined,
	});

const withTinyDecoder: Engines = {
	...engines,
	image: async () => {
		const module = await engines.image();

		return {
			...module,
			convertImage: (bytes, options) =>
				module.convertImage(bytes, { ...options, decode: decodeTiny }),
		};
	},
};

interface MalformedRequest {
	readonly type: string;
	readonly jobId: string;
	readonly file: string;
}

function handle(
	data: ConvertRequest | ComposeRequest | MalformedRequest,
	available: Engines = withTinyDecoder,
): Promise<Reply> {
	return handleMessage(new MessageEvent<unknown>("message", { data }), fixtureFontFetch, available);
}

function request(fileName: string, kind: ConvertRequest["kind"], file: Blob): ConvertRequest {
	return { type: "convert", jobId: fileName, fileName, kind, file, settings };
}

async function office(name: string): Promise<ConvertRequest> {
	return request(name, "docx", new Blob([await officeFixture(name)]));
}

const converted = (reply: Reply) => decodeConverted(v.parse(ConvertResponseSchema, reply));
const composed = (reply: Reply) => decodeComposed(v.parse(ComposeResponseSchema, reply));

describe("handleMessage: convert", () => {
	test("answers with the PDF as a Blob, matched to the job", async () => {
		const reply = await handle(await office("SampleDoc.docx"));
		const result = converted(reply);

		expect(v.parse(ConvertResponseSchema, reply).jobId).toBe("SampleDoc.docx");
		expect(result.unwrap().pdf.type).toBe("application/pdf");
	});

	test("carries expected failures as typed errors", async () => {
		const locked = converted(await handle(await office("bug53475-password-is-pass.docx")));

		const broken = converted(
			await handle(request("roto.docx", "docx", new Blob([new Uint8Array(64)]))),
		);

		expect(locked.isErr() && PasswordRequired.is(locked.error)).toBe(true);
		expect(broken.isErr() && ConversionFailed.is(broken.error)).toBe(true);
	});

	test("reports a converter that cannot be loaded", async () => {
		const reply = await handle(await office("SampleDoc.docx"), {
			...engines,
			office: () => Promise.reject(new Error("chunk failed to load")),
		});

		const result = converted(reply);

		expect(result.isErr() && EngineUnavailable.is(result.error) && result.error.reason).toBe(
			"chunk failed to load",
		);
	});

	test("routes PDFs, plain text and images to their own converter", async () => {
		const pdf = converted(
			await handle(request("roto.pdf", "pdf", new Blob([new Uint8Array([1, 2, 3])]))),
		);

		const text = converted(await handle(request("notas.txt", "text", new Blob(["Apuntes"]))));
		const image = converted(await handle(request("a.jpg", "jpeg", new Blob([tinyJpeg]))));

		expect(pdf.isErr() && ConversionFailed.is(pdf.error)).toBe(true);
		expect(text.isOk()).toBe(true);
		expect(image.isOk()).toBe(true);
	});

	test("turns a malformed request into a fatal reply instead of hanging", async () => {
		expect(v.is(FatalSchema, await handle({ type: "convert", jobId: "", file: "nope" }))).toBe(
			true,
		);
	});
});

describe("handleMessage: compose", () => {
	test("joins converted parts in order", async () => {
		const parts = await Promise.all(
			["SampleDoc.docx", "SampleShow.pptx"].map(
				async (name) => converted(await handle(await office(name))).unwrap().pdf,
			),
		);

		const reply = await handle({
			type: "compose",
			jobId: "final",
			fileName: "tarea.pdf",
			parts,
			size: "a4",
		});

		const result = composed(reply).unwrap();
		const document = await PDF.load(new Uint8Array(await result.pdf.arrayBuffer()));

		expect(result.pages).toBe(document.getPages().length);
		expect(result.pages).toBeGreaterThan(2);
	});

	test("a part that is not a PDF fails the composition", async () => {
		const reply = await handle({
			type: "compose",
			jobId: "final",
			fileName: "tarea.pdf",
			parts: [new Blob(["no soy un pdf"])],
			size: "letter",
		});

		const result = composed(reply);

		expect(result.isErr() && CompositionFailed.is(result.error)).toBe(true);
	});
});
