import { expect, test, type Page } from "@playwright/test";

import { es } from "../src/i18n/es.ts";
import { fileCount, interpolate } from "../src/i18n/format.ts";
import { bytes, inspect, office, officeSamples, text } from "./support/samples.ts";
import {
	checked,
	dialog,
	downloadOf,
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

/** "Juntar varios en un PDF": the empty list, opened by hand. */

const compose = (page: Page) => page.getByRole("button", { name: es["drop.compose"] });
const back = (page: Page) => page.locator("[data-leave]");
const make = (page: Page) => page.locator("[data-make]");

test.beforeEach(async ({ page }) => {
	await page.goto("/es/");
	await setting(page, "size", "original");
});

test("the button opens an empty list that waits for files before it can make a PDF", async ({
	page,
}) => {
	const downloads = downloadsOf(page);

	await compose(page).click();
	await expect(page.locator("[data-assembly]")).toBeVisible();
	await expect(page.locator("[data-empty-drop]")).toBeHidden();
	await expect(page.locator("#assembly-title")).toBeFocused();
	await expect(page.locator("[data-count]")).toHaveText("0");
	await expect(page.locator("[data-hint]")).toHaveText(es["assembly.empty.hint"]);
	await expect(make(page)).toHaveAttribute("aria-disabled", "true");
	await expect(make(page)).toHaveAccessibleDescription(es["assembly.needs"]);

	// Disabled, not busy: clicking it does nothing. Playwright will not click an aria-disabled
	// button; a person still can.
	await make(page).click({ force: true });
	expect(downloads).toEqual([]);

	// One file is enough to compose.
	await drop(page, [text("acta.txt", "acta")], "[data-add]");
	await expect(rows(page)).toHaveCount(1);
	await expect(page.locator("[data-needs]")).toBeHidden();
	await expect(make(page)).not.toHaveAttribute("aria-describedby");
	await checked(page);

	const result = await downloadOf(page, () => make(page).click());

	expect(result.name).toBe("acta.pdf");
	expect((await inspect(result.content)).pages).toHaveLength(1);
});

test("the empty list takes files from its own picker and from a paste", async ({ page }) => {
	await compose(page).click();

	const chooser = page.waitForEvent("filechooser");

	await page.locator("[data-add]").click();
	await (await chooser).setFiles([text("b.txt", "b")]);
	await paste(page, [text("a.txt", "a")]);
	await expect.poll(() => order(page)).toEqual(["b.txt", "a.txt"]);
});

test("removing every file keeps the list open, empty", async ({ page }) => {
	await drop(page, [text("a.txt", "a"), text("b.txt", "b")]);

	for (const name of ["a.txt", "b.txt"])
		await row(page, name).getByRole("button", { name: es["row.remove"] }).click();

	await expect(page.locator("[data-assembly]")).toBeVisible();
	await expect(page.locator("[data-empty-drop]")).toBeHidden();
	await expect(page.locator("[data-count]")).toHaveText("0");
	await expect(make(page)).toHaveAttribute("aria-disabled", "true");
});

test("Atrás from an empty list goes straight back to the drop zone", async ({ page }) => {
	await compose(page).click();
	await back(page).click();
	await expect(dialog(page, "leave")).toBeHidden();
	await expect(page.locator("[data-assembly]")).toBeHidden();
	await expect(page.locator("[data-empty-drop]")).toBeVisible();
	await expect(compose(page)).toBeFocused();
});

test("Atrás with files asks first: Quedarme keeps them, leaving empties the list", async ({
	page,
}) => {
	await drop(page, [text("a.txt", "a"), text("b.txt", "b")]);
	await checked(page);
	await downloadOf(page, () => make(page).click());

	const leave = dialog(page, "leave");

	await back(page).click();
	await expect(leave.locator("[data-body]")).toHaveText(
		interpolate(es["leave.body"], { files: fileCount("es", 2) }),
	);
	// The safe choice has the initial focus.
	await expect(leave.getByRole("button", { name: es["leave.stay"] })).toBeFocused();
	await leave.getByRole("button", { name: es["leave.stay"] }).click();
	await expect(rows(page)).toHaveCount(2);

	await back(page).click();
	await leave.getByRole("button", { name: es["leave.confirm"] }).click();
	await expect(page.locator("[data-empty-drop]")).toBeVisible();
	await expect(compose(page)).toBeFocused();

	// Coming back, nothing is left over: no rows and no line about the PDF made before.
	await compose(page).click();
	await expect(rows(page)).toHaveCount(0);
	await expect(page.locator("[data-assembly-done]")).toBeHidden();
});

test("leaving stops the file being checked, and the next list converts as usual", async ({
	page,
}) => {
	const engine = await holdOfficeEngine(page);

	await compose(page).click();
	await drop(page, [await office(officeSamples.docx)], "[data-add]");
	await expect(rows(page).first()).toHaveAttribute("data-state", "checking");
	await back(page).click();
	await dialog(page, "leave").getByRole("button", { name: es["leave.confirm"] }).click();
	await expect(page.locator("[data-empty-drop]")).toBeVisible();
	engine.resolve();

	await compose(page).click();
	await drop(page, [text("nota.txt", "nota")], "[data-add]");
	await checked(page);
	await expect(rows(page)).toHaveCount(1);

	const result = await downloadOf(page, () => make(page).click());

	expect(result.name).toBe("nota.pdf");
});

test("Atrás waits while the PDF is made: Cancelar comes first", async ({ page }) => {
	const engine = await holdOfficeEngine(page);

	await drop(page, [await office(officeSamples.docx), text("b.txt", "b")]);
	await make(page).click();
	await expect(page.locator("[data-progress]")).toBeVisible();
	await expect(back(page)).toHaveAttribute("aria-disabled", "true");
	// Playwright will not click an aria-disabled button; a person still can.
	await back(page).click({ force: true });
	await expect(dialog(page, "leave")).toBeHidden();
	await expect(page.locator("[data-assembly]")).toBeVisible();

	await page.locator("[data-cancel]").click();
	await expect(back(page)).toHaveAttribute("aria-disabled", "false");
	engine.resolve();
});

test("opening the list clears the notice of files turned away before", async ({ page }) => {
	await drop(page, [bytes("video.mp4", [0, 0, 0, 0x18])]);
	await expect(notice(page)).toBeVisible();
	await compose(page).click();
	await expect(notice(page)).toBeHidden();
});

test("an empty list is not work: switching language does not ask", async ({ page }) => {
	await compose(page).click();
	await page.locator('[data-lang-switch] a[hreflang="en"]').click();
	await expect(page).toHaveURL(/\/en\/$/u);
});
