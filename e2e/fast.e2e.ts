import { expect, test } from "@playwright/test";

import { es } from "../src/i18n/es.ts";
import { image, withExif } from "./support/images.ts";
import {
	a4,
	brokenJpeg,
	inspect,
	landscape,
	letter,
	office,
	officeSamples,
	protectedDocxPassword,
	text,
} from "./support/samples.ts";
import { dialog, downloadOf, downloadsOf, drop, notice, pick, setting } from "./support/tool.ts";

test.beforeEach(async ({ page }) => {
	await page.goto("/es/");
});

test.describe("photos", () => {
	test("a phone photo comes out upright, alone on its page, without EXIF or location", async ({
		page,
	}) => {
		const marker = "KUNATTA-PRIVATE-MARKER";

		const sideways = await image(page, "IMG_4021.jpg", {
			width: 400,
			height: 300,
			type: "image/jpeg",
		});

		const photo = withExif(sideways, 6, marker);

		await setting(page, "size", "original");

		const result = await downloadOf(page, () => drop(page, [photo]));
		const report = await inspect(result.content);

		expect(result.name).toBe("IMG_4021.pdf");
		// 300 × 400 px once rotated, at 96 DPI.
		expect(report.pages).toEqual([{ width: 225, height: 300 }]);
		expect(result.content.includes(marker)).toBe(false);
		expect(result.content.includes("Exif")).toBe(false);
		await expect(page.locator('[data-view="done"] h2')).toHaveText(es["fast.done"]);
		await expect(page.locator('[data-view="done"] [data-result]')).toContainText("IMG_4021.pdf");
	});

	test("a landscape photo on Carta gets a landscape sheet", async ({ page }) => {
		const photo = await image(page, "playa.jpg", { width: 800, height: 600, type: "image/jpeg" });
		const result = await downloadOf(page, () => drop(page, [photo]));

		expect((await inspect(result.content)).pages).toEqual([landscape(letter)]);
	});

	test("a picked PNG on A4 keeps a portrait A4 sheet", async ({ page }) => {
		const scan = await image(page, "escaneo.png", { width: 300, height: 400, type: "image/png" });

		await setting(page, "size", "a4");

		const result = await downloadOf(page, () => pick(page, [scan]));

		expect(result.name).toBe("escaneo.pdf");
		expect((await inspect(result.content)).pages).toEqual([a4]);
	});

	test("a WebP image converts like any photo", async ({ page }) => {
		const capture = await image(page, "captura.webp", {
			width: 640,
			height: 480,
			type: "image/webp",
		});

		const result = await downloadOf(page, () => drop(page, [capture]));

		expect((await inspect(result.content)).pages).toEqual([landscape(letter)]);
	});

	test("a damaged photo fails with a reason, and retrying does not hide it", async ({ page }) => {
		await drop(page, [brokenJpeg("rota.jpg")]);

		const failed = page.locator('[data-view="failed"]');

		await expect(failed.locator("h2")).toHaveText(es["fast.failed"]);
		await expect(page.locator("[data-failure]")).toContainText(es["reason.damaged"]);

		await page.locator("[data-retry]").click();
		await expect(page.locator("[data-failure]")).toContainText(es["reason.damaged"]);

		const chooser = page.waitForEvent("filechooser");

		await page.locator("[data-pick-another]").click();
		await chooser;
		await expect(page.locator("[data-empty-drop]")).toBeVisible();
	});
});

