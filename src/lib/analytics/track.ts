import type { Properties } from "posthog-js";

/**
 * The only door from the app to analytics. It does nothing until the analytics runtime starts,
 * which only happens in production builds with a project key and no privacy signal, so the tool
 * calls it freely. Events sent before the SDK finishes loading wait here, up to a small limit.
 */

interface Client {
	capture(event: string, properties: Properties): void;
}

const maxWaiting = 25;

let enabled = false;
let client: Client | undefined;
const waiting: Array<[string, Properties]> = [];

/** Sends one event; each tool types its own events on top of this (see its telemetry.ts). */
export function track(event: string, properties: Properties): void {
	if (!enabled) return;

	if (client !== undefined) {
		client.capture(event, properties);

		return;
	}

	if (waiting.length === maxWaiting) waiting.shift();

	waiting.push([event, properties]);
}

export function enableTracking(): void {
	enabled = true;
}

/** Hands the loaded SDK every event that waited for it. */
export function connectTracking(loaded: Client): void {
	if (!enabled) return;

	client = loaded;

	for (const [event, properties] of waiting.splice(0)) loaded.capture(event, properties);
}

/** Stops sending and forgets what waited, for a privacy signal or an SDK that failed to load. */
export function disableTracking(): void {
	enabled = false;
	client = undefined;
	waiting.length = 0;
}
