import { interpolate } from "../i18n/format.ts";
import { documentLocale, localeNames } from "../i18n/locales.ts";
import { translator } from "../i18n/translate.ts";
import { ask, connectBack } from "../lib/dialog.ts";
import { required } from "../lib/dom.ts";
import { connectLanguageGuard } from "../lib/language-guard.ts";

/**
 * <kn-language-switch>: the ES · EN links and the warning before a reload would lose work.
 * LanguageSwitch.astro holds its markup and defines it.
 */
export class LanguageSwitchElement extends HTMLElement {
	/** Asks before switching while `hasWork` says a reload would lose something. Unguarded, the links just navigate. */
	guard(hasWork: () => boolean): void {
		const dialog = required<HTMLDialogElement>(this, '[data-dialog="language"]');
		const t = translator(documentLocale(this.ownerDocument));

		connectBack(dialog);
		connectLanguageGuard(this, {
			hasWork,
			confirm: async (target) => {
				const language = localeNames[target];

				required(dialog, "[data-title]").textContent = interpolate(t("language.title"), {
					language,
				});
				required(dialog, "[data-switch]").textContent = interpolate(t("language.switch"), {
					language,
				});

				return (await ask(dialog)).choice === "confirm";
			},
		});
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"kn-language-switch": LanguageSwitchElement;
	}
}
