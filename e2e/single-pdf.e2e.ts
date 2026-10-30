import { expect, test } from "@playwright/test";

import { es } from "../src/i18n/es.ts";
import { pageCount } from "../src/i18n/format.ts";
import { inspect, landscape, letter, pdf, text } from "./support/samples.ts";
import { dialog, downloadOf, downloadsOf, drop, order, setting } from "./support/tool.ts";

const page200 = { width: 200, height: 200 };

test.beforeEach(async ({ page }) => {
	await page.goto("/es/");
});

test("one PDF asks first, showing its pages, then keeps every page", async ({ page }) => {
	const source = await pdf("practica-3.pdf", [page200, page200, page200]);
	const asks = dialog(page, "single");

	await drop(page, [source]);
	await expect(asks.locator("h2")).toHaveText(es["single.title"]);
	await expect(asks.locator("[data-meta]")).toContainText(pageCount("es", 3));
	await expect(asks.locator("[data-result]")).toHaveText("practica-3.pdf");

	const result = await downloadOf(page, () =>
		asks.getByRole("button", { name: es["single.confirm"] }).click(),
	);

	expect(result.name).toBe("practica-3.pdf");
	expect((await inspect(result.content)).pages).toEqual([letter, letter, letter]);
});

test("Original leaves the pages as they are; Carta turns a wide page into a landscape sheet", async ({
	page,
}) => {
	const source = await pdf("planos.pdf", [page200, { width: 800, height: 400 }]);

	await setting(page, "size", "original");
	await drop(page, [source]);

	const original = await downloadOf(page, () =>
		dialog(page, "single").getByRole("button", { name: es["single.confirm"] }).click(),
	);

	expect((await inspect(original.content)).pages).toEqual([page200, { width: 800, height: 400 }]);

	await page.locator("[data-another]").click();
	await setting(page, "size", "letter");
	await drop(page, [source]);

	const fitted = await downloadOf(page, () =>
		dialog(page, "single").getByRole("button", { name: es["single.confirm"] }).click(),
	);

	expect((await inspect(fitted.content)).pages).toEqual([letter, landscape(letter)]);
});

test("Atrás makes nothing and returns to the drop zone", async ({ page }) => {
	const downloads = downloadsOf(page);

	await drop(page, [await pdf("borrador.pdf", [page200])]);
	await dialog(page, "single").getByRole("button", { name: es["single.back"] }).click();
	await expect(page.locator("[data-empty-drop]")).toBeVisible();
	expect(downloads).toEqual([]);
});

test("a protected PDF opens with its password and the result is not protected", async ({
	page,
}) => {
	const source = await pdf("constancia.pdf", [page200, page200], "secreto");
	const asks = dialog(page, "incoming");

	await drop(page, [source]);
	await expect(asks.locator("h2")).toHaveText(es["incoming.title.pdf"]);
	await asks.locator('input[name="password"]').fill("Secreto");
	await asks.getByRole("button", { name: es["incoming.open"] }).click();
	await expect(asks.locator("[data-error]")).toHaveText(es["incoming.wrong"]);
	await asks.locator('input[name="password"]').fill("secreto");
	await asks.getByRole("button", { name: es["incoming.open"] }).click();
	await expect(dialog(page, "single").locator("[data-meta]")).toContainText(pageCount("es", 2));

	const result = await downloadOf(page, () =>
		dialog(page, "single").getByRole("button", { name: es["single.confirm"] }).click(),
	);

	expect(await inspect(result.content)).toMatchObject({ encrypted: false, opened: true });
});

test("Agregar más archivos moves the PDF into a list, first, and opens the picker", async ({
	page,
}) => {
	const chooser = page.waitForEvent("filechooser");

	await drop(page, [await pdf("portada.pdf", [page200])]);
	await dialog(page, "single").getByRole("button", { name: es["single.more"] }).click();
	await chooser;
	await expect(page.locator("[data-assembly]")).toBeVisible();
	await drop(page, [text("anexo b.txt", "b"), text("anexo a.txt", "a")], "[data-add]");
	await expect.poll(() => order(page)).toEqual(["portada.pdf", "anexo a.txt", "anexo b.txt"]);
});
