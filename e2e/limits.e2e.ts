import { open } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { es } from "../src/i18n/es.ts";
import { withCount } from "../src/i18n/format.ts";
import { bytes, office, officeSamples, text } from "./support/samples.ts";
import { downloadOf, drop, notice, pickPaths, rows } from "./support/tool.ts";

const mebibyte = 1024 * 1024;

/** A file of `size` bytes on disk that starts with a JPEG signature; the rest is a sparse hole. */
async function bigJpeg(path: string, size: number): Promise<string> {
	const file = await open(path, "w");

	await file.write(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));
	await file.truncate(size);
	await file.close();

	return path;
}

test.beforeEach(async ({ page }) => {
	await page.goto("/es/");
});

test("files that cannot become a PDF are named in a notice, and the rest carry on", async ({
	page,
}) => {
	await drop(page, [
		bytes("video.mp4", [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]),
		bytes("animacion.gif", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]),
		bytes("foto.heic", [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
		bytes("vacio.txt", []),
		text("a.txt", "a"),
		text("b.txt", "b"),
	]);
	await expect(rows(page)).toHaveCount(2);
	await expect(notice(page)).toContainText(withCount(es["rejected.many"], 4));

	for (const name of ["video.mp4", "animacion.gif", "foto.heic", "vacio.txt"]) {
		await expect(notice(page)).toContainText(name);
	}
});

test("one good file next to a bad one still goes straight to a PDF", async ({ page }) => {
	const result = await downloadOf(page, () =>
		drop(page, [bytes("video.mp4", [0x00, 0x00, 0x00, 0x18]), text("nota.txt", "hola")]),
	);

	expect(result.name).toBe("nota.pdf");
	await expect(notice(page)).toContainText(`video.mp4 ${es["rejected.one"]}`);
});

test("a file turned away stays named next to a conversion that looks different", async ({
	page,
}) => {
	const legacy = await office(officeSamples.doc);

	await downloadOf(page, () => drop(page, [bytes("video.mp4", [0x00, 0x00, 0x00, 0x18]), legacy]));
	await expect(notice(page)).toContainText(`video.mp4 ${es["rejected.one"]}`);
	await expect(notice(page)).toContainText(`${officeSamples.doc} ${es["degraded.doc"]}`);
});

test("a file over 50 MiB is turned away by name", async ({ page }, info) => {
	const path = await bigJpeg(info.outputPath("enorme.jpg"), 50 * mebibyte + 1);

	await pickPaths(page, [path]);
	await expect(notice(page)).toContainText("enorme.jpg");
	await expect(page.locator("[data-empty-drop]")).toBeVisible();
});

test("only the first 100 files enter the list", async ({ page }) => {
	const notes = Array.from({ length: 101 }, (_, index) =>
		text(`nota ${String(index + 1).padStart(3, "0")}.txt`, `nota ${index + 1}`),
	);

	await drop(page, notes);
	await expect(rows(page)).toHaveCount(100);
	await expect(notice(page)).toContainText("nota 101.txt");
});

test("the list stops at 200 MiB in total", async ({ page }, info) => {
	const paths = await Promise.all(
		["a", "b", "c", "d", "e"].map((name) => bigJpeg(info.outputPath(`${name}.jpg`), 45 * mebibyte)),
	);

	await pickPaths(page, paths);
	await expect(rows(page)).toHaveCount(4);
	await expect(notice(page)).toContainText(`e.jpg ${es["rejected.one"]}`);
});
