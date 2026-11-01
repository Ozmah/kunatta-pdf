import { expect, test } from "@playwright/test";

import { en } from "../src/i18n/en.ts";
import { es } from "../src/i18n/es.ts";

const cases = [
	{ path: "/es/no-existe/", lang: "es", messages: es },
	{ path: "/en/missing/page", lang: "en", messages: en },
	// Without a language prefix the default language answers.
	{ path: "/no-existe", lang: "es", messages: es },
] as const;

for (const { path, lang, messages } of cases) {
	test(`${path} answers 404 with the ${lang} page that leads back to the tool`, async ({
		page,
	}) => {
		const response = await page.goto(path);

		expect(response?.status()).toBe(404);
		await expect(page.locator("html")).toHaveAttribute("lang", lang);
		await expect(page).toHaveTitle(messages["notFound.meta"]);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages["notFound.title"]);
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

		await page.getByRole("link", { name: messages["notFound.home"] }).click();
		await expect(page).toHaveURL(new RegExp(`/${lang}/$`, "u"));
		await expect(page.locator("[data-empty-drop]")).toBeVisible();
	});
}

test("the page counter is decoration that screen readers skip", async ({ page }) => {
	await page.goto("/es/no-existe/");
	await expect(page.locator(".art")).toHaveAttribute("aria-hidden", "true");
	await expect(page.getByRole("textbox")).toHaveCount(0);
});
