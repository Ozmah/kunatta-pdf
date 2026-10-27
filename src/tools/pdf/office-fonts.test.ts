import { describe, expect, test } from "bun:test";

import { readdirSync } from "node:fs";

import { bundledFontFetch, bundledFontPath, officeFontFiles } from "./office-fonts.ts";

const cdn = "https://cdn.jsdelivr.net/npm/@expo-google-fonts";

describe("bundled office fonts", () => {
	test("every listed face ships in public/fonts/office", () => {
		const shipped = new Set(
			readdirSync("public/fonts/office").filter((name) => name.endsWith(".ttf")),
		);

		expect(shipped).toEqual(new Set(officeFontFiles));
	});

	test("maps reamkit's CDN URLs to the bundled copy", () => {
		expect(bundledFontPath(`${cdn}/carlito/700Bold/Carlito_700Bold.ttf`)).toBe(
			"/fonts/office/Carlito_700Bold.ttf",
		);
		expect(bundledFontPath(`${cdn}/tinos/Tinos_400Regular_Italic.ttf`)).toBe(
			"/fonts/office/Tinos_400Regular_Italic.ttf",
		);
	});

	test("faces that are not bundled resolve to nothing", () => {
		expect(
			bundledFontPath(`${cdn}/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf`),
		).toBeUndefined();
		expect(bundledFontPath("https://evil.example/Carlito_700Bold.ttf.exe")).toBeUndefined();
	});

	test("only loads from the given origin and never for unknown faces", async () => {
		const loaded: Array<string> = [];

		const fontFetch = bundledFontFetch("https://kunatta.example", (url) => {
			loaded.push(url.href);

			return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
		});

		const bundled = await fontFetch("https://anywhere.example/a/b/Arimo_400Regular.ttf");
		const unknown = await fontFetch(`${cdn}/noto-sans-kr/400Regular/NotoSansKR_400Regular.ttf`);

		expect(bundled.ok).toBe(true);
		expect(unknown.ok).toBe(false);
		expect(loaded).toEqual(["https://kunatta.example/fonts/office/Arimo_400Regular.ttf"]);
	});
});
