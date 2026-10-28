import { describe, expect, test } from "bun:test";

import * as v from "valibot";

import { ConversionFailed, EngineUnavailable, PasswordRequired } from "./errors.ts";
import { fixtureFontFetch, officeFixture } from "./fixtures.ts";
import {
	ConvertResponseSchema,
	decodeResult,
	FatalSchema,
	type ConvertRequest,
} from "./protocol.ts";
import { handleMessage, type LoadOffice } from "./worker.ts";

const fontFetch = fixtureFontFetch;

async function request(name: string): Promise<ConvertRequest> {
	const bytes = (await officeFixture(name)).buffer;

	return { type: "convert", jobId: "job-1", fileName: name, kind: "docx", bytes };
}

interface MalformedRequest {
	readonly type: string;
	readonly jobId: string;
	readonly bytes: string;
}

function handle(
	data: ConvertRequest | MalformedRequest,
	load?: LoadOffice,
): ReturnType<typeof handleMessage> {
	const event = new MessageEvent<unknown>("message", { data });

	return load === undefined
		? handleMessage(event, fontFetch)
		: handleMessage(event, fontFetch, load);
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
		const reply = await handle(await request("SampleDoc.docx"), () =>
			Promise.reject(new Error("chunk failed to load")),
		);

		const result = decodeResult(v.parse(ConvertResponseSchema, reply.message));

		expect(result.isErr() && EngineUnavailable.is(result.error) && result.error.reason).toBe(
			"chunk failed to load",
		);
	});

	test("turns a malformed request into a fatal reply instead of hanging", async () => {
		const reply = await handle({ type: "convert", jobId: "", bytes: "nope" });

		expect(v.is(FatalSchema, reply.message)).toBe(true);
	});
});
