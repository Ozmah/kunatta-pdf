import { typedName } from "../shared/file-name.ts";

export const pageSizes = ["letter", "a4", "original"] as const;
export const qualities = ["light", "normal", "max"] as const;
export const passwordModes = ["off", "on"] as const;

export type PageSize = (typeof pageSizes)[number];

export type Quality = (typeof qualities)[number];

export type PasswordMode = (typeof passwordModes)[number];

/** The settings a conversion depends on. Only these reach the worker; the name and the password setting stay here. */
export interface ConvertSettings {
	readonly size: PageSize;
	readonly quality: Quality;
}

/** Picks the conversion settings out of a larger object: the worker's schema refuses extra fields. */
export function convertSettings(settings: ConvertSettings): ConvertSettings {
	return { size: settings.size, quality: settings.quality };
}

export interface Settings {
	readonly size: PageSize;
	readonly quality: Quality;
	/** "on" asks for a password for the result right before generating. */
	readonly password: PasswordMode;
	/** The name typed in Ajustes, cleaned and without ".pdf"; empty means the file's own name. */
	readonly name: string;
}

export const defaultSettings: Settings = {
	size: "letter",
	quality: "normal",
	password: "off",
	name: "",
};

function pick<Option extends string>(
	options: ReadonlyArray<Option>,
	value: string | null,
	fallback: Option,
): Option {
	return options.find((option) => option === value) ?? fallback;
}

/** Parses the settings form. Unknown or missing values fall back to the defaults. */
export function readSettings(
	size: string | null,
	quality: string | null,
	password: string | null,
	name: string | null,
): Settings {
	return {
		size: pick(pageSizes, size, defaultSettings.size),
		quality: pick(qualities, quality, defaultSettings.quality),
		password: pick(passwordModes, password, defaultSettings.password),
		name: typedName(name ?? ""),
	};
}
