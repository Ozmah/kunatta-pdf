import { isLocale, defaultLocale, type Locale } from "../../i18n/locales.ts";
import { translate } from "../../i18n/translate.ts";
import { createConverter, spawnPdfWorker } from "./converter.ts";
import { createDownloader } from "./download.ts";
import { connectDropzone } from "./dropzone.ts";
import { connectDialogs } from "./dialogs.ts";
import {
	backedOut,
	degradedNotice,
	failureReason,
	runFast,
	runSinglePdf,
	type Outcome,
} from "./fast.ts";
import { connectFastView, rejectionMessage } from "./fast-view.ts";
import { connectSettings } from "./gear.ts";
import { choosePath } from "./paths.ts";
import { admit, type PileEntry } from "./pile.ts";

function pageLocale(root: Document): Locale {
	const lang = root.documentElement.lang;

	return isLocale(lang) ? lang : defaultLocale;
}

/** Wires the PDF tool: drop zone → path → worker → download. */
export function startPdfTool(root: Document): void {
	const locale = pageLocale(root);
	const settings = connectSettings(root);
	const converter = createConverter(spawnPdfWorker);
	const view = connectFastView(root, locale);
	const downloads = createDownloader(root);
	let busy = false;
	let last: PileEntry | undefined;

	const prompts = connectDialogs(root, locale, () => settings.read());

	type Run = typeof runFast;

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

	const dropzone = connectDropzone(root, (files, origin) => {
		if (busy) return;

		void admit([], files).then(async ({ pile, rejected }) => {
			const names = rejected.map((rejection) => rejection.fileName);

			view.notice(names, names.length > 0 ? rejectionMessage(locale, names.length) : undefined);

			const path = choosePath(pile, origin);

			// Assembly (9c) is not wired yet.
			if (path.kind === "fast") await convertOne(path.entry, runFast);

			if (path.kind === "single-pdf") await convertOne(path.entry, runSinglePdf);
		});
	});

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
