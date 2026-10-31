import { describe, expect, test } from "bun:test";

import { fileFrom, signatures } from "../../../../tests/support/pdf-fixtures.ts";
import { UnsupportedFile } from "./classify.ts";
import { admit, PileFull, type IdSource } from "./pile.ts";

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
