import { Result } from "better-result";
import * as v from "valibot";

import { defaultSettings, passwordModes, type Settings } from "../shared/settings.ts";
import { pageSizes, qualities } from "../contract/options.ts";

/** The part of Storage this needs, so tests can hand in a plain map. */
export interface PreferenceStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** What Ajustes remembers on this device. The name and every password are never stored. */
export type Remembered = Pick<Settings, "size" | "quality" | "password">;

/** Versioned, so a future shape can ignore what an older version wrote. */
export const rememberedKey = "kunatta:settings:v1";

// Each field falls back on its own: one value from an older version does not discard the rest.
const RememberedSchema = v.object({
	size: v.fallback(v.picklist(pageSizes), defaultSettings.size),
	quality: v.fallback(v.picklist(qualities), defaultSettings.quality),
	password: v.fallback(v.picklist(passwordModes), defaultSettings.password),
});

/** The browser's storage; undefined when the browser blocks it (Firefox throws on access then). */
export function browserStore(): PreferenceStore | undefined {
	return Result.try(() => globalThis.localStorage).unwrapOr(undefined);
}

/**
 * What was remembered, or undefined when nothing usable is stored. Remembering is a convenience:
 * blocked storage or a damaged value only means the defaults, with nothing to tell the user.
 */
export function recall(store: PreferenceStore): Remembered | undefined {
	const parsed = Result.try(() =>
		v.safeParse(RememberedSchema, JSON.parse(store.getItem(rememberedKey) ?? "null")),
	);

	if (parsed.isErr() || !parsed.value.success) return undefined;

	return parsed.value.output;
}

/** Stores the remembered part of `settings`; a full or blocked storage is ignored, like in `recall`. */
export function remember(store: PreferenceStore, settings: Settings): void {
	const remembered: Remembered = {
		size: settings.size,
		quality: settings.quality,
		password: settings.password,
	};

	Result.try(() => store.setItem(rememberedKey, JSON.stringify(remembered)));
}
