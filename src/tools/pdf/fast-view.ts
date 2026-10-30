import { fileSize, interpolate, pageCount } from "../../i18n/format.ts";
import type { MessageKey } from "../../i18n/es.ts";
import type { Locale } from "../../i18n/locales.ts";
import { translate } from "../../i18n/translate.ts";
import { required } from "./markup.ts";
import type { InputKind } from "./sniff.ts";

/** "assembly" hides every fast-path view: the list takes the space. */
type View = "idle" | "converting" | "done" | "failed" | "assembly";

/** One line of the dotted notice: file names in code style and what happened to them. */
export interface NoticeLine {
	readonly entries: ReadonlyArray<string>;
	readonly message: string;
}

export interface FastView {
	show(view: View): void;
	converting(fileName: string, kind: InputKind): void;
	done(pdfName: string, pages: number, bytes: number): void;
	failed(fileName: string, kind: InputKind, reason: MessageKey): void;
	/** Shows every line, one under the other; no lines hide the notice. */
	notice(lines: ReadonlyArray<NoticeLine>): void;
}

/** The label on the file's card: JPG instead of jpeg, TXT for plain text. */
export function kindLabel(kind: InputKind): string {
	if (kind === "jpeg") return "JPG";

	if (kind === "text") return "TXT";

	return kind.toUpperCase();
}

/** Every user-provided string goes through textContent; nothing here builds HTML. */
export function connectFastView(root: Document, locale: Locale): FastView {
	const flow = required(root, "[data-flow]");
	const drop = required(root, "[data-empty-drop]");

	const views = {
		converting: required(root, '[data-view="converting"]'),
		done: required(root, '[data-view="done"]'),
		failed: required(root, '[data-view="failed"]'),
	};

	const notice = required(root, "[data-notice]");
	const noticeText = required(root, "[data-notice-text]");

	const show = (view: View): void => {
		drop.hidden = view !== "idle";
		flow.hidden = view !== "idle" || !notice.hidden;

		for (const [name, element] of Object.entries(views)) element.hidden = name !== view;

		if (view !== "idle" && view !== "assembly")
			required<HTMLHeadingElement>(views[view], "h2").focus();
	};

	return {
		show,

		converting(fileName, kind) {
			required(views.converting, "[data-kind-label]").textContent = kindLabel(kind);
			required(views.converting, "[data-source-name]").textContent = fileName;
			show("converting");
		},

		done(pdfName, pages, bytes) {
			const details = [pdfName, pageCount(locale, pages), fileSize(locale, bytes)];

			required(views.done, "[data-result]").textContent = details.join(" · ");
			show("done");
		},

		failed(fileName, kind, reason) {
			required(views.failed, "[data-failed-kind]").textContent = kindLabel(kind);
			required(views.failed, "[data-failure]").textContent =
				`${fileName} · ${translate(locale, reason)}`;
			show("failed");
		},

		notice(lines) {
			noticeText.replaceChildren();
			notice.hidden = lines.length === 0;
			// The file → PDF flow belongs to the empty drop zone only.
			flow.hidden = !notice.hidden || drop.hidden;

			lines.forEach(({ entries, message }, lineIndex) => {
				const names = entries.flatMap((entry, index) => {
					const code = root.createElement("code");

					code.textContent = entry;

					return index === 0 ? [code] : [", ", code];
				});

				if (lineIndex > 0) noticeText.append(root.createElement("br"));

				// One file reads "a.mp4 cannot…"; several read "N files did not fit: a, b".
				if (entries.length === 1) noticeText.append(...names, ` ${message}`);
				else noticeText.append(`${message} `, ...names);
			});
		},
	};
}

/** The rejected-files notice: one file reads "x no se puede…", several read "No entraron N archivos: a, b". */
export function rejectionMessage(locale: Locale, count: number): string {
	return count === 1
		? translate(locale, "rejected.one")
		: interpolate(translate(locale, "rejected.many"), { count });
}
