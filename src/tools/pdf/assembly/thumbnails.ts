import type { Items } from "./model.ts";

/** Object URLs, injectable so the bookkeeping can be tested without a browser. */
export interface ObjectUrls {
	create(blob: Blob): string;
	revoke(url: string): void;
}

export const browserUrls: ObjectUrls = {
	create: (blob) => URL.createObjectURL(blob),
	revoke: (url) => URL.revokeObjectURL(url),
};

export interface Thumbnails {
	/** Brings the URLs in line with the list and returns each row's URL by entry id. */
	sync(items: Items): ReadonlyMap<string, string>;
}

interface Held {
	readonly blob: Blob;
	readonly url: string;
}

/**
 * One object URL per row thumbnail. A row keeps its thumbnail while it is checked again after a
 * settings change; a new thumbnail replaces it, and leaving the list frees it.
 */
export function createThumbnails(urls: ObjectUrls): Thumbnails {
	const held = new Map<string, Held>();

	return {
		sync(items) {
			const present = new Set(items.map((item) => item.entry.id));

			for (const [id, { url }] of held) {
				if (present.has(id)) continue;

				urls.revoke(url);
				held.delete(id);
			}

			for (const { entry, state } of items) {
				const blob = state.kind === "ready" ? state.file.thumbnail : undefined;
				const current = held.get(entry.id);

				if (blob === undefined || current?.blob === blob) continue;

				if (current !== undefined) urls.revoke(current.url);

				held.set(entry.id, { blob, url: urls.create(blob) });
			}

			return new Map(Array.from(held, ([id, { url }]) => [id, url]));
		},
	};
}
