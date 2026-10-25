import { describe, expect, test } from "bun:test";

import { fileFrom, signatures } from "./fixtures.ts";
import { UnsupportedFile } from "./ingest.ts";
import { admit, moveEntry, PileFull, removeEntry, type IdSource } from "./pile.ts";

function sequentialIds(): IdSource {
	let next = 0;

	return () => {
		next += 1;

		return `entry-${next}`;
	};
}

describe("admit", () => {
	test("keeps accepted files in order and reports the rejected ones", async () => {
		const files = [
			fileFrom(signatures.jpeg, "pizarron.jpg"),
			fileFrom(signatures.docx, "tarea.docx"),
			fileFrom(signatures.pdf, "practica.pdf"),
		];

		const { pile, rejected } = await admit([], files, sequentialIds());

		expect(pile.map((entry) => [entry.id, entry.name, entry.kind])).toEqual([
			["entry-1", "pizarron.jpg", "jpeg"],
			["entry-2", "practica.pdf", "pdf"],
		]);
		expect(rejected).toHaveLength(1);
		expect(UnsupportedFile.is(rejected[0])).toBe(true);
	});

	test("stops at the file limit and says why", async () => {
		const files = Array.from({ length: 101 }, (_, index) =>
			fileFrom(signatures.png, `${index}.png`),
		);

		const { pile, rejected } = await admit([], files, sequentialIds());

		expect(pile).toHaveLength(100);
		expect(rejected).toHaveLength(1);
		expect(PileFull.is(rejected[0]) && rejected[0].reason).toBe("files");
	});
});

describe("pile edits", () => {
	test("moves and removes entries without mutating the original pile", async () => {
		const files = ["a", "b", "c"].map((name) => fileFrom(signatures.png, `${name}.png`));
		const { pile } = await admit([], files, sequentialIds());

		const moved = moveEntry(pile, "entry-3", 0);
		const removed = removeEntry(moved, "entry-1");

		expect(moved.map((entry) => entry.name)).toEqual(["c.png", "a.png", "b.png"]);
		expect(removed.map((entry) => entry.name)).toEqual(["c.png", "b.png"]);
		expect(pile.map((entry) => entry.name)).toEqual(["a.png", "b.png", "c.png"]);
	});

	test("clamps targets and ignores unknown ids", async () => {
		const { pile } = await admit(
			[],
			[fileFrom(signatures.png, "a.png"), fileFrom(signatures.gif, "b.gif")],
			sequentialIds(),
		);

		expect(moveEntry(pile, "entry-1", 99).map((entry) => entry.name)).toEqual(["b.gif", "a.png"]);
		expect(moveEntry(pile, "missing", 0)).toBe(pile);
	});
});
