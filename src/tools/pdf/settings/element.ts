import { connectSettings, type SettingsControl } from "./panel.ts";
import type { PreferenceStore } from "./remembered.ts";

/** <kn-settings>: the gear and its panel. Settings.astro holds its markup and defines it. */
export class SettingsElement extends HTMLElement {
	connect(store: PreferenceStore | undefined, typed: (value: string) => void): SettingsControl {
		return connectSettings(this, store, typed);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"kn-settings": SettingsElement;
	}
}
