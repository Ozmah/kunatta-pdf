export const pageSizes = ["letter", "a4", "original"] as const;
export const qualities = ["light", "normal", "max"] as const;

export type PageSize = (typeof pageSizes)[number];

export type Quality = (typeof qualities)[number];

export interface Settings {
	readonly size: PageSize;
	readonly quality: Quality;
}

export const defaultSettings: Settings = { size: "letter", quality: "normal" };

function pick<Option extends string>(
	options: ReadonlyArray<Option>,
	value: string | null,
	fallback: Option,
): Option {
	return options.find((option) => option === value) ?? fallback;
}

/** Parses the settings form. Unknown or missing values fall back to the defaults. */
export function readSettings(size: string | null, quality: string | null): Settings {
	return {
		size: pick(pageSizes, size, defaultSettings.size),
		quality: pick(qualities, quality, defaultSettings.quality),
	};
}
