import type { Locale } from "../../../i18n/locales.ts";
import { connectSingleView, type SingleHandlers, type SingleView } from "./view.ts";

/** <kn-single>: the cards for one file: converting, done and failed. SinglePath.astro holds its markup and defines it. */
export class SingleElement extends HTMLElement {
	connect(locale: Locale, handlers: SingleHandlers): SingleView {
		return connectSingleView(this, locale, handlers);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"kn-single": SingleElement;
	}
}
