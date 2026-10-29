import { describe, expect, test } from "bun:test";

import { Result } from "better-result";

import type { ComposeJob, Converter, ConvertJob } from "./converter.ts";
import { ConversionFailed, PasswordRequired, WorkerCrashed } from "./errors.ts";
import {
	backedOut,
	degradedNotice,
	failureReason,
	runFast,
	isMoreFiles,
	runSinglePdf,
	type Outcome,
	type Prompts,
	type SingleChoice,
} from "./fast.ts";
import type { PileEntry } from "./pile.ts";
import type { Settings } from "./settings.ts";

const word: PileEntry = {
	id: "1",
	name: "tarea: historia.doc",
	kind: "doc",
	size: 10,
	source: new Blob(["doc"]),
};

const pdf: PileEntry = {
	id: "2",
	name: "constancia.pdf",
	kind: "pdf",
	size: 10,
	source: new Blob(["pdf"]),
};

const settings: Settings = { size: "a4", quality: "normal", password: "off" };
const withPassword: Settings = { ...settings, password: "on" };

/** A converter that needs `secret` for files whose name contains "constancia". */
function converter(): Converter & { calls: Array<string> } {
	const calls: Array<string> = [];

	return {
		calls,
		convert: (job: ConvertJob) => {
			// The worker validates requests strictly; extra settings would be rejected there.
			expect(Object.keys(job.settings).toSorted()).toEqual(["quality", "size"]);
			calls.push(
				`convert ${job.fileName}${job.password === undefined ? "" : ` with ${job.password}`}`,
			);

			if (job.fileName.includes("constancia") && job.password !== "secret") {
				return Promise.resolve(
					Result.err(new PasswordRequired({ fileName: job.fileName, message: "x" })),
				);
			}

			return Promise.resolve(Result.ok({ pdf: new Blob(["part"]), degraded: true, pages: 6 }));
		},
		compose: (job: ComposeJob) => {
			calls.push(
				`compose ${job.fileName} ${job.size}${job.password === undefined ? "" : ` locked ${job.password}`}`,
			);

			return Promise.resolve(Result.ok({ pdf: new Blob(["final"]), pages: 6 }));
		},
		cancel: () => undefined,
	};
}

interface Answers {
	readonly incomingPassword?: Array<string | undefined>;
	readonly resultPassword?: Array<string | undefined>;
	readonly confirmSinglePdf?: Array<SingleChoice>;
}

/** Scripted answers, taken in order; an exhausted list answers like backing out. */
function prompts(answers: Answers): Prompts & { asked: Array<string> } {
	const asked: Array<string> = [];
	const incoming = [...(answers.incomingPassword ?? [])];
	const result = [...(answers.resultPassword ?? [])];
	const confirms = [...(answers.confirmSinglePdf ?? [])];

	return {
		asked,
		incomingPassword: (entry, retry) => {
			asked.push(`incoming ${entry.name}${retry ? " again" : ""}`);

			return Promise.resolve(incoming.shift());
		},
		resultPassword: (name, pages) => {
			asked.push(`result ${name} ${String(pages)}`);

			return Promise.resolve(result.shift());
		},
		confirmSinglePdf: (entry, name, pages) => {
			asked.push(`confirm ${entry.name} as ${name}, ${pages} pages`);

			return Promise.resolve(confirms.shift() ?? "back");
		},
	};
}

/** The outcome as a Result; backing out or "add more files" fail the test. */
function settled(outcome: Outcome) {
	if (outcome === backedOut || isMoreFiles(outcome)) throw new Error("expected a result");

	return outcome;
}

describe("runFast", () => {
	test("converts, then composes the single part with the chosen size and a clean name", async () => {
		const fake = converter();
		const result = await runFast(word, fake, settings, prompts({}));

		expect(fake.calls).toEqual(["convert tarea: historia.doc", "compose tarea historia.pdf a4"]);
		expect(settled(result).unwrap()).toMatchObject({
			name: "tarea historia.pdf",
			degraded: true,
		});
	});

	test("with the password setting on, asks for it first and backing out converts nothing", async () => {
		const fake = converter();
		const asked = prompts({ resultPassword: ["s3creta"] });
		const locked = await runFast(word, fake, withPassword, asked);
		const cancelled = await runFast(word, converter(), withPassword, prompts({}));

		expect(asked.asked).toEqual(["result tarea historia.pdf undefined"]);
		expect(fake.calls.at(-1)).toBe("compose tarea historia.pdf a4 locked s3creta");
		expect(locked).not.toBe(backedOut);
		expect(cancelled).toBe(backedOut);
	});

	test("a failed conversion stops before composing", async () => {
		const failure = new ConversionFailed({ fileName: word.name, reason: "broken", message: "x" });
		const fake = { ...converter(), convert: () => Promise.resolve(Result.err(failure)) };
		const result = await runFast(word, fake, settings, prompts({}));

		const settledResult = settled(result);

		expect(settledResult.isErr() && settledResult.error).toBe(failure);
	});
});

describe("runSinglePdf", () => {
	test("asks for the incoming password until it opens, then confirms and composes without it", async () => {
		const fake = converter();
		const asked = prompts({ incomingPassword: ["wrong", "secret"], confirmSinglePdf: ["make"] });
		const result = await runSinglePdf(pdf, fake, settings, asked);

		expect(asked.asked).toEqual([
			"incoming constancia.pdf",
			"incoming constancia.pdf again",
			"confirm constancia.pdf as constancia.pdf, 6 pages",
		]);
		expect(fake.calls.at(-1)).toBe("compose constancia.pdf a4");
		expect(settled(result).isOk()).toBe(true);
	});

	test("going back from the dialog composes nothing; the result password comes after confirming", async () => {
		const back = await runSinglePdf(
			pdf,
			converter(),
			settings,
			prompts({ incomingPassword: ["secret"], confirmSinglePdf: ["back"] }),
		);

		const asked = prompts({
			incomingPassword: ["secret"],
			confirmSinglePdf: ["make"],
			resultPassword: ["nueva"],
		});

		const fake = converter();

		await runSinglePdf(pdf, fake, withPassword, asked);

		expect(back).toBe(backedOut);
		expect(asked.asked.at(-1)).toBe("result constancia.pdf 6");
		expect(fake.calls.at(-1)).toBe("compose constancia.pdf a4 locked nueva");
	});
});

describe("add more files", () => {
	test("hands the opened PDF over to an assembly without composing", async () => {
		const fake = converter();

		const outcome = await runSinglePdf(
			pdf,
			fake,
			settings,
			prompts({ incomingPassword: ["secret"], confirmSinglePdf: ["more"] }),
		);

		expect(isMoreFiles(outcome) && outcome.entry).toBe(pdf);
		expect(fake.calls.some((call) => call.startsWith("compose"))).toBe(false);
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
