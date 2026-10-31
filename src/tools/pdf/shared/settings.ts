import { pageSizes, qualities, type PageSize, type Quality } from "../contract/options.ts";
import { typedName } from "./file-name.ts";

export const passwordModes = ["off", "on"] as const;

export type PasswordMode = (typeof passwordModes)[number];

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
