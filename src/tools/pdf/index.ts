import { interpolate } from "../../i18n/format.ts";
import { documentLocale } from "../../i18n/locales.ts";
import { translate } from "../../i18n/translate.ts";
import { upgraded } from "../../lib/dom.ts";
import { LanguageSwitchElement } from "../../components/language-switch.ts";
import { AssemblyElement } from "./assembly/element.ts";
import { createAssembly } from "./assembly/run.ts";
import { createConverter, spawnPdfWorker } from "./conversion/converter.ts";
import { DialogsElement } from "./dialogs/element.ts";
import type { NoticeLine } from "./intake/dropzone.ts";
import { DropzoneElement } from "./intake/element.ts";
import { choosePath } from "./intake/paths.ts";
import { admit } from "./intake/pile.ts";
import { SettingsElement } from "./settings/element.ts";
import { browserStore } from "./settings/remembered.ts";
import { createDownloader } from "./shared/download.ts";
import type { PileEntry } from "./shared/entry.ts";
import type { Origin } from "./shared/files.ts";
import { degradedNotice, failureReason, rejectionMessage } from "./shared/labels.ts";
import { backedOut } from "./shared/outcome.ts";
import { SingleElement } from "./single/element.ts";
import { isMoreFiles, runFast, runSinglePdf, type Outcome } from "./single/run.ts";

type Run = typeof runFast;

/** What fills the tool: the empty drop zone, one file's card, or the list. */
type Stage = "idle" | "single" | "assembly";

/** Wires the PDF tool's elements: drop zone → path → worker → download. */
export function startPdfTool(root: Document): void {
	const locale = documentLocale(root);
	const converter = createConverter(spawnPdfWorker);
	const downloads = createDownloader(root);
	let busy = false;
	let assembling = false;
	let last: PileEntry | undefined;
	// The latest "could not convert" line, kept until the user moves on to other files.
	let rejections: ReadonlyArray<NoticeLine> = [];

	// One name, editable in Ajustes and next to Hacer mi PDF: each field mirrors the other.
	const settings = upgraded(root, "kn-settings", SettingsElement).connect(browserStore(), (value) =>
		list.setName(value),
	);

	const prompts = upgraded(root, "kn-dialogs", DialogsElement).connect(locale, () =>
		settings.read(),
	);

	const assembly = createAssembly({ converter, settings: () => settings.read(), prompts, locale });

	// Files that arrive while a conversion or generation runs are ignored (decided in 10).
	const dropzone = upgraded(root, "kn-dropzone", DropzoneElement).connect((files, origin) => {
		if (!busy) void receive(files, origin);
	});

	const backToIdle = (): void => {
		rejections = [];
		dropzone.notice([]);
		show("idle");
	};

	const single = upgraded(root, "kn-single", SingleElement).connect(locale, {
		again: () => downloads.again(),
		another: backToIdle,
		retry: () => {
			if (last !== undefined) void convertOne(last, last.kind === "pdf" ? runSinglePdf : runFast);
		},
		pickAnother: () => {
			backToIdle();
			dropzone.pick();
		},
	});

	const list = upgraded(root, "kn-assembly", AssemblyElement).connect(locale, {
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
		pick: () => dropzone.pick(),
		drop: (files) => {
			if (!busy) void receive(files, "drop");
		},
		typed: (value) => settings.setName(value),
	});

	/** The drop zone and the single-file cards share the space; the list shows on its own. */
	function show(stage: Stage): void {
		dropzone.show(stage === "idle");

		if (stage !== "single") single.show("none");
	}

	const enterAssembly = (): void => {
		assembling = true;
		show("assembly");
		list.show(true);
	};

	const leaveAssembly = (): void => {
		assembling = false;
		list.show(false);
		show("idle");
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
			dropzone.notice([
				{ entries: [name], message: translate(locale, failureReason(result.error)) },
			]);

			return;
		}

		const { pdf, pages, degraded } = result.value;

		const degradedNames = assembly
			.items()
			.filter((item) => item.state.kind === "ready" && item.state.file.degraded)
			.map((item) => item.entry.name);

		downloads.save(pdf, name);
		list.done(name, pages, pdf.size);
		dropzone.notice(
			degraded
				? [
						{
							entries: degradedNames,
							message: interpolate(translate(locale, "degraded.many"), {
								count: degradedNames.length,
							}),
						},
					]
				: [],
		);
	};

	assembly.subscribe((items) => list.render(items));

	async function convertOne(entry: PileEntry, run: Run): Promise<void> {
		busy = true;
		last = entry;
		downloads.release();
		show("single");
		single.converting(entry.name, entry.kind);

		const result: Outcome = await run(entry, converter, settings.read(), prompts);

		busy = false;

		if (result === backedOut) {
			show("idle");

			return;
		}

		if (isMoreFiles(result)) {
			assembly.adopt(result.entry, result.file);
			enterAssembly();
			dropzone.pick();

			return;
		}

		if (result.isErr()) {
			single.failed(entry.name, entry.kind, failureReason(result.error));

			return;
		}

		const { name, pdf, pages, degraded } = result.value;

		downloads.save(pdf, name);
		// Files turned away on the way in stay listed next to what the conversion reported.
		dropzone.notice([
			...rejections,
			...(degraded
				? [{ entries: [entry.name], message: translate(locale, degradedNotice(entry.kind)) }]
				: []),
		]);
		single.done(name, pages, pdf.size);
	}

	async function receive(files: ReadonlyArray<File>, origin: Origin): Promise<void> {
		const current = assembly.items().map((item) => item.entry);
		const { pile, rejected } = await admit(assembling ? current : [], files);
		const accepted = assembling ? pile.slice(current.length) : pile;
		const names = rejected.map((rejection) => rejection.fileName);

		rejections =
			names.length > 0 ? [{ entries: names, message: rejectionMessage(locale, names.length) }] : [];
		dropzone.notice(rejections);

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
	}

	// Switching language reloads the page; with files in the list or a conversion running, ask first.
	upgraded(root, "kn-language-switch", LanguageSwitchElement).guard(
		() => busy || assembly.items().length > 0,
	);
}
