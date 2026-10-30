import { expect, test, type Page } from "@playwright/test";

import { es } from "../src/i18n/es.ts";
import { pageCount, withCount } from "../src/i18n/format.ts";
import { image } from "./support/images.ts";
import {
	brokenJpeg,
	inspect,
	letter,
	office,
	officeSamples,
	pdf,
	text,
	type PageSize,
	type Sample,
} from "./support/samples.ts";
import {
	checked,
	dialog,
	downloadOf,
	type Downloaded,
	downloadsOf,
	drop,
	holdOfficeEngine,
	notice,
	order,
	paste,
	row,
	rows,
	setting,
} from "./support/tool.ts";

/** A one-page PDF whose page size tells it apart in the result. */
function marked(name: string, side: number): Promise<Sample> {
	return pdf(name, [{ width: side, height: side }]);
}

function square(side: number): PageSize {
	return { width: side, height: side };
}

async function make(page: Page): Promise<Downloaded> {
	return downloadOf(page, () => page.locator("[data-make]").click());
}

test.beforeEach(async ({ page }) => {
	await page.goto("/es/");
	await setting(page, "size", "original");
});

test("files are listed in natural order and the PDF follows the list", async ({ page }) => {
	await drop(page, [
		await marked("foto 10.pdf", 110),
		await marked("foto 2.pdf", 102),
		await marked("foto 1.pdf", 101),
	]);
	await expect.poll(() => order(page)).toEqual(["foto 1.pdf", "foto 2.pdf", "foto 10.pdf"]);
	await expect(page.locator("[data-count]")).toHaveText("3");
	await checked(page);

	const result = await make(page);

	// The default name is the first file's.
	expect(result.name).toBe("foto 1.pdf");
	expect((await inspect(result.content)).pages).toEqual([square(101), square(102), square(110)]);
	await expect(page.locator("[data-done-text]")).toContainText(
		`foto 1.pdf ${es["assembly.downloaded"]}`,
	);
	await expect(page.locator("[data-done-text]")).toContainText(pageCount("es", 3));
	// The list stays after generating.
	await expect(rows(page)).toHaveCount(3);
});

test("pasting one file opens a list, and every paste adds to the end", async ({ page }) => {
	await paste(page, [text("b.txt", "b")]);
	await expect(page.locator("[data-assembly]")).toBeVisible();
	await paste(page, [text("a.txt", "a")]);
	await expect.poll(() => order(page)).toEqual(["b.txt", "a.txt"]);
});

test("a pinned file keeps its slot while ↑ ↓ move the rest around it", async ({ page }) => {
	await drop(page, [
		await marked("1.pdf", 101),
		await marked("2.pdf", 102),
		await marked("3.pdf", 103),
		await marked("4.pdf", 104),
	]);
	await checked(page);
	await row(page, "2.pdf").getByRole("button", { name: es["row.pin"] }).click();
	await expect(row(page, "2.pdf").locator(".pinmark")).toHaveText("FIJO EN 02");
	await expect(row(page, "2.pdf").getByRole("button", { name: es["row.up"] })).toBeDisabled();

	// 1 moves down past the pinned 2.
	await row(page, "1.pdf").getByRole("button", { name: es["row.down"] }).click();
	await expect.poll(() => order(page)).toEqual(["3.pdf", "2.pdf", "1.pdf", "4.pdf"]);
	await expect(row(page, "3.pdf").getByRole("button", { name: es["row.up"] })).toBeDisabled();
	await expect(row(page, "4.pdf").getByRole("button", { name: es["row.down"] })).toBeDisabled();

	const result = await make(page);

	expect((await inspect(result.content)).pages).toEqual([
		square(103),
		square(102),
		square(101),
		square(104),
	]);
});

test("removing every file returns to the empty drop zone", async ({ page }) => {
	await drop(page, [text("a.txt", "a"), text("b.txt", "b")]);

	for (const name of ["a.txt", "b.txt"])
		await row(page, name).getByRole("button", { name: es["row.remove"] }).click();

	await expect(page.locator("[data-assembly]")).toBeHidden();
	await expect(page.locator("[data-empty-drop]")).toBeVisible();
});

