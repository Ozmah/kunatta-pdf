import { bundledFontFetch } from "./office-fonts.ts";
import { handleMessage } from "./handle.ts";

// Loaded only through `new Worker(...)`. The DOM lib types `self` as a Window, but the calls
// below exist with the same shape on DedicatedWorkerGlobalScope.
const fontFetch = bundledFontFetch(self.location.origin);

self.addEventListener("message", (event) => {
	void handleMessage(event, fontFetch).then((reply) => {
		// Blobs are passed by reference, so the transfer list is empty. In a worker the second
		// argument is that list, not the targetOrigin that window.postMessage takes.
		self.postMessage(reply, { transfer: [] });
	});
});
