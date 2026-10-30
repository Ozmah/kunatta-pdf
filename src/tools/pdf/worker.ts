import { Result, type Result as ResultType } from "better-result";
import * as v from "valibot";

import {
	causeMessage,
	conversionFailed,
	engineUnavailable,
	type ConversionFailed,
	type EngineUnavailable,
	type ComposeError,
	type Converted,
	type ConvertError,
} from "./errors.ts";
import type { FontFetch } from "./office-fonts.ts";
import { officeFormats } from "./office-sniff.ts";
import {
	encodeComposed,
	encodeConverted,
	pdfBlob,
	WorkerRequestSchema,
	type ComposedPdf,
	type ComposeRequest,
	type ComposeResponse,
	type ConvertRequest,
	type ConvertResponse,
	type Fatal,
	type FilePdf,
} from "./protocol.ts";
import { isImageKind } from "./sniff.ts";

export type Reply = ConvertResponse | ComposeResponse | Fatal;

/** Each converter is its own chunk: reamkit or @libpdf/core only reach memory when a file needs them. */
export interface Engines {
	readonly office: () => Promise<typeof import("./office.ts")>;
	readonly image: () => Promise<typeof import("./image.ts")>;
	readonly pdf: () => Promise<typeof import("./pdf-input.ts")>;
	readonly text: () => Promise<typeof import("./text.ts")>;
	readonly compose: () => Promise<typeof import("./compose.ts")>;
}

export const engines: Engines = {
	office: () => import("./office.ts"),
	image: () => import("./image.ts"),
	pdf: () => import("./pdf-input.ts"),
	text: () => import("./text.ts"),
	compose: () => import("./compose.ts"),
};

const textFont = "Cousine_400Regular.ttf";

function load<Module>(
	fileName: string,
	loader: () => Promise<Module>,
): Promise<ResultType<Module, EngineUnavailable>> {
	return Result.tryPromise({
		try: loader,
		catch: (cause) => engineUnavailable(fileName, cause),
	});
}

/** The face plain text is drawn with. Failing to fetch it means the converter cannot run, like a chunk that does not load. */
function textFontBytes(
	fileName: string,
	fontFetch: FontFetch,
): Promise<ResultType<Uint8Array, EngineUnavailable>> {
	return Result.tryPromise({
		try: async () => {
			const font = await fontFetch(textFont);

			if (!font.ok) throw new Error(`${textFont} could not be loaded`);

			return new Uint8Array(await font.arrayBuffer());
		},
		catch: (cause) => engineUnavailable(fileName, cause),
	});
}

/** Pages of a converted file. Office does not report them, so they are counted from its PDF. */
async function pagesOf(
	fileName: string,
	converted: Converted,
	available: Engines,
): Promise<ResultType<number, ConversionFailed | EngineUnavailable>> {
	if (converted.pages !== undefined) return Result.ok(converted.pages);

	const module = await load(fileName, available.pdf);

	if (module.isErr()) return module;

	return Result.tryPromise({
		try: () => module.value.countPages(converted.pdf),
		catch: (cause) => conversionFailed(fileName, cause),
	});
}

async function convert(
	request: ConvertRequest,
	fontFetch: FontFetch,
	available: Engines,
): Promise<ResultType<Converted, ConvertError>> {
	const { fileName, kind, password, settings } = request;

	// A picked file can change on disk or lose its permission before its turn comes.
	const read = await Result.tryPromise({
		try: async () => new Uint8Array(await request.file.arrayBuffer()),
		catch: (cause) => conversionFailed(fileName, cause),
	});

	if (read.isErr()) return read;

	const bytes = read.value;
	const office = officeFormats.find((known) => known === kind);

	if (isImageKind(kind)) {
		const module = await load(fileName, available.image);

		if (module.isErr()) return module;

		return module.value.convertImage(bytes, { fileName, kind, quality: settings.quality });
	}

	if (office !== undefined) {
		const module = await load(fileName, available.office);

		if (module.isErr()) return module;

		const options =
			password === undefined ? { fileName, fontFetch } : { fileName, fontFetch, password };

		return module.value.convertOffice(bytes, options);
	}

	if (kind === "pdf") {
		const module = await load(fileName, available.pdf);

		if (module.isErr()) return module;

		return module.value.openPdf(
			bytes,
			password === undefined ? { fileName } : { fileName, password },
		);
	}

	const module = await load(fileName, available.text);

	if (module.isErr()) return module;

	const font = await textFontBytes(fileName, fontFetch);

	if (font.isErr()) return font;

	return module.value.convertText(bytes, { fileName, size: settings.size, font: font.value });
}

async function compose(
	request: ComposeRequest,
	available: Engines,
): Promise<ResultType<ComposedPdf, ComposeError>> {
	const { fileName, parts, size, password } = request;
	const module = await load(fileName, available.compose);

	if (module.isErr()) return module;

	const options = password === undefined ? { fileName, size } : { fileName, size, password };
	const composed = await module.value.composePdf(parts, options);

	return composed.map(({ pdf, pages }) => ({ pdf: pdfBlob(pdf), pages }));
}

function fatal(reason: string): Fatal {
	return { type: "fatal", reason };
}

/** Handles one message inside the worker. Anything unexpected becomes a `fatal` reply instead of a silent hang. */
export async function handleMessage(
	event: MessageEvent<unknown>,
	fontFetch: FontFetch,
	available: Engines = engines,
): Promise<Reply> {
	const parsed = v.safeParse(WorkerRequestSchema, event.data);

	if (!parsed.success) return fatal(`invalid request: ${v.summarize(parsed.issues)}`);

	const request = parsed.output;

	try {
		if (request.type === "compose") {
			return encodeComposed(request.jobId, await compose(request, available));
		}

		const converted = await convert(request, fontFetch, available);

		if (converted.isErr()) return encodeConverted(request.jobId, converted);

		const pages = await pagesOf(request.fileName, converted.value, available);

		if (pages.isErr()) return encodeConverted(request.jobId, pages);

		const { pdf, degraded } = converted.value;
		const file: FilePdf = { pdf: pdfBlob(pdf), degraded, pages: pages.value };

		return encodeConverted(request.jobId, Result.ok(file));
	} catch (error) {
		// Converters return expected failures as values; reaching this is a bug in the worker.
		return fatal(causeMessage(error));
	}
}