test.describe("Office documents", () => {
	const legacy = {
		doc: es["degraded.doc"],
		xls: es["degraded.xls"],
		ppt: es["degraded.ppt"],
	} as const;

	for (const kind of ["doc", "docx", "xls", "xlsx", "ppt", "pptx"] as const) {
		test(`a ${kind.toUpperCase()} file becomes a PDF named after it`, async ({ page }) => {
			const source = await office(officeSamples[kind]);
			const result = await downloadOf(page, () => drop(page, [source]));
			const report = await inspect(result.content);

			expect(result.name).toBe(source.name.replace(/\.\w+$/u, ".pdf"));
			expect(report.pages.length).toBeGreaterThan(0);

			if (kind === "doc" || kind === "xls" || kind === "ppt") {
				await expect(notice(page)).toContainText(source.name);
				await expect(notice(page)).toContainText(legacy[kind]);
			}
		});
	}

	test("a protected Word file asks for its password and only the right one opens it", async ({
		page,
	}) => {
		const source = await office(officeSamples.protectedDocx);
		const asks = dialog(page, "incoming");

		await drop(page, [source]);
		await expect(asks.locator("h2")).toHaveText(es["incoming.title.file"]);
		await asks.locator('input[name="password"]').fill("not-it");
		await asks.getByRole("button", { name: es["incoming.open"] }).click();
		await expect(asks.locator("[data-error]")).toHaveText(es["incoming.wrong"]);

		const result = await downloadOf(page, async () => {
			await asks.locator('input[name="password"]').fill(protectedDocxPassword);
			await asks.getByRole("button", { name: es["incoming.open"] }).click();
		});

		// The incoming password is never carried over to the result.
		expect((await inspect(result.content)).encrypted).toBe(false);
	});

	test("backing out of the password dialog leaves nothing behind", async ({ page }) => {
		const downloads = downloadsOf(page);

		await drop(page, [await office(officeSamples.protectedDocx)]);
		await expect(dialog(page, "incoming")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.locator("[data-empty-drop]")).toBeVisible();
		expect(downloads).toEqual([]);
	});
});

test.describe("plain text", () => {
	test("long text flows onto more pages and undrawable characters are flagged", async ({
		page,
	}) => {
		const lines = Array.from({ length: 150 }, (_, index) => `Línea ${index + 1} de los apuntes`);
		const source = text("apuntes.txt", [...lines, "Saludos 👋 你好"].join("\n"));
		const result = await downloadOf(page, () => drop(page, [source]));

		expect((await inspect(result.content)).pages.length).toBeGreaterThan(1);
		await expect(notice(page)).toContainText("apuntes.txt");
		await expect(notice(page)).toContainText(es["degraded.text"]);
	});
});

test.describe("offline", () => {
	test("plain text without its font says the converter could not load, not that it crashed", async ({
		page,
	}) => {
		await page.route("**/fonts/office/Cousine_400Regular.ttf", (route) =>
			route.abort("internetdisconnected"),
		);
		await drop(page, [text("notas.txt", "Apuntes")]);

		await expect(page.locator('[data-view="failed"] h2')).toHaveText(es["fast.failed"]);
		await expect(page.locator("[data-failure]")).toContainText(es["reason.engine"]);
	});
});

test.describe("settings", () => {
	test("with Contraseña on, mismatches are refused and the PDF opens only with it", async ({
		page,
	}) => {
		await setting(page, "password", "on");
		await drop(page, [text("diario.txt", "Querido diario")]);

		const asks = dialog(page, "result");

		await asks.locator('input[name="password"]').fill("luna-2026");
		await asks.locator('input[name="repeat"]').fill("luna-2025");
		await asks.getByRole("button", { name: es["result.confirm"] }).click();
		await expect(asks.locator("[data-error]")).toHaveText(es["result.mismatch"]);

		const result = await downloadOf(page, async () => {
			await asks.locator('input[name="password"]').fill("luna-2026");
			await asks.locator('input[name="repeat"]').fill("luna-2026");
			await asks.getByRole("button", { name: es["result.confirm"] }).click();
		});

		expect(await inspect(result.content)).toMatchObject({ encrypted: true, opened: false });
		expect(await inspect(result.content, "luna-2026")).toMatchObject({
			opened: true,
			pages: [letter],
		});
		// Password fields are emptied when the dialog closes.
		await expect(asks.locator('input[name="password"]')).toHaveValue("");
	});

	test("the name typed in Ajustes names the download, without doubling .pdf", async ({ page }) => {
		await page.locator("[data-gear]").click();
		await page.locator("[data-settings] input[data-pdf-name]").fill("Entrega final.pdf");
		await page.keyboard.press("Enter");
		await page.keyboard.press("Escape");

		const result = await downloadOf(page, () => drop(page, [text("notas.txt", "hola")]));

		expect(result.name).toBe("Entrega final.pdf");
	});

	test("Descargar otra vez downloads the same PDF again", async ({ page }) => {
		const first = await downloadOf(page, () => drop(page, [text("lista.txt", "pan, leche")]));
		const again = await downloadOf(page, () => page.locator("[data-download-again]").click());

		expect(again.name).toBe(first.name);
		expect(again.content.equals(first.content)).toBe(true);
	});
});
