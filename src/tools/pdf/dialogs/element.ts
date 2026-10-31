import type { Locale } from "../../../i18n/locales.ts";
import type { AssemblyPrompts, Prompts } from "../shared/prompts.ts";
import type { Settings } from "../shared/settings.ts";
import { connectDialogs } from "./dialogs.ts";

/** <kn-dialogs>: every dialog the tool asks with. Dialogs.astro holds its markup and defines it. */
export class DialogsElement extends HTMLElement {
	connect(locale: Locale, settings: () => Settings): Prompts & AssemblyPrompts {
		return connectDialogs(this, locale, settings);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"kn-dialogs": DialogsElement;
	}
}
