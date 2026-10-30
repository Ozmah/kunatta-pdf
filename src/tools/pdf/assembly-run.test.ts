import { describe, expect, test } from "bun:test";

import { Result } from "better-result";

import { createAssembly, type AssemblyPrompts } from "./assembly-run.ts";
import type { ComposeJob, Converter, ConvertJob } from "./converter.ts";
import { ConversionFailed, PasswordRequired } from "./errors.ts";
import { backedOut } from "./fast.ts";
import type { PileEntry } from "./pile.ts";
import type { Settings } from "./settings.ts";
import type { InputKind } from "./sniff.ts";

function entry(name: string, kind: InputKind = "jpeg"): PileEntry {
	return { id: name, name, kind, size: 1, source: new Blob([name]) };
}

interface Log {
	readonly converted: Array<string>;
	readonly composed: Array<ComposeJob>;
}

/** Converts on the next tick. "roto" fails, "clave" needs the password "abre". */
function converter(log: Log): Converter {
	return {
		convert: async (job: ConvertJob) => {
			await Promise.resolve();
			log.converted.push(
				`${job.fileName} ${job.settings.quality}${job.password === undefined ? "" : ` ${job.password}`}`,
			);

			if (job.fileName.startsWith("roto")) {
				return Result.err(
					new ConversionFailed({ fileName: job.fileName, reason: "x", message: "x" }),
				);
			}

			if (job.fileName.startsWith("clave") && job.password !== "abre") {
				return Result.err(new PasswordRequired({ fileName: job.fileName, message: "x" }));
			}

			return Result.ok({ pdf: new Blob([job.fileName]), degraded: false, pages: 2 });
		},
		compose: (job: ComposeJob) => {
			log.composed.push(job);

			return Promise.resolve(Result.ok({ pdf: new Blob(["final"]), pages: job.parts.length * 2 }));
		},
		cancel: () => undefined,
	};
}

function setup(
	summary: "back" | "without" = "without",
	settings: Settings = { size: "letter", quality: "normal", password: "off", name: "" },
) {
	const log: Log = { converted: [], composed: [] };
	const asked: Array<string> = [];
	let current = settings;

	const prompts: AssemblyPrompts = {
		summary: (problems, total) => {
			asked.push(`summary ${problems.length} of ${total}`);

			return Promise.resolve(summary);
		},
		resultPassword: (name, pages) => {
			asked.push(`password ${name} ${pages}`);

			return Promise.resolve("s3creta");
		},
	};

	const assembly = createAssembly({
		converter: converter(log),
		settings: () => current,
		prompts,
		locale: "es",
	});

	return { assembly, log, asked, change: (next: Settings) => (current = next) };
}

/** Lets the background checks run: they take a few microtasks each. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const parts = async (job: ComposeJob | undefined): Promise<Array<string>> =>
	Promise.all((job?.parts ?? []).map((part) => part.text()));

describe("createAssembly", () => {
	test("checks every file in the background and composes them in list order", async () => {
		const { assembly, log } = setup();

		assembly.add([entry("foto 10.jpg"), entry("foto 2.jpg")]);
		const result = await assembly.generate("tarea.pdf");

		expect(log.converted).toEqual(["foto 2.jpg normal", "foto 10.jpg normal"]);
		expect(await parts(log.composed[0])).toEqual(["foto 2.jpg", "foto 10.jpg"]);
		expect(result !== backedOut && result.unwrap().name).toBe("tarea.pdf");
	});

	test("a locked file waits for its password in the row and remembers a wrong one", async () => {
		const { assembly } = setup();

		assembly.add([entry("clave.pdf", "pdf")]);
		await flush();

		expect(assembly.items()[0]?.state).toEqual({ kind: "locked", wrong: false });

		assembly.unlock("clave.pdf", "mal");
		await flush();

		expect(assembly.items()[0]?.state).toEqual({ kind: "locked", wrong: true });

		assembly.unlock("clave.pdf", "abre");
		await flush();

		expect(assembly.items()[0]?.state.kind).toBe("ready");
	});

	test("failures go to the summary: back keeps the list, without removes them and composes the rest", async () => {
		const back = setup("back");

		back.assembly.add([entry("a.jpg"), entry("roto.jpg")]);

		expect(await back.assembly.generate("t.pdf")).toBe(backedOut);
		expect(back.assembly.items()).toHaveLength(2);
		expect(back.asked).toEqual(["summary 1 of 2"]);

		const without = setup("without");

		without.assembly.add([entry("a.jpg"), entry("roto.jpg"), entry("b.jpg")]);
		await without.assembly.generate("t.pdf");

		expect(without.assembly.items().map((item) => item.entry.name)).toEqual(["a.jpg", "b.jpg"]);
		expect(await parts(without.log.composed[0])).toEqual(["a.jpg", "b.jpg"]);
	});

	test("changing quality reconverts images before composing; the result password gets the page total", async () => {
		const { assembly, log, asked, change } = setup("without");

		assembly.add([entry("a.jpg"), entry("notas.pdf", "pdf")]);
		await assembly.generate("t.pdf");
		change({ size: "letter", quality: "max", password: "on", name: "" });
		await assembly.generate("t.pdf");

		expect(log.converted).toEqual(["a.jpg normal", "notas.pdf normal", "a.jpg max"]);
		expect(asked).toEqual(["password t.pdf 4"]);
		expect(log.composed[1]?.password).toBe("s3creta");
	});

	test("cancelling a generation backs out without composing", async () => {
		const { assembly, log } = setup();

		assembly.add([entry("a.jpg")]);
		const pending = assembly.generate("t.pdf");

		assembly.cancel();

		expect(await pending).toBe(backedOut);
		expect(log.composed).toEqual([]);
	});
});