test("a failed file stops for a summary: back keeps it, without it pinned files shift up", async ({
	page,
}) => {
	const downloads = downloadsOf(page);

	await drop(page, [
		await marked("a.pdf", 101),
		brokenJpeg("b rota.jpg"),
		await marked("c.pdf", 103),
		await marked("d.pdf", 104),
	]);
	await checked(page);
	await expect(row(page, "b rota.jpg")).toHaveAttribute("data-state", "failed");
	await expect(row(page, "b rota.jpg").locator(".meta")).toHaveText(es["reason.damaged"]);
	await row(page, "c.pdf").getByRole("button", { name: es["row.pin"] }).click();

	const summary = dialog(page, "summary");

	await page.locator("[data-make]").click();
	await expect(summary.locator("h2")).toHaveText("No pudimos convertir 1 de 4 archivos");
	await expect(summary.locator("[data-fails]")).toContainText("b rota.jpg");
	await expect(summary.locator("[data-body]")).toHaveText(withCount(es["summary.body"], 3));
	// The safe choice has the initial focus.
	await expect(summary.getByRole("button", { name: es["summary.back"] })).toBeFocused();
	await summary.getByRole("button", { name: es["summary.back"] }).click();
	await expect(rows(page)).toHaveCount(4);
	expect(downloads).toEqual([]);

	await page.locator("[data-make]").click();

	const result = await downloadOf(page, () =>
		summary.getByRole("button", { name: es["summary.without"] }).click(),
	);

	expect((await inspect(result.content)).pages).toEqual([square(101), square(103), square(104)]);
	await expect(rows(page)).toHaveCount(3);
	// c was pinned at 3; with b gone it shifts to 2 and stays pinned.
	await expect(row(page, "c.pdf").locator(".pinmark")).toHaveText("FIJO EN 02");
});

test("a protected PDF waits in its row until the right password opens it", async ({ page }) => {
	await drop(page, [
		await marked("a.pdf", 101),
		await pdf("b.pdf", [square(102), square(102)], "secreto"),
	]);

	const locked = row(page, "b.pdf");

	await expect(locked).toHaveAttribute("data-state", "locked");
	await expect(locked.locator(".st")).toHaveText(es["row.locked"]);
	await locked.locator('input[name="password"]').fill("nope");
	await locked.getByRole("button", { name: es["incoming.open"] }).click();
	await expect(locked.locator(".meta")).toHaveText(es["incoming.wrong"]);
	await locked.locator('input[name="password"]').fill("secreto");
	await locked.getByRole("button", { name: es["incoming.open"] }).click();
	await expect(locked).toHaveAttribute("data-state", "ready");
	await expect(locked.locator(".meta")).toContainText(pageCount("es", 2));

	const result = await make(page);

	expect(await inspect(result.content)).toMatchObject({
		encrypted: false,
		pages: [square(101), square(102), square(102)],
	});
});

test("the name next to the button names the PDF, and Ajustes shows the same value", async ({
	page,
}) => {
	await drop(page, [text("a.txt", "a"), text("b.txt", "b")]);
	await expect(page.locator("[data-assembly] input[data-pdf-name]")).toHaveAttribute(
		"placeholder",
		"a",
	);
	await page.locator("[data-assembly] input[data-pdf-name]").fill("practicas.pdf");
	await checked(page);

	const result = await make(page);

	expect(result.name).toBe("practicas.pdf");
	await expect(page.locator("[data-settings] input[data-pdf-name]")).toHaveValue("practicas.pdf");
});

