import { expect, test, type Page } from "@playwright/test";

import { es } from "../src/i18n/es.ts";
import { brokenJpeg, bytes, office, officeSamples, pdf, text } from "./support/samples.ts";
import { checked, dialog, drop, holdOfficeEngine, row, setting } from "./support/tool.ts";

/**
 * One screenshot per screen and state, on a desktop and on a phone. They are the baseline for
 * refactors that must not change what people see: `bun run visual` compares, and
 * `bun run visual:update` accepts a change on purpose.
 */

const square = { width: 200, height: 200 };

async function shot(page: Page, name: string, fullPage = true): Promise<void> {
	await page.evaluate(() => document.fonts.ready);
	await expect(page).toHaveScreenshot(`${name}.png`, { fullPage });
}

test.beforeEach(async ({ page }) => {
	await page.goto("/es/");
});

test("empty", async ({ page }) => {
	await shot(page, "empty");
});

test("empty in English", async ({ page }) => {
	await page.goto("/en/");
	await shot(page, "empty-en");
});

test("settings open with a name", async ({ page }) => {
	await page.locator("[data-gear]").click();
	await page.locator("[data-settings] input[data-pdf-name]").fill("Entrega final");
	await shot(page, "settings", false);
});

test("files turned away", async ({ page }) => {
	await drop(page, [
		bytes("video.mp4", [0, 0, 0, 0x18]),
		bytes("animacion.gif", [0x47, 0x49, 0x46, 0x38]),
	]);
	await expect(page.locator("[data-notice]")).toBeVisible();
	await shot(page, "rejected");
});

test("converting", async ({ page }) => {
	await holdOfficeEngine(page);
	await drop(page, [await office(officeSamples.docx)]);
	await expect(page.locator('[data-view="converting"]')).toBeVisible();
	await shot(page, "converting");
});

test("done, with a file turned away and an old Word file", async ({ page }) => {
	await drop(page, [bytes("video.mp4", [0, 0, 0, 0x18]), await office(officeSamples.doc)]);
	await expect(page.locator('[data-view="done"]')).toBeVisible({ timeout: 30_000 });
	await shot(page, "done");
});

test("failed", async ({ page }) => {
	await drop(page, [brokenJpeg("rota.jpg")]);
	await expect(page.locator('[data-view="failed"]')).toBeVisible();
	await shot(page, "failed");
});

test("single PDF dialog", async ({ page }) => {
	await drop(page, [await pdf("practica-3.pdf", [square, square, square])]);
	await expect(dialog(page, "single")).toBeVisible();
	await shot(page, "single-dialog", false);
});

test("incoming password dialog after a wrong password", async ({ page }) => {
	const asks = dialog(page, "incoming");

	await drop(page, [await pdf("constancia.pdf", [square], "secreto")]);
	await asks.locator('input[name="password"]').fill("nope");
	await asks.getByRole("button", { name: es["incoming.open"] }).click();
	await expect(asks.locator("[data-error]")).toHaveText(es["incoming.wrong"]);
	await shot(page, "incoming-dialog", false);
});

test("result password dialog with a mismatch", async ({ page }) => {
	const asks = dialog(page, "result");

	await setting(page, "password", "on");
	await drop(page, [text("diario.txt", "Querido diario")]);
	await asks.locator('input[name="password"]').fill("luna-2026");
	await asks.locator('input[name="repeat"]').fill("luna-2025");
	await asks.getByRole("button", { name: es["result.confirm"] }).click();
	await expect(asks.locator("[data-error]")).toHaveText(es["result.mismatch"]);
	await shot(page, "result-dialog", false);
});

test("list with every row state", async ({ page }) => {
	await holdOfficeEngine(page);
	await drop(page, [
		await pdf("a portada.pdf", [square]),
		brokenJpeg("b rota.jpg"),
		await pdf("c constancia.pdf", [square], "secreto"),
		await office(officeSamples.docx, "d informe.docx"),
		text("e notas.txt", "hola"),
	]);
	await expect(row(page, "c constancia.pdf")).toHaveAttribute("data-state", "locked");
	await expect(row(page, "d informe.docx")).toHaveAttribute("data-state", "checking");
	await row(page, "a portada.pdf").getByRole("button", { name: es["row.pin"] }).click();
	await shot(page, "list");
});

test("list while making the PDF", async ({ page }) => {
	await holdOfficeEngine(page);
	await drop(page, [text("a.txt", "a"), text("b.txt", "b"), await office(officeSamples.docx)]);
	await expect(row(page, "b.txt")).toHaveAttribute("data-state", "ready");
	await page.locator("[data-make]").click();
	await expect(page.locator("[data-progress]")).toBeVisible();
	await shot(page, "list-making");
});

test("failure summary", async ({ page }) => {
	await drop(page, [await pdf("a.pdf", [square]), brokenJpeg("b rota.jpg"), text("c.txt", "c")]);
	await checked(page);
	await page.locator("[data-make]").click();
	await expect(dialog(page, "summary")).toBeVisible();
	await shot(page, "summary-dialog", false);
});

test("list after making the PDF", async ({ page }) => {
	await drop(page, [await pdf("a.pdf", [square]), text("b.txt", "b")]);
	await checked(page);
	await page.locator("[data-make]").click();
	await expect(page.locator("[data-assembly-done]")).toBeVisible();
	await shot(page, "list-done");
});

test("language warning", async ({ page }) => {
	await drop(page, [text("a.txt", "a"), text("b.txt", "b")]);
	await page.locator('[data-lang-switch] a[hreflang="en"]').click();
	await expect(dialog(page, "language")).toBeVisible();
	await shot(page, "language-dialog", false);
});

test("a row lifted to reorder", async ({ page, isMobile }) => {
	await drop(page, [text("1.txt", "1"), text("2.txt", "2"), text("3.txt", "3")]);
	await checked(page);

	// The lifted row is placed from page coordinates; start from a settled, unscrolled page.
	await page.evaluate(async () => {
		await document.fonts.ready;
		scrollTo(0, 0);
	});

	const handle = row(page, "1.txt").locator(isMobile ? ".tile" : "[data-grip]");
	const box = await handle.boundingBox();

	if (box === null) throw new Error("The handle is not on screen");

	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;

	if (isMobile) {
		const session = await page.context().newCDPSession(page);

		await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
		await session.send("Input.dispatchTouchEvent", {
			type: "touchMove",
			touchPoints: [{ x, y: y + 40 }],
		});
		await session.send("Input.dispatchTouchEvent", {
			type: "touchMove",
			touchPoints: [{ x, y: y + 80 }],
		});
	} else {
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x, y + 80, { steps: 8 });
	}

	await expect(row(page, "1.txt")).toHaveClass(/lift/u);
	await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
	await shot(page, "list-lifted", false);
});

test("a row taken with the keyboard", async ({ page, isMobile }) => {
	test.skip(isMobile, "the grip is a desktop control");

	await drop(page, [text("1.txt", "1"), text("2.txt", "2"), text("3.txt", "3")]);
	await checked(page);
	await row(page, "3.txt").locator("[data-grip]").focus();
	await page.keyboard.press("Space");
	await page.keyboard.press("ArrowUp");
	await shot(page, "list-keyboard");
});
