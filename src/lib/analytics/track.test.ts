import { beforeEach, describe, expect, test } from "bun:test";

import { connectTracking, disableTracking, enableTracking, track } from "./track.ts";

interface Recorder {
	readonly sent: Array<string>;
	capture(event: string): void;
}

/** A client that records what it was handed, in order. */
function recorder(): Recorder {
	const sent: Array<string> = [];

	return {
		sent,
		capture(event) {
			sent.push(event);
		},
	};
}

// The module keeps its state between tests; each one starts disabled and empty.
beforeEach(() => {
	disableTracking();
});

describe("track", () => {
	test("does nothing before tracking is enabled", () => {
		const client = recorder();

		track("files_added", {});
		connectTracking(client);
		track("pdf_made", {});

		expect(client.sent).toEqual([]);
	});

	test("queues events until the client connects, then sends them in order", () => {
		const client = recorder();

		enableTracking();
		track("files_added", {});
		track("pdf_made", {});
		connectTracking(client);

		expect(client.sent).toEqual(["files_added", "pdf_made"]);
	});

	test("sends straight to the client once it is connected", () => {
		const client = recorder();

		enableTracking();
		connectTracking(client);
		track("pdf_failed", {});

		expect(client.sent).toEqual(["pdf_failed"]);
	});

	test("the 26th waiting event evicts the oldest", () => {
		const client = recorder();

		enableTracking();

		for (let index = 0; index < 26; index += 1) track(`event_${index}`, {});

		connectTracking(client);

		expect(client.sent).toHaveLength(25);
		expect(client.sent[0]).toBe("event_1");
		expect(client.sent.at(-1)).toBe("event_25");
	});

	test("disabling forgets the queue and the client, so nothing is sent afterwards", () => {
		const first = recorder();
		const second = recorder();

		enableTracking();
		connectTracking(first);
		track("files_added", {});
		disableTracking();
		track("pdf_made", {});
		connectTracking(second);

		expect(first.sent).toEqual(["files_added"]);
		expect(second.sent).toEqual([]);
	});

	test("disabling drops events that were still waiting", () => {
		const client = recorder();

		enableTracking();
		track("files_added", {});
		disableTracking();
		enableTracking();
		connectTracking(client);

		expect(client.sent).toEqual([]);
	});
});
