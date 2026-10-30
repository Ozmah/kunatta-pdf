import { expect, test } from "@playwright/test";

import { a4, inspect, text } from "./support/samples.ts";
import { downloadOf, drop, setting } from "./support/tool.ts";

const key = "kunatta:settings:v1";

test.beforeEach(async ({ page }) => {
	await page.goto("/es/");
});

test("Ajustes remembers size, quality and the password setting across visits and languages", async ({
	page,
}) => {
	await setting(page, "size", "a4");
	await setting(page, "quality", "max");
	await setting(page, "password", "on");
	await page.reload();

	await expect(page.locator('input[name="size"][value="a4"]')).toBeChecked();
	await expect(page.locator('input[name="quality"][value="max"]')).toBeChecked();
	await expect(page.locator('input[name="password"][value="on"]')).toBeChecked();

	await page.goto("/en/");
	await expect(page.locator('input[name="size"][value="a4"]')).toBeChecked();
});

test("a remembered size shapes the next PDF", async ({ page }) => {
	await setting(page, "size", "a4");
	await page.reload();

	const result = await downloadOf(page, () => drop(page, [text("notas.txt", "Apuntes")]));

	expect((await inspect(result.content)).pages).toEqual([a4]);
});

test("the name and passwords are never stored", async ({ page }) => {
	await page.locator("[data-gear]").click();
	await page.locator("[data-settings] input[data-pdf-name]").fill("tarea secreta");
	await page.locator('input[name="quality"][value="light"]').check();
	await page.reload();

	await expect(page.locator("[data-settings] input[data-pdf-name]")).toHaveValue("");

	const stored = await page.evaluate((name) => localStorage.getItem(name), key);

	expect(stored).toBe('{"size":"letter","quality":"light","password":"off"}');
});

test("a damaged stored value falls back to the defaults", async ({ page }) => {
	await page.evaluate((name) => localStorage.setItem(name, '{"size":"<b>","quality":7'), key);
	await page.reload();

	await expect(page.locator('input[name="size"][value="letter"]')).toBeChecked();
	await expect(page.locator('input[name="quality"][value="normal"]')).toBeChecked();
});
