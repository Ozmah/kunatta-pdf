import { expect, test, type Locator } from "@playwright/test";

import { es } from "../src/i18n/es.ts";
import { image, withExif } from "./support/images.ts";
import { pdf } from "./support/samples.ts";
import { checked, drop, row } from "./support/tool.ts";

interface Natural {
	readonly width: number;
	readonly height: number;
}

function natural(thumb: Locator): Promise<Natural> {
	return thumb.evaluate((element) => {
		if (!(element instanceof HTMLImageElement)) throw new Error("The thumbnail is not an image");

		return { width: element.naturalWidth, height: element.naturalHeight };
	});
}

test.beforeEach(async ({ page }) => {
	await page.goto("/es/");
});

test("photos show a small upright thumbnail in their row; other files keep their type", async ({
	page,
}) => {
	const sideways = await image(page, "IMG_4021.jpg", {
		width: 400,
		height: 300,
		type: "image/jpeg",
	});

	const plain = await image(page, "IMG_4022.png", { width: 400, height: 300, type: "image/png" });

	await drop(page, [
		withExif(sideways, 6, "marker"),
		plain,
		await pdf("anexo.pdf", [{ width: 200, height: 200 }]),
	]);
	await checked(page);

	const rotated = row(page, "IMG_4021.jpg").locator(".thumb");
	const flat = row(page, "IMG_4022.png").locator(".thumb");

	await expect(rotated).toBeVisible();
	await expect(rotated).toHaveAttribute("src", /^blob:/u);
	await expect.poll(() => natural(rotated)).toEqual({ width: 120, height: 160 });
	await expect.poll(() => natural(flat)).toEqual({ width: 160, height: 120 });
	await expect(row(page, "anexo.pdf").locator(".thumb")).toBeHidden();
	await expect(row(page, "anexo.pdf").locator("[data-kind]")).toHaveText("PDF");
});

test("removing a row frees its thumbnail", async ({ page }) => {
	const photos = await Promise.all(
		["a.jpg", "b.jpg"].map((name) =>
			image(page, name, { width: 300, height: 300, type: "image/jpeg" }),
		),
	);

	await drop(page, photos);
	await checked(page);

	const url = await row(page, "a.jpg").locator(".thumb").getAttribute("src");

	expect(url).toMatch(/^blob:/u);
	await row(page, "a.jpg").getByRole("button", { name: es["row.remove"] }).click();

	const reachable = await page.evaluate(async (address) => {
		try {
			await fetch(address);

			return true;
		} catch {
			return false;
		}
	}, url ?? "");

	expect(reachable).toBe(false);
});
