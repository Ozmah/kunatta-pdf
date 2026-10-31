import { describe, expect, test } from "bun:test";

import type { Item, ItemState } from "./model.ts";
import { createThumbnails, type ObjectUrls } from "./thumbnails.ts";

interface Tracked extends ObjectUrls {
	readonly live: Set<string>;
}

function trackedUrls(): Tracked {
	const live = new Set<string>();
	let next = 0;

	return {
		live,
		create: () => {
			next += 1;
			live.add(`blob:${next}`);

			return `blob:${next}`;
		},
		revoke: (url) => {
			live.delete(url);
		},
	};
}

function item(id: string, state: ItemState): Item {
	return {
		entry: { id, name: `${id}.jpg`, kind: "jpeg", size: 1, source: new Blob(["x"]) },
		state,
		pinned: false,
	};
}

function ready(thumbnail?: Blob): ItemState {
	const file = { pdf: new Blob(["%PDF"]), degraded: false, pages: 1 };
	const usedSettings = { size: "letter", quality: "normal" } as const;

	return {
		kind: "ready",
		file: thumbnail === undefined ? file : { ...file, thumbnail },
		usedSettings,
	};
}

describe("createThumbnails", () => {
	test("gives each ready image one URL and reuses it across redraws", () => {
		const urls = trackedUrls();
		const thumbnails = createThumbnails(urls);
		const photo = item("a", ready(new Blob(["jpeg"])));
		const text = item("b", ready());

		const first = thumbnails.sync([photo, text]);
		const second = thumbnails.sync([text, photo]);

		expect(first.get("a")).toBe("blob:1");
		expect(first.has("b")).toBe(false);
		expect(second.get("a")).toBe("blob:1");
		expect(urls.live.size).toBe(1);
	});

	test("keeps the old thumbnail while a row is checked again, then swaps it", () => {
		const urls = trackedUrls();
		const thumbnails = createThumbnails(urls);

		thumbnails.sync([item("a", ready(new Blob(["v1"])))]);

		expect(thumbnails.sync([item("a", { kind: "checking" })]).get("a")).toBe("blob:1");
		expect(thumbnails.sync([item("a", ready(new Blob(["v2"])))]).get("a")).toBe("blob:2");
		expect([...urls.live]).toEqual(["blob:2"]);
	});

	test("frees the URL of a row that leaves, and every URL when the list empties", () => {
		const urls = trackedUrls();
		const thumbnails = createThumbnails(urls);
		const a = item("a", ready(new Blob(["a"])));
		const b = item("b", ready(new Blob(["b"])));

		thumbnails.sync([a, b]);
		thumbnails.sync([b]);

		expect([...urls.live]).toEqual(["blob:2"]);

		thumbnails.sync([]);

		expect(urls.live.size).toBe(0);
	});
});
