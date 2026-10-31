import { describe, expect, test } from "bun:test";

import { composeJob, convertJob } from "./jobs.ts";

describe("jobs", () => {
	const entry = {
		id: "1",
		name: "foto.jpg",
		kind: "jpeg",
		size: 3,
		source: new Blob(["abc"]),
	} as const;

	const settings = { size: "a4", quality: "max", password: "on", name: "tarea" } as const;

	test("a conversion carries only the settings that shape it, and a password only when given", () => {
		expect(convertJob(entry, settings, undefined)).toEqual({
			fileName: "foto.jpg",
			kind: "jpeg",
			file: entry.source,
			settings: { size: "a4", quality: "max" },
		});
		expect(convertJob(entry, settings, "pass").password).toBe("pass");
	});

	test("a composition adds the password only when given", () => {
		const parts = [new Blob(["%PDF"])];

		expect("password" in composeJob("tarea.pdf", parts, "letter", undefined)).toBe(false);
		expect(composeJob("tarea.pdf", parts, "letter", "pass").password).toBe("pass");
	});
});
