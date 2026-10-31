import { expect, test } from "@playwright/test";

import { en } from "../src/i18n/en.ts";
import { es } from "../src/i18n/es.ts";
import { office, officeSamples, text } from "./support/samples.ts";
import { dialog, drop, holdOfficeEngine, rows } from "./support/tool.ts";

const switchTo = (language: "es" | "en") => `[data-lang-switch] a[hreflang="${language}"]`;

test("the root sends visitors to the Spanish page, which links its English twin", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page).toHaveURL(/\/es\/$/u);
	await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
		"href",
		"https://pdf.kunatta.tools/en/",
	);
	await expect(page.locator(switchTo("es"))).toHaveAttribute("aria-current", "page");
});

test("with nothing in progress the switch just changes language", async ({ page }) => {
	await page.goto("/es/");
	await page.locator(switchTo("en")).click();
	await expect(page).toHaveURL(/\/en\/$/u);
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expect(page.locator("[data-empty-drop] .title")).toHaveText(en["drop.title"]);
	await expect(page.locator("footer")).toContainText(en["footer.notice"]);
	await expect(page.locator(switchTo("en"))).toHaveAttribute("aria-current", "page");
});

test("with files in the list it warns first; Quedarme keeps everything", async ({ page }) => {
	await page.goto("/es/");
	await drop(page, [text("a.txt", "a"), text("b.txt", "b")]);
	await expect(rows(page)).toHaveCount(2);
	await page.locator(switchTo("en")).click();

	const warning = dialog(page, "language");

	await expect(warning.locator("h2")).toHaveText("¿Cambiar a English?");
	await expect(warning).toContainText(es["language.body"]);
	await expect(warning.getByRole("button", { name: es["language.stay"] })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/\/es\/$/u);
	await expect(rows(page)).toHaveCount(2);

	await page.locator(switchTo("en")).click();
	await warning.getByRole("button", { name: "Cambiar a English" }).click();
	await expect(page).toHaveURL(/\/en\/$/u);
	await expect(page.locator("[data-assembly]")).toBeHidden();
});

test("the current language never reloads the page, even with work", async ({ page }) => {
	await page.goto("/es/");
	await drop(page, [text("a.txt", "a"), text("b.txt", "b")]);
	await page.evaluate(() => document.body.setAttribute("data-same-page", ""));
	await page.locator(switchTo("es")).click();
	await expect(dialog(page, "language")).toBeHidden();
	await expect(page.locator("body")).toHaveAttribute("data-same-page", "");
	await expect(rows(page)).toHaveCount(2);
});

test("opening the other language in a new tab does not warn", async ({ page, isMobile }) => {
	test.skip(isMobile, "phones have no modifier clicks");

	await page.goto("/es/");
	await drop(page, [text("a.txt", "a"), text("b.txt", "b")]);

	const opened = page.context().waitForEvent("page");

	await page.locator(switchTo("en")).click({ modifiers: ["ControlOrMeta"] });
	await expect((await opened).locator("html")).toHaveAttribute("lang", "en");
	await expect(dialog(page, "language")).toBeHidden();
	await expect(rows(page)).toHaveCount(2);
});

test("a conversion in progress counts as work", async ({ page }) => {
	const engine = await holdOfficeEngine(page);

	await page.goto("/es/");
	await drop(page, [await office(officeSamples.docx)]);
	await expect(page.locator('[data-view="converting"]')).toBeVisible();
	await page.locator(switchTo("en")).click();
	await expect(dialog(page, "language")).toBeVisible();
	await page.keyboard.press("Escape");
	engine.resolve();
	await expect(page.locator('[data-view="done"]')).toBeVisible({ timeout: 30_000 });
	await expect(page).toHaveURL(/\/es\/$/u);
});
