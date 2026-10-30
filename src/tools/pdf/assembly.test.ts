import { describe, expect, test } from "bun:test";

import {
	addEntries,
	canMove,
	isStale,
	moveBy,
	moveTo,
	naturalOrder,
	removeItem,
	togglePin,
	type Items,
} from "./assembly.ts";
import type { PileEntry } from "./pile.ts";
import { imageKinds } from "./sniff.ts";

function entry(name: string): PileEntry {
	return { id: name, name, kind: "jpeg", size: 1, source: new Blob(["x"]) };
}

const names = (items: Items): Array<string> => items.map((item) => item.entry.name);

/** Ten files named 1..10, with 3 and 6 pinned. */
function tenWithPins(): Items {
	const items = addEntries(
		[],
		Array.from({ length: 10 }, (_, index) => entry(String(index + 1))),
		"es",
	);

	return togglePin(togglePin(items, "3"), "6");
}

describe("order", () => {
	test("starts in natural order: foto 2 before foto 10", () => {
		const sorted = naturalOrder(
			[entry("foto 10.jpg"), entry("foto 2.jpg"), entry("Foto 1.jpg")],
			"es",
		);

		expect(sorted.map((item) => item.name)).toEqual(["Foto 1.jpg", "foto 2.jpg", "foto 10.jpg"]);
	});

	test("files added later go to the end, sorted among themselves", () => {
		const items = addEntries(
			addEntries([], [entry("b"), entry("a")], "es"),
			[entry("d"), entry("c")],
			"es",
		);

		expect(names(items)).toEqual(["a", "b", "c", "d"]);
	});
});

describe("pins", () => {
	test("removing an earlier file shifts pinned files up and they stay pinned", () => {
		const items = removeItem(tenWithPins(), "2");

		expect(names(items)).toEqual(["1", "3", "4", "5", "6", "7", "8", "9", "10"]);
		expect(items.filter((item) => item.pinned).map((item) => items.indexOf(item) + 1)).toEqual([
			2, 5,
		]);
	});

	test("moving other files never moves a pinned one", () => {
		const items = moveTo(tenWithPins(), "10", 0);

		expect(names(items)).toEqual(["10", "1", "3", "2", "4", "6", "5", "7", "8", "9"]);
		expect(items[2]?.entry.name).toBe("3");
		expect(items[5]?.entry.name).toBe("6");
	});

	test("↑ ↓ step over pinned files and stop at the ends", () => {
		const items = tenWithPins();

		expect(names(moveBy(items, "2", 1)).slice(0, 5)).toEqual(["1", "4", "3", "2", "5"]);
		expect(canMove(items, "1", -1)).toBe(false);
		expect(canMove(items, "10", 1)).toBe(false);
		expect(canMove(items, "3", 1)).toBe(false);
		expect(moveBy(items, "3", 1)).toBe(items);
	});
});

describe("isStale", () => {
	const normal = { size: "letter", quality: "normal" } as const;

	test("images follow quality, text follows page size, PDFs and Office follow neither", () => {
		for (const kind of imageKinds) {
			expect(isStale(kind, normal, { ...normal, quality: "max" })).toBe(true);
			expect(isStale(kind, normal, { ...normal, size: "a4" })).toBe(false);
		}

		expect(isStale("text", normal, { ...normal, size: "a4" })).toBe(true);
		expect(isStale("docx", normal, { size: "a4", quality: "light" })).toBe(false);
	});
});
