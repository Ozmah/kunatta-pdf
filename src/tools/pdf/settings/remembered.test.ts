import { describe, expect, test } from "bun:test";

import { recall, remember, rememberedKey, type PreferenceStore } from "./remembered.ts";
import { defaultSettings } from "./settings.ts";

function mapStore(initial: ReadonlyArray<[string, string]> = []): PreferenceStore & {
	readonly values: Map<string, string>;
} {
	const values = new Map(initial);

	return {
		values,
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => {
			values.set(key, value);
		},
	};
}

const blocked: PreferenceStore = {
	getItem: () => {
		throw new DOMException("The operation is insecure.", "SecurityError");
	},
	setItem: () => {
		throw new DOMException("Quota exceeded", "QuotaExceededError");
	},
};

describe("remember and recall", () => {
	test("keep size, quality and the password setting, never the name", () => {
		const store = mapStore();

		remember(store, { size: "a4", quality: "max", password: "on", name: "tarea" });

		expect(recall(store)).toEqual({ size: "a4", quality: "max", password: "on" });
		expect(store.values.get(rememberedKey)).not.toContain("tarea");
	});

	test("nothing stored, or a value that is not JSON, means nothing remembered", () => {
		expect(recall(mapStore())).toBeUndefined();
		expect(recall(mapStore([[rememberedKey, "{not json"]]))).toBeUndefined();
		expect(recall(mapStore([[rememberedKey, "42"]]))).toBeUndefined();
	});

	test("an unknown value falls back to its default and keeps the others", () => {
		const store = mapStore([
			[rememberedKey, '{"size":"tabloid","quality":"light","password":"on"}'],
		]);

		expect(recall(store)).toEqual({ size: defaultSettings.size, quality: "light", password: "on" });
	});

	test("blocked storage neither throws nor remembers", () => {
		expect(() => remember(blocked, defaultSettings)).not.toThrow();
		expect(recall(blocked)).toBeUndefined();
	});
});
