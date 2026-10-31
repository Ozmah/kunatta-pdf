import { describe, expect, test } from "bun:test";

/**
 * The scripts find their markup by selector. A selector the built page does not have would only
 * fail at runtime, so this reads every lookup a module writes and checks that the element it
 * belongs to contains it, in every built page. `bun run check` builds before it tests.
 */

interface Contract {
	/** The custom element whose markup the modules look up. */
	readonly host: string;
	readonly modules: ReadonlyArray<string>;
}

const contracts: ReadonlyArray<Contract> = [
	{ host: "kn-dropzone", modules: ["src/tools/pdf/intake/dropzone.ts"] },
	{ host: "kn-single", modules: ["src/tools/pdf/single/view.ts"] },
	{
		host: "kn-assembly",
		modules: ["src/tools/pdf/assembly/view.ts", "src/tools/pdf/assembly/reorder.ts"],
	},
	{ host: "kn-settings", modules: ["src/tools/pdf/settings/panel.ts"] },
	{ host: "kn-dialogs", modules: ["src/tools/pdf/dialogs/dialogs.ts"] },
	{
		host: "kn-language-switch",
		modules: ["src/components/language-switch.ts", "src/lib/language-guard.ts"],
	},
];

const pages = ["dist/es/index.html", "dist/en/index.html"];

// `required(root, "…")`, `.querySelector("…")`, `.querySelectorAll("…")` and `.closest("…")`.
const lookups: ReadonlyArray<RegExp> = [
	/required(?:<[^>]*>)?\(\s*[^,()]+,\s*(["'])((?:(?!\1).)+)\1/g,
	/\.(?:querySelector|querySelectorAll|closest)(?:<[^>]*>)?\(\s*(["'])((?:(?!\1).)+)\1/g,
];

// The same calls with anything but a string literal: those could not be checked here.
const unchecked: ReadonlyArray<RegExp> = [
	/required(?:<[^>]*>)?\(\s*[^,()]+,\s*[^"'\s]/,
	/\.(?:querySelector|querySelectorAll|closest)(?:<[^>]*>)?\(\s*[^"'\s)]/,
];

function selectorsIn(source: string): ReadonlyArray<string> {
	return lookups.flatMap((pattern) =>
		Array.from(source.matchAll(pattern), (match) => match[2] ?? ""),
	);
}

function count(html: string, selector: string): number {
	let found = 0;

	new HTMLRewriter()
		.on(selector, {
			element() {
				found += 1;
			},
		})
		.transform(html);

	return found;
}

async function pageHtml(path: string): Promise<string> {
	const file = Bun.file(path);

	if (!(await file.exists())) throw new Error(`${path} is missing: run bun run build first`);

	return file.text();
}

/** Every selector a contract's modules look up that its element does not contain. */
async function missing(html: string, contract: Contract): Promise<ReadonlyArray<string>> {
	const sources = await Promise.all(contract.modules.map((path) => Bun.file(path).text()));
	const selectors = new Set(sources.flatMap(selectorsIn));

	if (count(html, contract.host) !== 1) return [`<${contract.host}> (expected exactly one)`];

	return [...selectors].filter((selector) => count(html, `${contract.host} ${selector}`) === 0);
}

describe("markup contract", () => {
	test.each(pages)("%s has every element and selector its scripts look up", async (page) => {
		const html = await pageHtml(page);

		for (const contract of contracts) {
			expect({ host: contract.host, missing: await missing(html, contract) }).toEqual({
				host: contract.host,
				missing: [],
			});
		}
	});

	test.each(pages)("every dialog in %s has the form ask() submits", async (page) => {
		const html = await pageHtml(page);

		expect(count(html, "dialog.dlg > form")).toBe(count(html, "dialog.dlg"));
	});

	test("every lookup names its selector literally, so this contract can see it", async () => {
		const modules = contracts.flatMap((contract) => contract.modules);

		const sources = await Promise.all(
			modules.map(async (path) => [path, await Bun.file(path).text()]),
		);

		const dynamic = sources.filter(([, source]) =>
			unchecked.some((pattern) => pattern.test(source ?? "")),
		);

		expect(dynamic.map(([path]) => path)).toEqual([]);
	});

	test("the contract notices an attribute renamed in the markup", async () => {
		const html = (await pageHtml(pages[0] ?? "")).replaceAll("data-list", "data-items");
		const assembly = contracts.find((contract) => contract.host === "kn-assembly");

		expect(assembly === undefined ? [] : await missing(html, assembly)).toContain("[data-list]");
	});
});
