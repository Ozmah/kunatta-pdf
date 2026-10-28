import { Panic, Result, type Result as ResultType } from "better-result";
import * as v from "valibot";

import { ConversionCancelled, WorkerCrashed, type JobError } from "./errors.ts";
import {
	decodeResult,
	WorkerMessageSchema,
	type ConvertRequest,
	type FilePdf,
} from "./protocol.ts";

/** The part of `Worker` the converter uses, so tests can drive it without a real thread. */
export interface WorkerPort {
	postMessage(message: ConvertRequest, transfer: Array<Transferable>): void;
	terminate(): void;
	addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
	addEventListener(type: "error" | "messageerror", listener: () => void): void;
}

export type SpawnWorker = () => WorkerPort;

export type ConvertJob = Omit<ConvertRequest, "type" | "jobId">;

export type JobResult = ResultType<FilePdf, JobError>;

export interface Converter {
	/** Converts one file. Jobs run one at a time, in the order they were requested. */
	convert(job: ConvertJob): Promise<JobResult>;
	/** Stops the running job and every queued one; already finished results stay valid. */
	cancel(): void;
}

interface Running {
	readonly jobId: string;
	readonly fileName: string;
	readonly settle: (result: JobResult) => void;
	readonly fail: (panic: Panic) => void;
}

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

	const finish = (handler: (job: Running) => void): void => {
		const job = running;

		running = undefined;

		if (job !== undefined) handler(job);
	};

	const crash = (): void => {
		discard();
		finish((job) =>
			job.settle(
				Result.err(
					new WorkerCrashed({
						fileName: job.fileName,
						message: `the worker stopped while converting ${job.fileName}`,
					}),
				),
			),
		);
	};

	const attach = (port: WorkerPort): WorkerPort => {
		// Events from a worker that was already replaced are ignored.
		const current = (): boolean => port === worker;

		port.addEventListener("message", (event) => {
			if (!current()) return;

			const parsed = v.safeParse(WorkerMessageSchema, event.data);

			// A message that breaks the protocol or a fatal reply both mean the worker is no longer usable.
			if (!parsed.success || "type" in parsed.output) {
				crash();

				return;
			}

			const response = parsed.output;

			if (response.jobId !== running?.jobId) {
				discard();
				finish((job) =>
					job.fail(
						new Panic({ message: `worker answered ${response.jobId} while running ${job.jobId}` }),
					),
				);

				return;
			}

			finish((job) => job.settle(decodeResult(response)));
		});

		const crashIfCurrent = (): void => {
			if (current()) crash();
		};

		port.addEventListener("error", crashIfCurrent);
		port.addEventListener("messageerror", crashIfCurrent);

		return port;
	};

	const run = (job: ConvertJob, startedIn: number): Promise<JobResult> => {
		if (startedIn !== generation) {
			return Promise.resolve(
				Result.err(
					new ConversionCancelled({
						fileName: job.fileName,
						message: `${job.fileName} was cancelled before it started`,
					}),
				),
			);
		}

		return new Promise<JobResult>((settle, fail) => {
			const jobId = nextId();

			running = { jobId, fileName: job.fileName, settle, fail };
			worker ??= attach(spawn());
			// The bytes are transferred: after this call the caller's buffer is empty.
			worker.postMessage({ type: "convert", jobId, ...job }, [job.bytes]);
		});
	};

	return {
		convert(job) {
			const startedIn = generation;
			const result = queue.then(() => run(job, startedIn));

			queue = result.catch(() => undefined);

			return result;
		},

		cancel() {
			generation += 1;
			discard();
			finish((job) =>
				job.settle(
					Result.err(
						new ConversionCancelled({
							fileName: job.fileName,
							message: `${job.fileName} was cancelled`,
						}),
					),
				),
			);
		},
	};
}
