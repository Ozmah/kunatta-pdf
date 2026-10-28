import { Result, type Result as ResultType } from "better-result";
import * as v from "valibot";

import { EngineUnavailable, type Converted, type ConvertError } from "./errors.ts";
import type { FontFetch } from "./office-fonts.ts";
import { officeFormats } from "./office-sniff.ts";
import {
	ConvertRequestSchema,
	encodeResponse,
	ownBuffer,
	type ConvertRequest,
	type ConvertResponse,
	type Fatal,
} from "./protocol.ts";
import { imageKinds } from "./sniff.ts";

export interface Reply {
	readonly message: ConvertResponse | Fatal;
	readonly transfer: ReadonlyArray<ArrayBuffer>;
}

/** Each converter is its own chunk: reamkit or @libpdf/core only reach memory when a file needs them. */
export interface Engines {
	readonly office: () => Promise<typeof import("./office.ts")>;
	readonly image: () => Promise<typeof import("./image.ts")>;
	readonly pdf: () => Promise<typeof import("./pdf-input.ts")>;
	readonly text: () => Promise<typeof import("./text.ts")>;
}

export const engines: Engines = {
	office: () => import("./office.ts"),
	image: () => import("./image.ts"),
	pdf: () => import("./pdf-input.ts"),
	text: () => import("./text.ts"),
};

const textFont = "Cousine_400Regular.ttf";

function unavailable(fileName: string, reason: string): EngineUnavailable {
	return new EngineUnavailable({
		fileName,
		reason,
		message: `the converter for ${fileName} is unavailable`,
	});
}

function load<Module>(
	fileName: string,
	loader: () => Promise<Module>,
): Promise<ResultType<Module, EngineUnavailable>> {
	return Result.tryPromise({
		try: loader,
		catch: (cause) => unavailable(fileName, cause instanceof Error ? cause.message : String(cause)),
	});
}

async function convert(
	request: ConvertRequest,
	fontFetch: FontFetch,
	available: Engines,
): Promise<ResultType<Converted, ConvertError>> {
	const { fileName, kind, password, settings } = request;
	const bytes = new Uint8Array(request.bytes);
	const image = imageKinds.find((known) => known === kind);
	const office = officeFormats.find((known) => known === kind);

	if (image !== undefined) {
		const module = await load(fileName, available.image);

		if (module.isErr()) return module;

		return module.value.convertImage(bytes, { fileName, kind: image, quality: settings.quality });
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

	const font = await fontFetch(textFont);

	if (!font.ok) return Result.err(unavailable(fileName, `${textFont} could not be loaded`));

	return module.value.convertText(bytes, {
		fileName,
		size: settings.size,
		font: new Uint8Array(await font.arrayBuffer()),
	});
}

function fatal(reason: string): Reply {
	return { message: { type: "fatal", reason }, transfer: [] };
}

/** Handles one message inside the worker. Anything unexpected becomes a `fatal` reply instead of a silent hang. */
export async function handleMessage(
	event: MessageEvent<unknown>,
	fontFetch: FontFetch,
	available: Engines = engines,
): Promise<Reply> {
	const parsed = v.safeParse(ConvertRequestSchema, event.data);

	if (!parsed.success) return fatal(`invalid request: ${v.summarize(parsed.issues)}`);

	try {
		const converted = await convert(parsed.output, fontFetch, available);
		const result = converted.map(({ pdf, degraded }) => ({ pdf: ownBuffer(pdf), degraded }));

		return {
			message: encodeResponse(parsed.output.jobId, result),
			transfer: result.isOk() ? [result.value.pdf] : [],
		};
	} catch (error) {
		// Converters return expected failures as values; reaching this is a bug in the worker.
		return fatal(error instanceof Error ? error.message : String(error));
	}
}
