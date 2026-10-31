import { isLocale, type Locale } from "../i18n/locales.ts";
import { required } from "./dom.ts";

/** The parts of a click that decide whether the browser opens a new tab or window. */
export interface ClickModifiers {
	readonly button: number;
	readonly ctrlKey: boolean;
	readonly metaKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
}

/**
 * - follow: let the browser navigate (new tab, or nothing to lose).
 * - stay: the current language; navigating would only reload and lose the work.
 * - ask: the page would reload with work in progress; confirm first.
 */
export type LanguageAction = "follow" | "stay" | "ask";

export function languageAction(
	click: ClickModifiers,
	current: boolean,
	work: boolean,
): LanguageAction {
	const plain =
		click.button === 0 && !click.ctrlKey && !click.metaKey && !click.shiftKey && !click.altKey;

	// A new tab or window leaves this page, and its work, untouched.
	if (!plain) return "follow";

	if (current) return "stay";

	return work ? "ask" : "follow";
}

export interface LanguageGuardOptions {
	/** Files in the list or a conversion in progress: what a reload would lose. */
	hasWork(): boolean;
	confirm(target: Locale): Promise<boolean>;
}

/** The language switch is a pair of plain links; this only steps in when work would be lost. */
export function connectLanguageGuard(host: HTMLElement, options: LanguageGuardOptions): void {
	const nav = required(host, "[data-lang-switch]");

	nav.addEventListener("click", (event) => {
		const link = event.target instanceof Element ? event.target.closest("a") : null;

		if (link === null) return;

		const current = link.getAttribute("aria-current") === "page";
		const action = languageAction(event, current, options.hasWork());

		if (action === "follow") return;

		event.preventDefault();

		if (action === "stay" || !isLocale(link.hreflang)) return;

		void options.confirm(link.hreflang).then((confirmed) => {
			if (confirmed) host.ownerDocument.location.assign(link.href);
		});
	});
}
