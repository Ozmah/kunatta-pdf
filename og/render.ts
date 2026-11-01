// Renders the share image for every locale into public/og/<locale>.png with the Playwright
// Chromium the end-to-end tests already use. The PNGs are committed; run `bun run og` again
// only when the card, its copy or the site address changes.
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "@playwright/test";

import config from "../astro.config.ts";
import { locales } from "../src/i18n/locales.ts";
import { card, size } from "./card.ts";

const root = join(import.meta.dirname, "..");
const out = join(root, "public", "og");

const fonts = {
	inter: await readFile(
		join(root, "node_modules/@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2"),
	),
	mono: await readFile(join(root, "src/assets/fonts/PaperMono-Variable.woff2")),
};

const host = new URL(config.site ?? "").host;
const browser = await chromium.launch();

try {
	const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });

	await mkdir(out, { recursive: true });

	for (const locale of locales) {
		await page.setContent(card(locale, fonts, host));
		await page.evaluate(() => document.fonts.ready);
		await page.screenshot({ path: join(out, `${locale}.png`) });
		console.log(`public/og/${locale}.png`);
	}
} finally {
	await browser.close();
}
