import { Result, type Result as ResultType } from "better-result";

import {
	addEntries,
	moveBy,
	moveTo,
	removeItem,
	togglePin,
	updateState,
	isStale,
	type ConvertSettings,
	type Items,
} from "./assembly.ts";
import type { Converter } from "./converter.ts";
import { ConversionCancelled, PasswordRequired, type ComposeJobError } from "./errors.ts";
import { backedOut, type FastPdf } from "./fast.ts";
import type { PileEntry } from "./pile.ts";
import type { FilePdf } from "./protocol.ts";
import type { Settings } from "./settings.ts";

export interface AssemblyPrompts {
	/** "No pudimos convertir N de M": back to the list, or make the PDF without them. */
	summary(problems: Items, total: number): Promise<"back" | "without">;
	resultPassword(name: string, pages: number): Promise<string | undefined>;
}

export type GenerateOutcome = ResultType<FastPdf, ComposeJobError> | typeof backedOut;

export interface Assembly {
	items(): Items;
	subscribe(listener: (items: Items) => void): void;
	add(entries: ReadonlyArray<PileEntry>): void;
	/** Takes a file that was already converted, such as the PDF from the single-PDF dialog. */
	adopt(entry: PileEntry, file: FilePdf): void;
	remove(id: string): void;
	pin(id: string): void;
	moveTo(id: string, position: number): void;
	moveBy(id: string, delta: -1 | 1): void;
	/** Tries a locked file again with the password typed in its row. */
	unlock(id: string, password: string): void;
	/** Waits for pending checks, settles failures with the user, then composes in list order. */
	generate(name: string): Promise<GenerateOutcome>;
	/** Stops a generation in progress; checks resume on their own. */
	cancel(): void;
}

export interface AssemblyOptions {
	readonly converter: Converter;
	readonly settings: () => Settings;
	readonly prompts: AssemblyPrompts;
	readonly locale: string;
}

function convertSettings(settings: Settings): ConvertSettings {
	return { size: settings.size, quality: settings.quality };
}

/**
 * The list behind the assembly view. Every file is converted in the background as soon as it
 * enters, one at a time, so "Make my PDF" mostly just composes.
 */
export function createAssembly(options: AssemblyOptions): Assembly {
	const { converter, prompts, locale } = options;
	const listeners: Array<(items: Items) => void> = [];
	const passwords = new Map<string, string>();
	let items: Items = [];
	let running = false;
	let generation = 0;
	let idle: Array<() => void> = [];
	// Ends the wait of the generation in progress; checks keep going on their own.
	let stopWaiting: (() => void) | undefined;

	const set = (next: Items): void => {
		items = next;

		for (const listener of listeners) listener(items);
	};

	const has = (id: string): boolean => items.some((item) => item.entry.id === id);

	const checkNext = async (): Promise<void> => {
		if (running) return;

		running = true;

		for (;;) {
			const item = items.find((candidate) => candidate.state.kind === "checking");

			if (item === undefined) break;

			const { entry } = item;
			const used = convertSettings(options.settings());
			const password = passwords.get(entry.id);
			const job = { fileName: entry.name, kind: entry.kind, file: entry.source, settings: used };

			const converted = await converter.convert(
				password === undefined ? job : { ...job, password },
			);

			// The file may have been removed while it was converting.
			if (!has(entry.id)) continue;

			if (converted.isOk()) {
				set(
					updateState(items, entry.id, {
						kind: "ready",
						file: converted.value,
						usedSettings: used,
					}),
				);
			} else if (PasswordRequired.is(converted.error)) {
				set(updateState(items, entry.id, { kind: "locked", wrong: password !== undefined }));
			} else if (!ConversionCancelled.is(converted.error)) {
				set(updateState(items, entry.id, { kind: "failed", error: converted.error }));
			}
		}

		running = false;

		for (const resolve of idle) resolve();

		idle = [];
	};

	const settled = (): Promise<void> =>
		running || items.some((item) => item.state.kind === "checking")
			? new Promise((resolve) => {
					idle.push(resolve);
					void checkNext();
				})
			: Promise.resolve();

	const requeueStale = (): void => {
		const current = convertSettings(options.settings());

		const stale = items.filter(
			(item) =>
				item.state.kind === "ready" && isStale(item.entry.kind, item.state.usedSettings, current),
		);

		set(
			stale.reduce((next, item) => updateState(next, item.entry.id, { kind: "checking" }), items),
		);
	};

	return {
		items: () => items,
		subscribe: (listener) => listeners.push(listener),

		add(entries) {
			set(addEntries(items, entries, locale));
			void checkNext();
		},

		adopt(entry, file) {
			const added = addEntries(items, [entry], locale);
			const used = convertSettings(options.settings());

			set(updateState(added, entry.id, { kind: "ready", file, usedSettings: used }));
		},

		remove(id) {
			passwords.delete(id);
			set(removeItem(items, id));
		},

		pin: (id) => set(togglePin(items, id)),
		moveTo: (id, position) => set(moveTo(items, id, position)),
		moveBy: (id, delta) => set(moveBy(items, id, delta)),

		unlock(id, password) {
			passwords.set(id, password);
			set(updateState(items, id, { kind: "checking" }));
			void checkNext();
		},

		async generate(name) {
			const mine = (generation += 1);
			const cancelled = (): boolean => mine !== generation;

			requeueStale();

			// Cancel must not wait for the checks: a check restarts after the worker is stopped.
			const stopped = Promise.withResolvers<void>();

			stopWaiting = stopped.resolve;

			try {
				await Promise.race([settled(), stopped.promise]);
			} finally {
				// Only this wait may be ended from outside; a later cancel must not reach it.
				stopWaiting = undefined;
			}

			if (cancelled()) return backedOut;

			const problems = items.filter((item) => item.state.kind !== "ready");

			if (problems.length > 0) {
				const choice = await prompts.summary(problems, items.length);

				if (choice === "back" || cancelled()) return backedOut;

				set(problems.reduce((next, item) => removeItem(next, item.entry.id), items));
			}

			const parts = items.flatMap((item) => (item.state.kind === "ready" ? [item.state.file] : []));

			if (parts.length === 0) return backedOut;

			const pages = parts.reduce((total, part) => total + part.pages, 0);
			let password: string | undefined;

			if (options.settings().password === "on") {
				password = await prompts.resultPassword(name, pages);

				if (password === undefined || cancelled()) return backedOut;
			}

			const job = {
				fileName: name,
				parts: parts.map((part) => part.pdf),
				size: options.settings().size,
			};

			const composed = await converter.compose(password === undefined ? job : { ...job, password });

			if (cancelled()) return backedOut;

			const degraded = parts.some((part) => part.degraded);

			return composed.isOk()
				? Result.ok({ name, pdf: composed.value.pdf, pages: composed.value.pages, degraded })
				: composed;
		},

		cancel() {
			generation += 1;
			stopWaiting?.();
			converter.cancel();
		},
	};
}
