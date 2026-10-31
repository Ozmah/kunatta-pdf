import { fileSize, pageCount } from "../../../i18n/format.ts";
import type { MessageKey } from "../../../i18n/es.ts";
import type { Locale } from "../../../i18n/locales.ts";
import { translate } from "../../../i18n/translate.ts";
import { required } from "../../../lib/dom.ts";
import type { InputKind } from "../contract/kinds.ts";
import { kindLabel } from "../shared/labels.ts";

/** "none" hides every card: the drop zone or the list takes the space. */
export type SingleState = "none" | "converting" | "done" | "failed";

export interface SingleHandlers {
	/** Descargar otra vez. */
	again(): void;
	/** Convertir otro archivo: back to the empty drop zone. */
	another(): void;
	retry(): void;
	/** Elegir otro archivo: back to the drop zone with the picker open. */
	pickAnother(): void;
}

export interface SingleView {
	show(state: SingleState): void;
	converting(fileName: string, kind: InputKind): void;
	done(pdfName: string, pages: number, bytes: number): void;
	failed(fileName: string, kind: InputKind, reason: MessageKey): void;
}

/** The cards for one file: converting, done and failed. Every user-provided string goes through textContent. */
export function connectSingleView(
	host: HTMLElement,
	locale: Locale,
	handlers: SingleHandlers,
): SingleView {
	const cards = {
		converting: required(host, '[data-view="converting"]'),
		done: required(host, '[data-view="done"]'),
		failed: required(host, '[data-view="failed"]'),
	};

	required(host, "[data-download-again]").addEventListener("click", () => handlers.again());
	required(host, "[data-another]").addEventListener("click", () => handlers.another());
	required(host, "[data-retry]").addEventListener("click", () => handlers.retry());
	required(host, "[data-pick-another]").addEventListener("click", () => handlers.pickAnother());

	const show = (state: SingleState): void => {
		for (const [name, card] of Object.entries(cards)) card.hidden = name !== state;

		if (state !== "none") required<HTMLHeadingElement>(cards[state], "h2").focus();
	};

	return {
		show,

		converting(fileName, kind) {
			required(cards.converting, "[data-kind-label]").textContent = kindLabel(kind);
			required(cards.converting, "[data-source-name]").textContent = fileName;
			show("converting");
		},

		done(pdfName, pages, bytes) {
			const details = [pdfName, pageCount(locale, pages), fileSize(locale, bytes)];

			required(cards.done, "[data-result]").textContent = details.join(" · ");
			show("done");
		},

		failed(fileName, kind, reason) {
			required(cards.failed, "[data-failed-kind]").textContent = kindLabel(kind);
			required(cards.failed, "[data-failure]").textContent =
				`${fileName} · ${translate(locale, reason)}`;
			show("failed");
		},
	};
}
