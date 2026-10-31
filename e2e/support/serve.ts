// Serves the production build for the end-to-end tests. Astro allows one preview server per
// project, so a developer's running preview would otherwise block the test run. Plain Node, so it
// also runs inside the Playwright image that takes the screenshots.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(import.meta.dirname, "..", "..", "dist");
const port = Number(process.env["PORT"] ?? "4330");

const types = new Map([
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".svg", "image/svg+xml"],
	[".woff2", "font/woff2"],
	[".ttf", "font/ttf"],
	[".txt", "text/plain; charset=utf-8"],
]);

interface Found {
	readonly path: string;
	readonly size: number;
}

/** The file under dist for a request URL. A malformed escape, a folder or a missing file is a 404, never a crash. */
async function find(url: string): Promise<Found | undefined> {
	try {
		const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
		// normalize() resolves "..", so a request can never climb out of dist.
		const path = normalize(pathname);
		const file = join(root, path.endsWith("/") ? join(path, "index.html") : path);
		const info = await stat(file);

		return info.isFile() ? { path: file, size: info.size } : undefined;
	} catch {
		return undefined;
	}
}

/** The not-found page in the language of the path prefix, Spanish otherwise, as the production server does. */
function notFoundPage(url: string): Promise<Found | undefined> {
	const english = /^\/en(?:\/|$)/u.test(new URL(url, "http://localhost").pathname);

	return find(english ? "/en/404/" : "/es/404/");
}

createServer((request, response) => {
	const url = request.url ?? "/";

	void find(url).then(async (page) => {
		const found = page ?? (await notFoundPage(url));

		if (found === undefined) {
			response.writeHead(404).end("Not found");

			return;
		}

		response.writeHead(page === undefined ? 404 : 200, {
			"content-type": types.get(extname(found.path)) ?? "application/octet-stream",
			"content-length": found.size,
		});
		createReadStream(found.path)
			.on("error", () => response.destroy())
			.pipe(response);
	});
}).listen(port);
