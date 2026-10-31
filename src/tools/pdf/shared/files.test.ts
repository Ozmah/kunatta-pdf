import { describe, expect, test } from "bun:test";

import { carriesFiles } from "./files.ts";

describe("carriesFiles", () => {
	test("reacts only to drags that carry files", () => {
		expect(carriesFiles(["Files"])).toBe(true);
		expect(carriesFiles(["text/plain", "Files"])).toBe(true);
		expect(carriesFiles(["text/plain", "text/uri-list"])).toBe(false);
		expect(carriesFiles([])).toBe(false);
	});
});
