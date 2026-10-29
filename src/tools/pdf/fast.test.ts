import { describe, expect, test } from "bun:test";

import { Result } from "better-result";

import type { ComposeJob, Converter, ConvertJob } from "./converter.ts";
import { ConversionFailed, PasswordRequired, WorkerCrashed } from "./errors.ts";
import { degradedNotice, failureReason, runFast } from "./fast.ts";
import type { PileEntry } from "./pile.ts";

const entry: PileEntry = {
	id: "1",
	name: "tarea: historia.doc",
	kind: "doc",
	size: 10,
	source: new Blob(["doc"]),
};

const settings = { size: "a4", quality: "normal" } as const;

function converter(overrides: Partial<Converter> = {}): Converter & { calls: Array<string> } {
	const calls: Array<string> = [];

	return {
		calls,
		convert: (job: ConvertJob) => {
			calls.push(`convert ${job.fileName} ${job.kind}`);

			return Promise.resolve(Result.ok({ pdf: new Blob(["part"]), degraded: true }));
		},
		compose: (job: ComposeJob) => {
			calls.push(`compose ${job.fileName} ${job.size} ${job.parts.length}`);

			return Promise.resolve(Result.ok({ pdf: new Blob(["final"]), pages: 6 }));
		},
		cancel: () => undefined,
		...overrides,
	};
}

describe("runFast", () => {
	test("converts, then composes the single part with the chosen size and a clean name", async () => {
		const fake = converter();
		const result = await runFast(entry, fake, settings);

		expect(fake.calls).toEqual([
			"convert tarea: historia.doc doc",
			"compose tarea historia.pdf a4 1",
		]);
		expect(result.unwrap()).toMatchObject({ name: "tarea historia.pdf", pages: 6, degraded: true });
	});

	test("a failed conversion stops before composing", async () => {
		const failure = new ConversionFailed({ fileName: entry.name, reason: "broken", message: "x" });
		const fake = converter({ convert: () => Promise.resolve(Result.err(failure)) });
		const result = await runFast(entry, fake, settings);

		expect(result.isErr() && result.error).toBe(failure);
		expect(fake.calls).toEqual([]);
	});
});

describe("messages", () => {
	test("legacy Office and text get their own notice, everything else the generic one", () => {
		expect(degradedNotice("ppt")).toBe("degraded.ppt");
		expect(degradedNotice("text")).toBe("degraded.text");
		expect(degradedNotice("docx")).toBe("degraded.other");
	});

	test("each failure maps to a reason the user can act on", () => {
		const fileName = "a.docx";

		expect(failureReason(new PasswordRequired({ fileName, message: "x" }))).toBe("reason.password");
		expect(failureReason(new WorkerCrashed({ fileName, message: "x" }))).toBe("reason.crashed");
	});
});
