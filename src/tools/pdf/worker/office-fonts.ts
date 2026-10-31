/**
 * Office documents name fonts the device may not have (Calibri, Times New Roman…).
 * reamkit substitutes metric-compatible open families and, by default, downloads
 * them from a public CDN. Kunatta never talks to third parties, so the same files
 * ship under public/fonts/office/ and this module answers reamkit's font requests
 * from the site's own origin.
 */

/** reamkit's injectable fetch: only `ok` and `arrayBuffer` are read. */
export type FontFetch = (url: string) => Promise<{
	ok: boolean;
	arrayBuffer: () => Promise<ArrayBuffer>;
}>;

export type FontLoader = (url: URL) => Promise<Response>;

/** Where the bundled faces are served from, relative to the site root. */
export const officeFontDirectory = "/fonts/office/";

const families = ["Arimo", "Caladea", "Carlito", "Cousine", "Tinos"] as const;
const variants = ["400Regular", "400Regular_Italic", "700Bold", "700Bold_Italic"] as const;

/** Every face file shipped in public/fonts/office/. */
export const officeFontFiles: ReadonlySet<string> = new Set(
	families.flatMap((family) => variants.map((variant) => `${family}_${variant}.ttf`)),
);

const missing = {
	ok: false,
	arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
} as const;

/**
 * Maps a font URL requested by reamkit to the bundled copy. Anything outside the
 * bundled set (CJK, Arabic, symbol faces) resolves to nothing, so reamkit records
 * a loss instead of reaching the network.
 */
export function bundledFontPath(requestedUrl: string): string | undefined {
	const fileName = requestedUrl.slice(requestedUrl.lastIndexOf("/") + 1);

	return officeFontFiles.has(fileName) ? `${officeFontDirectory}${fileName}` : undefined;
}

/**
 * A reamkit font fetch that only ever loads bundled faces from `origin`.
 * The single same-origin `fetch` of the PDF tool lives here.
 */
export function bundledFontFetch(
	origin: string,
	load: FontLoader = (url) => fetch(url),
): FontFetch {
	return async (requestedUrl) => {
		const path = bundledFontPath(requestedUrl);

		if (path === undefined) return missing;

		// `path` is root-relative, so the resolved URL always stays on `origin`.
		return load(new URL(path, origin));
	};
}
