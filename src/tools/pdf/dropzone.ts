import { admit, type Admission, type Pile } from "./pile.ts";

/** Fired on the document after every admission; the pile view listens to it. */
export const pileEvent = "kunatta:pile";

export type PileEventDetail = Admission;

/** True when a drag carries files (as opposed to text or links). */
export function carriesFiles(types: ReadonlyArray<string>): boolean {
	return types.includes("Files");
}

/** Apple keyboards paste with ⌘ instead of Ctrl. */
export function isApplePlatform(platform: string): boolean {
	return /mac|iphone|ipad|ipod/i.test(platform);
}

export function connectDropzone(root: Document): void {
	const zone = root.querySelector<HTMLLabelElement>("[data-dropzone]");
	const picker = root.querySelector<HTMLInputElement>("[data-picker]");

	if (zone === null || picker === null) throw new Error("Dropzone markup is missing");

	let pile: Pile = [];
	let queue = Promise.resolve();
	let depth = 0;

	// Admissions run one after another so files keep the order in which they arrived.
	const receive = (files: ReadonlyArray<File>): void => {
		if (files.length === 0) return;

		queue = queue.then(async () => {
			const admission = await admit(pile, files);

			pile = admission.pile;
			root.dispatchEvent(new CustomEvent<PileEventDetail>(pileEvent, { detail: admission }));
		});
	};

	const setDragging = (dragging: boolean): void => {
		zone.toggleAttribute("data-dragging", dragging);
	};

	// A file dropped anywhere else would make the browser navigate away from the page.
	root.defaultView?.addEventListener("dragover", (event) => event.preventDefault());
	root.defaultView?.addEventListener("drop", (event) => event.preventDefault());

	zone.addEventListener("dragenter", (event) => {
		if (!carriesFiles(event.dataTransfer?.types ?? [])) return;

		depth += 1;
		setDragging(true);
	});

	zone.addEventListener("dragleave", () => {
		depth = Math.max(0, depth - 1);

		if (depth === 0) setDragging(false);
	});

	zone.addEventListener("drop", (event) => {
		depth = 0;
		setDragging(false);
		receive(Array.from(event.dataTransfer?.files ?? []));
	});

	picker.addEventListener("change", () => {
		receive(Array.from(picker.files ?? []));
		// Clearing the value lets the same file be picked again later.
		picker.value = "";
	});

	root.addEventListener("paste", (event) => {
		const files = Array.from(event.clipboardData?.files ?? []);

		if (files.length === 0) return;

		event.preventDefault();
		receive(files);
	});

	const platform =
		root.defaultView?.navigator.platform || root.defaultView?.navigator.userAgent || "";

	if (isApplePlatform(platform)) {
		const modifier = root.querySelector("[data-modifier]");

		if (modifier !== null) modifier.textContent = "⌘";
	}
}
