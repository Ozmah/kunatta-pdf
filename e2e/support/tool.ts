import { readFile } from "node:fs/promises";

import { expect, type Locator, type Page } from "@playwright/test";

import type { Sample } from "./samples.ts";

interface TransferFile {
	readonly name: string;
	readonly type: string;
	readonly base64: string;
}

function transferable(samples: ReadonlyArray<Sample>): Array<TransferFile> {
	return samples.map((sample) => ({
		name: sample.name,
		type: sample.mimeType,
		base64: sample.buffer.toString("base64"),
	}));
}

/** Drops files the way a desktop drag does: a DataTransfer on a `drop` event. */
export async function drop(
	page: Page,
	samples: ReadonlyArray<Sample>,
	target = "[data-empty-drop]",
): Promise<void> {
	const dataTransfer = await page.evaluateHandle((files) => {
		const transfer = new DataTransfer();

		for (const file of files) {
			const content = Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0));

			transfer.items.add(new File([content], file.name, { type: file.type }));
		}

		return transfer;
	}, transferable(samples));

	await page.locator(target).dispatchEvent("drop", { dataTransfer });
}

/** Pastes files the way Ctrl V does with files on the clipboard. */
export async function paste(page: Page, samples: ReadonlyArray<Sample>): Promise<void> {
	await page.evaluate((files) => {
		const transfer = new DataTransfer();

		for (const file of files) {
			const content = Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0));

			transfer.items.add(new File([content], file.name, { type: file.type }));
		}

		const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });

		// Firefox copies an init `clipboardData` without its files, so the transfer is attached
		// afterwards. A real paste fills the same property; the page code cannot tell the difference.
		Object.defineProperty(event, "clipboardData", { value: transfer });
		document.dispatchEvent(event);
	}, transferable(samples));
}

/** Chooses files in the system picker. */
export async function pick(page: Page, samples: ReadonlyArray<Sample>): Promise<void> {
	await page.locator("[data-picker]").setInputFiles(samples);
}

/** Chooses files on disk; big files go by path instead of through the protocol. */
export async function pickPaths(page: Page, paths: ReadonlyArray<string>): Promise<void> {
	await page.locator("[data-picker]").setInputFiles(paths);
}

export interface Downloaded {
	readonly name: string;
	readonly content: Buffer;
}

/** Runs `action` and returns the file it downloads. */
export async function downloadOf(page: Page, action: () => Promise<void>): Promise<Downloaded> {
	const [download] = await Promise.all([page.waitForEvent("download"), action()]);
	const path = await download.path();

	return { name: download.suggestedFilename(), content: await readFile(path) };
}

/** Collects every download the page starts, to prove that none happened. */
export function downloadsOf(page: Page): ReadonlyArray<string> {
	const names: Array<string> = [];

	page.on("download", (download) => names.push(download.suggestedFilename()));

	return names;
}

export type SettingGroup = "size" | "quality" | "password";

/** Changes a setting through the gear panel, then closes it. */
export async function setting(page: Page, group: SettingGroup, value: string): Promise<void> {
	await page.locator("[data-gear]").click();
	await page.locator(`input[name="${group}"][value="${value}"]`).check();
	await page.keyboard.press("Escape");
}

export function rows(page: Page): Locator {
	return page.locator("[data-list] > li");
}

export function row(page: Page, name: string): Locator {
	return rows(page).filter({ has: page.locator("[data-row-name]", { hasText: name }) });
}

/** The names in the list, in the order they will be composed. */
export async function order(page: Page): Promise<Array<string>> {
	return page.locator("[data-list] [data-row-name]").allTextContents();
}

/** Waits until every row finished its background check. */
export async function checked(page: Page): Promise<void> {
	await expect(page.locator('[data-list] > li[data-state="checking"]')).toHaveCount(0, {
		timeout: 60_000,
	});
}

/**
 * Holds back the Office engine, which loads on first use, so a conversion stays in progress
 * until `resolve()` is called. Makes "while it is converting" tests deterministic.
 */
export async function holdOfficeEngine(page: Page): Promise<PromiseWithResolvers<void>> {
	const engine = Promise.withResolvers<void>();

	await page.context().route("**/_astro/office-*.js", async (route) => {
		await engine.promise;
		await route.continue();
	});

	return engine;
}

export function dialog(page: Page, name: string): Locator {
	return page.locator(`dialog[data-dialog="${name}"]`);
}

export function notice(page: Page): Locator {
	return page.locator("[data-notice]");
}
