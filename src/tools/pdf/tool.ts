import { isLocale, defaultLocale, type Locale } from "../../i18n/locales.ts";
import { translate } from "../../i18n/translate.ts";
import { withCount } from "../../i18n/format.ts";
import { createAssembly } from "./assembly-run.ts";
import { connectAssemblyView } from "./assembly-view.ts";
import { createConverter, spawnPdfWorker } from "./converter.ts";
import { connectDialogs } from "./dialogs.ts";
import { createDownloader } from "./download.ts";
import { connectDropzone } from "./dropzone.ts";
import {
	backedOut,
	degradedNotice,
	failureReason,
	isMoreFiles,
	runFast,
	runSinglePdf,
	type Outcome,
} from "./fast.ts";
import { connectFastView, rejectionMessage } from "./fast-view.ts";
import { connectSettings } from "./gear.ts";
import { connectLanguageGuard } from "./language-guard.ts";
import { choosePath, type Origin } from "./paths.ts";
import { admit, type PileEntry } from "./pile.ts";

function pageLocale(root: Document): Locale {
	const lang = root.documentElement.lang;

	return isLocale(lang) ? lang : defaultLocale;
}

type Run = typeof runFast;

/** Wires the PDF tool: drop zone → path → worker → download. */
export function startPdfTool(root: Document): void {
	const locale = pageLocale(root);
	const settings = connectSettings(root);
	const converter = createConverter(spawnPdfWorker);
	const view = connectFastView(root, locale);
	const downloads = createDownloader(root);
	const prompts = connectDialogs(root, locale, () => settings.read());
	const assembly = createAssembly({ converter, settings: () => settings.read(), prompts, locale });
	let busy = false;
	let assembling = false;
	let last: PileEntry | undefined;

	const enterAssembly = (): void => {
		assembling = true;
		view.show("assembly");
		list.show(true);
	};

	const leaveAssembly = (): void => {
		assembling = false;
		list.show(false);
		view.show("idle");
	};

	const makeAssembly = async (): Promise<void> => {
		busy = true;
		downloads.release();
		list.working(true);

		const name = list.name();
		const result = await assembly.generate(name);

		list.working(false);
		busy = false;

		if (result === backedOut) return;

		if (result.isErr()) {
			view.notice([name], translate(locale, failureReason(result.error)));

			return;
		}

		const { pdf, pages, degraded } = result.value;

		const degradedNames = assembly
			.items()
			.filter((item) => item.state.kind === "ready" && item.state.file.degraded)
			.map((item) => item.entry.name);

		downloads.save(pdf, name);
		list.done(name, pages, pdf.size);
		view.notice(
			degraded ? degradedNames : [],
			degraded ? withCount(translate(locale, "degraded.many"), degradedNames.length) : undefined,
		);
	};

	const list = connectAssemblyView(root, locale, {
		pin: (id) => assembly.pin(id),
		move: (id, delta) => assembly.moveBy(id, delta),
		moveTo: (id, position) => assembly.moveTo(id, position),
		remove: (id) => {
			assembly.remove(id);

			if (assembly.items().length === 0) leaveAssembly();
		},
		unlock: (id, password) => assembly.unlock(id, password),
		make: () => void makeAssembly(),
		cancel: () => assembly.cancel(),
		again: () => downloads.again(),
	});

	assembly.subscribe((items) => list.render(items));

	const convertOne = async (entry: PileEntry, run: Run): Promise<void> => {
		busy = true;
		last = entry;
		downloads.release();
		view.converting(entry.name, entry.kind);

		const result: Outcome = await run(entry, converter, settings.read(), prompts);

		busy = false;

		if (result === backedOut) {
			view.show("idle");

			return;
		}

		if (isMoreFiles(result)) {
			assembly.adopt(result.entry, result.file);
			enterAssembly();
			dropzone.pick();

			return;
		}

		if (result.isErr()) {
			view.failed(entry.name, entry.kind, failureReason(result.error));

			return;
		}

		const { name, pdf, pages, degraded } = result.value;

		downloads.save(pdf, name);
		view.notice(
			degraded ? [entry.name] : [],
			degraded ? translate(locale, degradedNotice(entry.kind)) : undefined,
		);
		view.done(name, pages, pdf.size);
	};

	const receive = async (files: ReadonlyArray<File>, origin: Origin): Promise<void> => {
		const current = assembly.items().map((item) => item.entry);
		const { pile, rejected } = await admit(assembling ? current : [], files);
		const accepted = assembling ? pile.slice(current.length) : pile;
		const names = rejected.map((rejection) => rejection.fileName);

		view.notice(names, names.length > 0 ? rejectionMessage(locale, names.length) : undefined);

		if (assembling) {
			assembly.add(accepted);

			return;
		}

		const path = choosePath(accepted, origin);

		if (path.kind === "assembly") {
			assembly.add(accepted);
			enterAssembly();
		} else if (path.kind === "fast") {
			await convertOne(path.entry, runFast);
		} else if (path.kind === "single-pdf") {
			await convertOne(path.entry, runSinglePdf);
		}
	};

	connectLanguageGuard(root, {
		hasWork: () => busy || assembly.items().length > 0,
		confirm: (target) => prompts.confirmLanguage(target),
	});

	// One name, editable in Settings and next to Make my PDF.
	const nameFields = Array.from(root.querySelectorAll<HTMLInputElement>("input[data-pdf-name]"));

	for (const field of nameFields) {
		field.addEventListener("input", () => {
			for (const other of nameFields) if (other !== field) other.value = field.value;
		});
	}

	// Files that arrive while a conversion or generation runs are ignored (decided in 10).
	const dropzone = connectDropzone(root, (files, origin) => {
		if (!busy) void receive(files, origin);
	});

	root.querySelector("[data-add]")?.addEventListener("click", () => dropzone.pick());

	root.querySelector("[data-download-again]")?.addEventListener("click", () => downloads.again());

	root.querySelector("[data-another]")?.addEventListener("click", () => {
		view.notice([], undefined);
		view.show("idle");
	});

	root.querySelector("[data-retry]")?.addEventListener("click", () => {
		if (last !== undefined) void convertOne(last, last.kind === "pdf" ? runSinglePdf : runFast);
	});

	root.querySelector("[data-pick-another]")?.addEventListener("click", () => {
		view.notice([], undefined);
		view.show("idle");
		dropzone.pick();
	});
}
