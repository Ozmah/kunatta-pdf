import { expect, test } from "@playwright/test";

import { en } from "../src/i18n/en.ts";
import { es } from "../src/i18n/es.ts";

for (const [lang, messages] of [
	["es", es],
	["en", en],
] as const) {
	test(`the ${lang} footer leads to what we measure, marked as the current page there`, async ({
		page,
	}) => {
		await page.goto(`/${lang}/`);

		const link = page.locator("footer").getByRole("link", { name: messages["footer.measure"] });

		await expect(link).not.toHaveAttribute("aria-current");
		await link.click();
		await expect(page).toHaveURL(new RegExp(`/${lang}/privacy/$`, "u"));
		await expect(page).toHaveTitle(messages["privacy.meta"]);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages["privacy.title"]);
		await expect(page.getByRole("region", { name: messages["privacy.never"] })).toContainText(
			messages["privacy.never.names"],
		);
		await expect(link).toHaveAttribute("aria-current", "page");
	});
}

test("the language switch keeps you on the same page", async ({ page }) => {
	await page.goto("/es/privacy/");
	await page.locator('[data-lang-switch] a[hreflang="en"]').click();
	await expect(page).toHaveURL(/\/en\/privacy\/$/u);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(en["privacy.title"]);
});
