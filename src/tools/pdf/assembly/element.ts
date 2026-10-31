import type { Locale } from "../../../i18n/locales.ts";
import { connectAssemblyView, type AssemblyHandlers, type AssemblyView } from "./view.ts";

/** <kn-assembly>: the ordered list of files. Assembly.astro holds its markup and defines it. */
export class AssemblyElement extends HTMLElement {
	connect(locale: Locale, handlers: AssemblyHandlers): AssemblyView {
		return connectAssemblyView(this, locale, handlers);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"kn-assembly": AssemblyElement;
	}
}
