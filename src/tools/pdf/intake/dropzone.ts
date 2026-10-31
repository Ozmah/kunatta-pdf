import { required } from "../../../lib/dom.ts";
import { acceptDrops, type ReceiveFiles } from "../shared/files.ts";

/** Apple keyboards paste with ⌘ instead of Ctrl. */
export function isApplePlatform(platform: string): boolean {
	return /mac|iphone|ipad|ipod/i.test(platform);
}

/** One line of the dotted notice: file names in code style and what happened to them. */
export interface NoticeLine {
	readonly entries: ReadonlyArray<string>;
	readonly message: string;
}

export interface DropzoneControl {
	/** Opens the system file picker. */
	pick(): void;
	/** The empty drop zone shows only while nothing else takes its place. */
	show(idle: boolean): void;
	/** Shows every line, one under the other; no lines hide the notice. */
	notice(lines: ReadonlyArray<NoticeLine>): void;
}

/**
 * The way in: the empty drop zone, the file picker and pasting anywhere on the page, plus the
 * notice above them. Every user-provided string goes through textContent.
 */
export function connectDropzone(host: HTMLElement, receive: ReceiveFiles): DropzoneControl {
	const page = host.ownerDocument;
	const flow = required(host, "[data-flow]");
	const drop = required(host, "[data-empty-drop]");
	const picker = required<HTMLInputElement>(host, "[data-picker]");
	const notice = required(host, "[data-notice]");
	const noticeText = required(host, "[data-notice-text]");

	// A file dropped anywhere else would make the browser navigate away from the page.
	page.defaultView?.addEventListener("dragover", (event) => event.preventDefault());
	page.defaultView?.addEventListener("drop", (event) => event.preventDefault());

	acceptDrops(drop, (files) => receive(files, "drop"));

	picker.addEventListener("change", () => {
		const files = Array.from(picker.files ?? []);

		if (files.length > 0) receive(files, "pick");

		// Clearing the value lets the same file be picked again later.
		picker.value = "";
	});

	page.addEventListener("paste", (event) => {
		const files = Array.from(event.clipboardData?.files ?? []);

		if (files.length === 0) return;

		event.preventDefault();
		receive(files, "paste");
	});

	const platform =
		page.defaultView?.navigator.platform || page.defaultView?.navigator.userAgent || "";

	if (isApplePlatform(platform)) required(host, "[data-modifier]").textContent = "⌘";

	return {
		pick: () => picker.click(),

		show(idle) {
			drop.hidden = !idle;
			flow.hidden = !idle || !notice.hidden;
		},

		notice(lines) {
			noticeText.replaceChildren();
			notice.hidden = lines.length === 0;
			// The file → PDF flow belongs to the empty drop zone only.
			flow.hidden = !notice.hidden || drop.hidden;

			lines.forEach(({ entries, message }, lineIndex) => {
				const names = entries.flatMap((entry, index) => {
					const code = page.createElement("code");

					code.textContent = entry;

					return index === 0 ? [code] : [", ", code];
				});

				if (lineIndex > 0) noticeText.append(page.createElement("br"));

				// One file reads "a.mp4 cannot…"; several read "N files did not fit: a, b".
				if (entries.length === 1) noticeText.append(...names, ` ${message}`);
				else noticeText.append(`${message} `, ...names);
			});
		},
	};
}
