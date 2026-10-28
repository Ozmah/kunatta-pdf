import { Panic, Result, type Result as ResultType } from "better-result";
import * as v from "valibot";

import {
	ConversionCancelled,
	WorkerCrashed,
	type ComposeJobError,
	type JobError,
} from "./errors.ts";
import {
	ComposeResponseSchema,
	ConvertResponseSchema,
	decodeComposed,
	decodeConverted,
	FatalSchema,
	type ComposedPdf,
	type ComposeRequest,
	type ConvertRequest,
	type FilePdf,
	type WorkerRequest,
} from "./protocol.ts";

/** The part of `Worker` the converter uses, so tests can drive it without a real thread. */
export interface WorkerPort {
	postMessage(message: WorkerRequest, transfer: Array<Transferable>): void;
	terminate(): void;
	addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
	addEventListener(type: "error" | "messageerror", listener: () => void): void;
}

export type SpawnWorker = () => WorkerPort;

export type ConvertJob = Omit<ConvertRequest, "type" | "jobId">;

export type ComposeJob = Omit<ComposeRequest, "type" | "jobId">;

export type JobResult = ResultType<FilePdf, JobError>;

export type ComposeResult = ResultType<ComposedPdf, ComposeJobError>;

export interface Converter {
	/** Converts one file. Jobs run one at a time, in the order they were requested. */
	convert(job: ConvertJob): Promise<JobResult>;
	/** Joins converted files into the final PDF, queued like any other job. */
	compose(job: ComposeJob): Promise<ComposeResult>;
	/** Stops the running job and every queued one; already finished results stay valid. */
	cancel(): void;
}

/** What one message means for the running job. */
type Reading<Value> =
	| { readonly kind: "answer"; readonly jobId: string; readonly value: Value }
	| { readonly kind: "broken" };

/** What happened when the running job looked at a message. */
type Received = "settled" | "broken" | "panicked";

interface Running {
	readonly jobId: string;
	/** Reads a message and, when it is this job's answer, resolves the job. */
	readonly receive: (event: MessageEvent<unknown>) => Received;
	readonly stop: (why: "crashed" | "cancelled") => void;
}

function reader<Value, Schema extends v.GenericSchema<unknown, { readonly jobId: string }>>(
	schema: Schema,
	decode: (response: v.InferOutput<Schema>) => Value,
): (event: MessageEvent<unknown>) => Reading<Value> {
	return (event) => {
		// A fatal reply or a message that breaks the protocol both mean the worker is no longer usable.
		if (v.is(FatalSchema, event.data)) return { kind: "broken" };

		const parsed = v.safeParse(schema, event.data);

		if (!parsed.success) return { kind: "broken" };

		const response = parsed.output;

		return { kind: "answer", jobId: response.jobId, value: decode(response) };
	};
}

const readConverted = reader(ConvertResponseSchema, decodeConverted);
const readComposed = reader(ComposeResponseSchema, decodeComposed);

const randomId = (): string => crypto.randomUUID();

/** The real worker. Vite bundles worker-entry.ts and everything it imports as a separate chunk. */
export const spawnPdfWorker: SpawnWorker = () =>
	new Worker(new URL("./worker-entry.ts", import.meta.url), {
		type: "module",
		name: "kunatta-pdf",
	});

export function createConverter(spawn: SpawnWorker, nextId: () => string = randomId): Converter {
	let worker: WorkerPort | undefined;
	let running: Running | undefined;
	let queue: Promise<unknown> = Promise.resolve();
	let generation = 0;

	const discard = (): void => {
		worker?.terminate();
		worker = undefined;
	};

	const stop = (why: "crashed" | "cancelled"): void => {
		const job = running;

		running = undefined;
		job?.stop(why);
	};

	const attach = (port: WorkerPort): WorkerPort => {
		// Events from a worker that was already replaced are ignored.
		const current = (): boolean => port === worker;

		port.addEventListener("message", (event) => {
			if (!current() || running === undefined) return;

			const received = running.receive(event);

			if (received !== "settled") discard();

			if (received === "broken") stop("crashed");
			else running = undefined;
		});

		const crashIfCurrent = (): void => {
			if (!current()) return;

			discard();
			stop("crashed");
		};

		port.addEventListener("error", crashIfCurrent);
		port.addEventListener("messageerror", crashIfCurrent);

		return port;
	};

	const run = <Ok, Err>(
		fileName: string,
		startedIn: number,
		request: (jobId: string) => WorkerRequest,
		read: (event: MessageEvent<unknown>) => Reading<ResultType<Ok, Err>>,
	): Promise<ResultType<Ok, Err | WorkerCrashed | ConversionCancelled>> => {
		const cancelled = new ConversionCancelled({ fileName, message: `${fileName} was cancelled` });

		if (startedIn !== generation) return Promise.resolve(Result.err(cancelled));

		return new Promise((resolve, fail) => {
			const jobId = nextId();

			running = {
				jobId,
				receive(event) {
					const reading = read(event);

					if (reading.kind === "broken") return "broken";

					if (reading.jobId !== jobId) {
						fail(new Panic({ message: `worker answered ${reading.jobId} while running ${jobId}` }));

						return "panicked";
					}

					resolve(reading.value);

					return "settled";
				},
				stop(why) {
					resolve(
						Result.err(
							why === "cancelled"
								? cancelled
								: new WorkerCrashed({
										fileName,
										message: `the worker stopped while working on ${fileName}`,
									}),
						),
					);
				},
			};
			worker ??= attach(spawn());
			// Files travel as Blobs, by reference: nothing to transfer.
			worker.postMessage(request(jobId), []);
		});
	};

	const schedule = <Value>(job: () => Promise<Value>): Promise<Value> => {
		const result = queue.then(job);

		queue = result.catch(() => undefined);

		return result;
	};

	return {
		convert(job) {
			const startedIn = generation;

			return schedule(() =>
				run(
					job.fileName,
					startedIn,
					(jobId) => ({ type: "convert", jobId, ...job }),
					readConverted,
				),
			);
		},

		compose(job) {
			const startedIn = generation;

			return schedule(() =>
				run(job.fileName, startedIn, (jobId) => ({ type: "compose", jobId, ...job }), readComposed),
			);
		},

		cancel() {
			generation += 1;
			discard();
			stop("cancelled");
		},
	};
}
