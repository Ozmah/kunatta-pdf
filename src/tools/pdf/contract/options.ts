/** The settings that shape a conversion. Both threads read them; the rest of Ajustes stays on the page. */

export const pageSizes = ["letter", "a4", "original"] as const;
export const qualities = ["light", "normal", "max"] as const;

export type PageSize = (typeof pageSizes)[number];

export type Quality = (typeof qualities)[number];

/** Only these reach the worker; the name and the password setting stay on the page. */
export interface ConvertSettings {
	readonly size: PageSize;
	readonly quality: Quality;
}

/** Picks the conversion settings out of a larger object: the worker's schema refuses extra fields. */
export function convertSettings(settings: ConvertSettings): ConvertSettings {
	return { size: settings.size, quality: settings.quality };
}
