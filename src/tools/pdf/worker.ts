import { Result } from "better-result";
import * as v from "valibot";

import { EngineUnavailable } from "./errors.ts";
import type { FontFetch } from "./office-fonts.ts";
import type { OfficeOptions } from "./office.ts";
import {
	ConvertRequestSchema,
	encodeResponse,
	ownBuffer,
	type ConvertResponse,
	type Fatal,
} from "./protocol.ts";

export interface Reply {
	readonly message: ConvertResponse | Fatal;
	readonly transfer: ReadonlyArray<ArrayBuffer>;
}

export type OfficeModule = typeof import("./office.ts");

/** Loaded on demand: reamkit only reaches memory when an Office file arrives. */
export type LoadOffice = () => Promise<OfficeModule>;

const loadOffice: LoadOffice = () => import("./office.ts");

function fatal(reason: string): Reply {
	return { message: { type: "fatal", reason }, transfer: [] };
}

/** Handles one message inside the worker. Anything unexpected becomes a `fatal` reply instead of a silent hang. */
export async function handleMessage(
	event: MessageEvent<unknown>,
	fontFetch: FontFetch,
	load: LoadOffice = loadOffice,
): Promise<Reply> {
	const parsed = v.safeParse(ConvertRequestSchema, event.data);

	if (!parsed.success) return fatal(`invalid request: ${v.summarize(parsed.issues)}`);

	const { jobId, fileName, bytes, password } = parsed.output;

	const office = await Result.tryPromise({
		try: load,
		catch: (cause) =>
			new EngineUnavailable({
				fileName,
				reason: cause instanceof Error ? cause.message : String(cause),
				message: `the converter for ${fileName} is unavailable`,
			}),
	});

	if (office.isErr()) return { message: encodeResponse(jobId, office), transfer: [] };

	try {
		const options: OfficeOptions =
			password === undefined ? { fileName, fontFetch } : { fileName, fontFetch, password };

		const converted = await office.value.convertOffice(new Uint8Array(bytes), options);

		const result = converted.map(({ pdf, degraded }) => ({ pdf: ownBuffer(pdf), degraded }));

		return {
			message: encodeResponse(jobId, result),
			transfer: result.isOk() ? [result.value.pdf] : [],
		};
	} catch (error) {
		// convertOffice returns expected failures as values; reaching this is a bug in the worker.
		return fatal(error instanceof Error ? error.message : String(error));
	}
}
