import { fileSize, pageCount, withCount } from "../../i18n/format.ts";
import type { MessageKey } from "../../i18n/es.ts";
import type { Locale } from "../../i18n/locales.ts";
import { translate } from "../../i18n/translate.ts";
import type { InputKind } from "./sniff.ts";

type View = "idle" | "converting" | "done" | "failed";

export interface FastView {
	show(view: View): void;
	converting(fileName: string, kind: InputKind): void;
	done(pdfName: string, pages: number, bytes: number): void;
	failed(fileName: string, kind: InputKind, reason: MessageKey): void;
	/** A file name in code style followed by a message, or nothing. */
	notice(entries: ReadonlyArray<string>, message: string | undefined): void;
}

/** The label on the file's card: JPG instead of jpeg, TXT for plain text. */
export function kindLabel(kind: InputKind): string {
	if (kind === "jpeg") return "JPG";

	if (kind === "text") return "TXT";

	return kind.toUpperCase();
}

function required<Element extends HTMLElement>(root: ParentNode, selector: string): Element {
	const element = root.querySelector<Element>(selector);

	if (element === null) throw new Error(`Fast path markup is missing ${selector}`);

	return element;
}

/** Every user-provided string goes through textContent; nothing here builds HTML. */
export function connectFastView(root: Document, locale: Locale): FastView {
	const flow = required(root, "[data-flow]");
	const drop = required(root, "[data-dropzone]");

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

		if (view !== "idle") required<HTMLHeadingElement>(views[view], "h2").focus();
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

		notice(entries, message) {
			noticeText.replaceChildren();
			notice.hidden = message === undefined;
			flow.hidden = !notice.hidden || !drop.hidden;

			if (message === undefined) return;

			entries.forEach((entry, index) => {
				const code = root.createElement("code");

				code.textContent = entry;
				noticeText.append(index === 0 ? "" : ", ", code);
			});
			noticeText.append(entries.length === 1 ? ` ${message}` : "");

			if (entries.length !== 1) noticeText.prepend(`${message} `);
		},
	};
}

/** The rejected-files notice: one file reads "x no se puede…", several read "No entraron N archivos: a, b". */
export function rejectionMessage(locale: Locale, count: number): string {
	return count === 1
		? translate(locale, "rejected.one")
		: withCount(translate(locale, "rejected.many"), count);
}
