export interface Downloader {
	/** Starts a download of `pdf` as `name` and keeps it for `again()`. */
	save(pdf: Blob, name: string): void;
	again(): void;
	/** Frees the last PDF; it stays in memory only while it can still be downloaded again. */
	release(): void;
}

export function createDownloader(root: Document): Downloader {
	let last: { readonly url: string; readonly name: string } | undefined;

	const start = (url: string, name: string): void => {
		const link = root.createElement("a");

		link.href = url;
		link.download = name;
		link.click();
	};

	const release = (): void => {
		if (last !== undefined) URL.revokeObjectURL(last.url);

		last = undefined;
	};

	root.defaultView?.addEventListener("pagehide", release);

	return {
		save(pdf, name) {
			release();
			last = { url: URL.createObjectURL(pdf), name };
			start(last.url, last.name);
		},
		again() {
			if (last !== undefined) start(last.url, last.name);
		},
		release,
	};
}
