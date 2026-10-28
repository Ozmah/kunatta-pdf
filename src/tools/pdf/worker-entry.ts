import { bundledFontFetch } from "./office-fonts.ts";
import { handleMessage } from "./worker.ts";

// Loaded only through `new Worker(...)`. The DOM lib types `self` as a Window, but the calls
// below exist with the same shape on DedicatedWorkerGlobalScope.
const fontFetch = bundledFontFetch(self.location.origin);

self.addEventListener("message", (event) => {
	void handleMessage(event, fontFetch).then(({ message, transfer }) => {
		self.postMessage(message, { transfer: [...transfer] });
	});
});
