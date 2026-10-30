import { expect, test } from "@playwright/test";

import { pdfName } from "../src/tools/pdf/file-name.ts";
import { image } from "./support/images.ts";
import { brokenJpeg, office, officeSamples, pdf, text } from "./support/samples.ts";
import { checked, downloadOf, drop, paste, rows } from "./support/tool.ts";

test("no request leaves the site while every kind of file is converted", async ({
	page,
	baseURL,
}) => {
	const foreign: Array<string> = [];

	page.context().on("request", (request) => {
		const url = new URL(request.url());

		if (url.protocol === "blob:" || url.protocol === "data:") return;

		if (url.origin !== new URL(baseURL ?? "").origin) foreign.push(request.url());
	});

	await page.goto("/es/");

	const photo = await image(page, "foto.jpg", { width: 320, height: 240, type: "image/jpeg" });

	await drop(page, [
		photo,
		await office(officeSamples.docx),
		await office(officeSamples.xls),
		await pdf("anexo.pdf", [{ width: 300, height: 300 }]),
		text("nota.txt", "hola"),
	]);
	await checked(page);
	await downloadOf(page, () => page.locator("[data-make]").click());
	expect(foreign).toEqual([]);
});

test("file names are shown as text, never run as markup", async ({ page }) => {
	const hostile = '<img src=x onerror="document.body.dataset.pwned=1">.txt';

	await page.goto("/es/");
	await paste(page, [text(hostile, "hola")]);
	await expect(rows(page)).toHaveCount(1);
	await expect(page.locator("[data-row-name]")).toHaveText(hostile);
	// The only images in a row are its own thumbnails.
	await expect(page.locator("[data-list] img:not(.thumb)")).toHaveCount(0);
	await checked(page);

	const result = await downloadOf(page, () => page.locator("[data-make]").click());

	expect(result.name).toBe(pdfName(hostile));
	expect(result.name).not.toMatch(/[<>"]/u);
	await expect(page.locator("body")).not.toHaveAttribute("data-pwned");
});

test("a failure message shows the file name as text", async ({ page }) => {
	await page.goto("/es/");
	await drop(page, [brokenJpeg("<b>rota</b>.jpg")]);
	await expect(page.locator('[data-view="failed"]')).toContainText("<b>rota</b>.jpg");
	await expect(page.locator('[data-view="failed"] b')).toHaveCount(0);
});
