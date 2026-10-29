export const pageSizes = ["letter", "a4", "original"] as const;
export const qualities = ["light", "normal", "max"] as const;
export const passwordModes = ["off", "on"] as const;

export type PageSize = (typeof pageSizes)[number];

export type Quality = (typeof qualities)[number];

export type PasswordMode = (typeof passwordModes)[number];

export interface Settings {
	readonly size: PageSize;
	readonly quality: Quality;
	/** "on" asks for a password for the result right before generating. */
	readonly password: PasswordMode;
}

export const defaultSettings: Settings = { size: "letter", quality: "normal", password: "off" };

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
): Settings {
	return {
		size: pick(pageSizes, size, defaultSettings.size),
		quality: pick(qualities, quality, defaultSettings.quality),
		password: pick(passwordModes, password, defaultSettings.password),
	};
}
