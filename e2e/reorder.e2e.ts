import { expect, test, type Locator, type Page } from "@playwright/test";

import { es } from "../src/i18n/es.ts";
import { inspect, pdf, type PageSize, type Sample } from "./support/samples.ts";
import { checked, downloadOf, drop, order, row, setting } from "./support/tool.ts";

const names = ["1.pdf", "2.pdf", "3.pdf", "4.pdf"];

function square(side: number): PageSize {
	return { width: side, height: side };
}

async function fourRows(page: Page): Promise<void> {
	const samples: Array<Sample> = await Promise.all(
		names.map((name, index) => pdf(name, [square(101 + index)])),
	);

	await drop(page, samples);
	await checked(page);
}

/** Center of an element, for pointer gestures. */
interface Point {
	readonly x: number;
	readonly y: number;
}

async function center(selector: Locator): Promise<Point> {
	const box = await selector.boundingBox();

	if (box === null) throw new Error("The element to drag is not on screen");

	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Presses the grip of `name`, moves to `offsetY` below the center of `target`, and stays pressed. */
async function lift(page: Page, name: string, target: string, offsetY: number): Promise<void> {
	// Rows still sliding into place would move out from under the pointer.
	await expect(page.locator("[data-list] > li.shifting")).toHaveCount(0);

	const from = await center(row(page, name).locator("[data-grip]"));
	const to = await center(row(page, target));

	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x, to.y + offsetY, { steps: 12 });
}

function announcement(page: Page): Locator {
	return page.locator("[data-announce]");
}

test.beforeEach(async ({ page }) => {
	await page.goto("/es/");
	await setting(page, "size", "original");
});

test.describe("pointer", () => {
	test.skip(({ isMobile }) => isMobile, "phones drag by the tile; see the touch test");

	test("dragging a row by its grip moves it, and the PDF follows", async ({ page }) => {
		await fourRows(page);
		await lift(page, "1.pdf", "3.pdf", 12);
		await page.mouse.up();
		await expect.poll(() => order(page)).toEqual(["2.pdf", "3.pdf", "1.pdf", "4.pdf"]);
		await expect(announcement(page)).toHaveText("1.pdf soltado en la posición 3 de 4");

		const result = await downloadOf(page, () => page.locator("[data-make]").click());

		expect((await inspect(result.content)).pages).toEqual([
			square(102),
			square(103),
			square(101),
			square(104),
		]);
	});

	test("a pinned row cannot be picked up, and a dragged row jumps over it", async ({ page }) => {
		await fourRows(page);
		await row(page, "2.pdf").getByRole("button", { name: es["row.pin"] }).click();
		await expect(row(page, "2.pdf").locator("[data-grip]")).toBeDisabled();
		await lift(page, "1.pdf", "3.pdf", 12);
		await page.mouse.up();
		await expect.poll(() => order(page)).toEqual(["3.pdf", "2.pdf", "1.pdf", "4.pdf"]);
	});

	test("Esc or letting go outside the list puts the row back", async ({ page }) => {
		await fourRows(page);
		await lift(page, "1.pdf", "3.pdf", 12);
		await expect(row(page, "1.pdf")).toHaveClass(/lift/u);
		await page.keyboard.press("Escape");
		await page.mouse.up();
		await expect.poll(() => order(page)).toEqual(names);

		await lift(page, "1.pdf", "3.pdf", 12);
		await page.mouse.move(5, 5, { steps: 6 });
		await page.mouse.up();
		await expect.poll(() => order(page)).toEqual(names);
		await expect(announcement(page)).toHaveText(
			"Movimiento cancelado; 1.pdf sigue en la posición 1",
		);
	});
});

test.describe("keyboard", () => {
	test.skip(({ isMobile }) => isMobile, "the grip is a desktop control");

	test("Space takes the row, ↑ ↓ move it, Space drops it; each step is announced", async ({
		page,
	}) => {
		await fourRows(page);
		await row(page, "4.pdf").locator("[data-grip]").focus();
		await page.keyboard.press("Space");
		await expect(announcement(page)).toHaveText(
			"4.pdf tomado, posición 4 de 4. Usa ↑ ↓ para moverlo, Espacio para soltarlo y Esc para cancelar.",
		);
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("ArrowUp");
		await expect(row(page, "4.pdf").locator(".mtag")).toHaveText("MOVIENDO · 2 DE 4");
		await expect(announcement(page)).toHaveText("4.pdf, posición 2 de 4");
		await page.keyboard.press("Space");
		await expect.poll(() => order(page)).toEqual(["1.pdf", "4.pdf", "2.pdf", "3.pdf"]);
		await expect(announcement(page)).toHaveText("4.pdf soltado en la posición 2 de 4");
		// Focus stays on the grip through the moves.
		await expect(row(page, "4.pdf").locator("[data-grip]")).toBeFocused();
	});

	test("Esc returns the row to where it was taken", async ({ page }) => {
		await fourRows(page);
		await row(page, "1.pdf").locator("[data-grip]").focus();
		await page.keyboard.press("Space");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Escape");
		await expect.poll(() => order(page)).toEqual(names);
		await expect(announcement(page)).toHaveText(
			"Movimiento cancelado; 1.pdf sigue en la posición 1",
		);
	});

	test("file names reach labels and announcements exactly as they are", async ({ page }) => {
		// "$'" is a replacement pattern and "{total}" is a slot of the same message.
		const tricky = ["a$'b.pdf", "{total}.pdf"];

		await drop(
			page,
			await Promise.all(tricky.map((name, index) => pdf(name, [square(101 + index)]))),
		);
		await checked(page);
		await expect(row(page, "a$'b.pdf").locator("[data-grip]")).toHaveAttribute(
			"aria-label",
			"Mover a$'b.pdf",
		);

		const position = (await order(page)).indexOf("{total}.pdf") + 1;

		await row(page, "{total}.pdf").locator("[data-grip]").focus();
		await page.keyboard.press("Space");
		await expect(announcement(page)).toContainText(
			`{total}.pdf tomado, posición ${position} de 2.`,
		);
	});

	test("leaving the grip while holding a row puts it back", async ({ page }) => {
		await fourRows(page);
		await row(page, "1.pdf").locator("[data-grip]").focus();
		await page.keyboard.press("Space");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Tab");
		await expect.poll(() => order(page)).toEqual(names);
	});
});

test.describe("touch", () => {
	test.skip(({ isMobile }) => !isMobile, "touch gestures run on the phone project");

	test("on a phone the type tile is the handle", async ({ page }) => {
		await fourRows(page);

		const from = await center(row(page, "1.pdf").locator(".tile"));
		const to = await center(row(page, "3.pdf"));
		const session = await page.context().newCDPSession(page);

		type TouchType = "touchStart" | "touchMove" | "touchEnd";

		const touch = async (type: TouchType, y: number): Promise<void> => {
			await session.send("Input.dispatchTouchEvent", {
				type,
				touchPoints: type === "touchEnd" ? [] : [{ x: from.x, y }],
			});
		};

		await touch("touchStart", from.y);

		for (let step = 1; step <= 12; step += 1)
			await touch("touchMove", from.y + ((to.y + 12 - from.y) * step) / 12);

		await touch("touchEnd", 0);
		await expect.poll(() => order(page)).toEqual(["2.pdf", "3.pdf", "1.pdf", "4.pdf"]);
	});
});
