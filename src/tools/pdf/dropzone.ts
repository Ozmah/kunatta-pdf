import { Panic } from "better-result";

import { required } from "./markup.ts";
import type { Origin } from "./paths.ts";

/** Receives files in the order they arrived, with how they arrived. */
export type ReceiveFiles = (files: ReadonlyArray<File>, origin: Origin) => void;

/** True when a drag carries files (as opposed to text or links). */
export function carriesFiles(types: ReadonlyArray<string>): boolean {
	return types.includes("Files");
}

/** Apple keyboards paste with ⌘ instead of Ctrl. */
export function isApplePlatform(platform: string): boolean {
	return /mac|iphone|ipad|ipod/i.test(platform);
}

export interface DropzoneControl {
	/** Opens the system file picker. */
	pick(): void;
}

export function connectDropzone(root: Document, receive: ReceiveFiles): DropzoneControl {
	const zones = Array.from(root.querySelectorAll<HTMLElement>("[data-dropzone]"));
	const picker = required<HTMLInputElement>(root, "[data-picker]");

	if (zones.length === 0) throw new Panic({ message: "The page has no [data-dropzone]" });

	const deliver = (files: ReadonlyArray<File>, origin: Origin): void => {
		if (files.length > 0) receive(files, origin);
	};

	// A file dropped anywhere else would make the browser navigate away from the page.
	root.defaultView?.addEventListener("dragover", (event) => event.preventDefault());
	root.defaultView?.addEventListener("drop", (event) => event.preventDefault());

	// The empty drop zone and the assembly's "add files" strip accept drops the same way.
	for (const zone of zones) {
		let depth = 0;

		const setDragging = (dragging: boolean): void => {
			zone.toggleAttribute("data-dragging", dragging);
		};

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
			deliver(Array.from(event.dataTransfer?.files ?? []), "drop");
		});
	}

	picker.addEventListener("change", () => {
		deliver(Array.from(picker.files ?? []), "pick");
		// Clearing the value lets the same file be picked again later.
		picker.value = "";
	});

	root.addEventListener("paste", (event) => {
		const files = Array.from(event.clipboardData?.files ?? []);

		if (files.length === 0) return;

		event.preventDefault();
		deliver(files, "paste");
	});

	const platform =
		root.defaultView?.navigator.platform || root.defaultView?.navigator.userAgent || "";

	if (isApplePlatform(platform)) {
		const modifier = root.querySelector("[data-modifier]");

		if (modifier !== null) modifier.textContent = "⌘";
	}

	return { pick: () => picker.click() };
}
