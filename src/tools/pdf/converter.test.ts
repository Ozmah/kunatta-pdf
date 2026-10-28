import { describe, expect, test } from "bun:test";

import { isPanic } from "better-result";

import { ConversionCancelled, WorkerCrashed } from "./errors.ts";
import { createConverter, type ConvertJob, type WorkerPort } from "./converter.ts";
import {
	encodeResponse,
	type ConvertRequest,
	type ConvertResponse,
	type Fatal,
} from "./protocol.ts";
import { Result } from "better-result";

interface InvalidReply {
	readonly nonsense: true;
}

type WorkerReply = ConvertResponse | Fatal | InvalidReply;

type Behavior = (request: ConvertRequest, port: FakeWorker) => void;

/** A worker stand-in that answers on the next tick, like a real thread would. */
class FakeWorker implements WorkerPort {
	readonly received: Array<string> = [];
	terminated = false;
	private readonly listeners = new Map<string, Array<(event: MessageEvent<unknown>) => void>>();

	constructor(private readonly behavior: Behavior) {}

	postMessage(message: ConvertRequest): void {
		this.received.push(message.fileName);
		queueMicrotask(() => this.behavior(message, this));
	}

	terminate(): void {
		this.terminated = true;
	}

	addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	emit(type: "message" | "error", data?: WorkerReply): void {
		for (const listener of this.listeners.get(type) ?? []) {
			listener(new MessageEvent(type, { data }));
		}
	}
}

const answer: Behavior = (request, port) => {
	const pdf = new TextEncoder().encode(`%PDF-${request.fileName}`).buffer;

	port.emit("message", encodeResponse(request.jobId, Result.ok({ pdf, degraded: false })));
};

function job(fileName: string): ConvertJob {
	return {
		fileName,
		kind: "docx",
		bytes: new ArrayBuffer(8),
		settings: { size: "letter", quality: "normal" },
	};
}

function harness(...behaviors: Array<Behavior>) {
	const spawned: Array<FakeWorker> = [];
	let ids = 0;

	const converter = createConverter(
		() => {
			const worker = new FakeWorker(behaviors[spawned.length] ?? answer);

			spawned.push(worker);

			return worker;
		},
		() => `job-${(ids += 1)}`,
	);

	return { converter, spawned };
}

describe("createConverter", () => {
	test("runs jobs one at a time on a single worker, in order", async () => {
		const { converter, spawned } = harness();

		const results = await Promise.all(
			["a.docx", "b.docx", "c.docx"].map((name) => converter.convert(job(name))),
		);

		expect(results.every((result) => result.isOk())).toBe(true);
		expect(spawned).toHaveLength(1);
		expect(spawned[0]?.received).toEqual(["a.docx", "b.docx", "c.docx"]);
	});

	test("a worker error becomes WorkerCrashed and the next job gets a fresh worker", async () => {
		const { converter, spawned } = harness((_, port) => port.emit("error"));

		const crashed = await converter.convert(job("a.docx"));
		const next = await converter.convert(job("b.docx"));

		expect(crashed.isErr() && WorkerCrashed.is(crashed.error) && crashed.error.fileName).toBe(
			"a.docx",
		);
		expect(spawned[0]?.terminated).toBe(true);
		expect(next.isOk()).toBe(true);
		expect(spawned).toHaveLength(2);
	});

	test("fatal replies and invalid messages are treated as crashes", async () => {
		const { converter } = harness(
			(_, port) => port.emit("message", { type: "fatal", reason: "bug" }),
			(_, port) => port.emit("message", { nonsense: true }),
		);

		const fatal = await converter.convert(job("a.docx"));
		const invalid = await converter.convert(job("b.docx"));

		expect(fatal.isErr() && WorkerCrashed.is(fatal.error)).toBe(true);
		expect(invalid.isErr() && WorkerCrashed.is(invalid.error)).toBe(true);
	});

	test("an answer for another job is a bug", async () => {
		const { converter } = harness((request, port) =>
			answer({ ...request, jobId: "someone-else" }, port),
		);

		const outcome = converter.convert(job("a.docx"));

		expect(await outcome.then(() => false, isPanic)).toBe(true);
	});

	test("cancel stops the running job and the queued ones, then work resumes", async () => {
		const { converter, spawned } = harness(() => undefined);

		const running = converter.convert(job("a.docx"));
		const queued = converter.convert(job("b.docx"));

		await Promise.resolve();
		converter.cancel();

		const [first, second] = await Promise.all([running, queued]);
		const after = await converter.convert(job("c.docx"));

		expect(first.isErr() && ConversionCancelled.is(first.error)).toBe(true);
		expect(second.isErr() && ConversionCancelled.is(second.error)).toBe(true);
		expect(spawned[0]?.terminated).toBe(true);
		expect(after.isOk()).toBe(true);
	});
});