test("with Contraseña on, the list's PDF is protected and the dialog counts its pages", async ({
	page,
}) => {
	await setting(page, "password", "on");
	await drop(page, [await marked("a.pdf", 101), await pdf("b.pdf", [square(102), square(102)])]);
	await checked(page);
	await page.locator("[data-make]").click();

	const asks = dialog(page, "result");

	await expect(asks.locator("[data-meta]")).toContainText(pageCount("es", 3));

	const result = await downloadOf(page, async () => {
		await asks.locator('input[name="password"]').fill("clave larga");
		await asks.locator('input[name="repeat"]').fill("clave larga");
		await asks.getByRole("button", { name: es["result.confirm"] }).click();
	});

	expect(await inspect(result.content)).toMatchObject({ encrypted: true, opened: false });
	expect((await inspect(result.content, "clave larga")).pages).toHaveLength(3);
});

test("old Office files are named in one notice after generating", async ({ page }) => {
	await drop(page, [
		await office(officeSamples.doc),
		await office(officeSamples.xls),
		text("c.txt", "c"),
	]);
	await checked(page);
	await make(page);
	await expect(notice(page)).toContainText(withCount(es["degraded.many"], 2));
	await expect(notice(page)).toContainText(officeSamples.doc);
	await expect(notice(page)).toContainText(officeSamples.xls);
});

test("Cancelar stops a generation; the list stays and can be made again", async ({ page }) => {
	const downloads = downloadsOf(page);
	const engine = await holdOfficeEngine(page);

	await drop(page, [await office(officeSamples.docx), await office(officeSamples.pptx)]);
	await page.locator("[data-make]").click();
	await expect(page.locator("[data-make]")).toHaveText(es["assembly.making"]);
	await expect(page.locator("[data-progress]")).toBeVisible();
	await page.locator("[data-cancel]").click();
	await expect(page.locator("[data-cancel]")).toBeHidden();
	await expect(page.locator("[data-make]")).toHaveText(es["assembly.make"]);
	engine.resolve();
	await checked(page);
	expect(downloads).toEqual([]);
	await expect(rows(page)).toHaveCount(2);

	const result = await make(page);

	expect((await inspect(result.content)).pages.length).toBeGreaterThanOrEqual(2);
});

test("files that arrive while the PDF is being made are ignored", async ({ page }) => {
	const engine = await holdOfficeEngine(page);

	await drop(page, [await office(officeSamples.docx), await office(officeSamples.pptx)]);
	await page.locator("[data-make]").click();
	await expect(page.locator("[data-progress]")).toBeVisible();
	await drop(page, [text("tarde.txt", "llegué tarde")], "[data-add]");
	await paste(page, [text("pegado.txt", "también tarde")]);
	await expect(rows(page)).toHaveCount(2);

	const result = await downloadOf(page, async () => {
		engine.resolve();
	});

	expect(result.name).toBe("SampleDoc.pdf");
	await expect(rows(page)).toHaveCount(2);
});

test("changing Calidad after the checks re-converts photos when making the PDF", async ({
	page,
}) => {
	const photo = await image(page, "detalle.jpg", {
		width: 2400,
		height: 1600,
		type: "image/jpeg",
		noise: true,
	});

	await drop(page, [photo, text("nota.txt", "nota")]);
	await checked(page);

	const normal = await make(page);

	await setting(page, "quality", "light");

	const light = await make(page);

	expect(light.content.length).toBeLessThan(normal.content.length * 0.8);
	expect((await inspect(light.content)).pages).toHaveLength(2);
});

test("a single page of each kind in one list keeps the list order", async ({ page }) => {
	const photo = await image(page, "c foto.png", { width: 300, height: 200, type: "image/png" });

	await drop(page, [
		await marked("a.pdf", 101),
		text("b notas.txt", "hola"),
		photo,
		await office(officeSamples.docx, "d informe.docx"),
	]);
	await checked(page);

	const result = await make(page);
	const pages = (await inspect(result.content)).pages;

	expect(pages[0]).toEqual(square(101));
	// Plain text with Original uses Carta.
	expect(pages[1]).toEqual(letter);
	expect(pages[2]).toEqual({ width: 225, height: 150 });
	expect(pages.length).toBeGreaterThanOrEqual(4);
});
