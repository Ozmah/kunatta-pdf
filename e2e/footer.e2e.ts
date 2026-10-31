import { expect, test } from "@playwright/test";

import { en } from "../src/i18n/en.ts";
import { es } from "../src/i18n/es.ts";

for (const [lang, messages] of [
	["es", es],
	["en", en],
] as const) {
	test(`the ${lang} footer links the author site and the repository in a new tab`, async ({
		page,
	}) => {
		await page.goto(`/${lang}/`);

		const author = page.getByRole("link", { name: messages["footer.author"] });
		const repo = page.getByRole("link", { name: messages["footer.repo"] });

		await expect(author).toHaveAttribute("href", "https://ozmah.dev");
		await expect(repo).toHaveAttribute("href", "https://github.com/Ozmah/kunatta");

		for (const link of [author, repo]) {
			await expect(link).toHaveAttribute("target", "_blank");
			await expect(link).toHaveAttribute("rel", "noopener noreferrer");
		}
	});
}
