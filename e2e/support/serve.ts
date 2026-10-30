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

createServer((request, response) => {
	const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
	// normalize() resolves "..", so a request can never climb out of dist.
	const path = normalize(decodeURIComponent(pathname));
	const file = join(root, path.endsWith("/") ? join(path, "index.html") : path);

	stat(file).then(
		(info) => {
			if (!info.isFile()) throw new Error("Not a file");

			response.writeHead(200, {
				"content-type": types.get(extname(file)) ?? "application/octet-stream",
				"content-length": info.size,
			});
			createReadStream(file).pipe(response);
		},
		() => {
			response.writeHead(404).end("Not found");
		},
	);
}).listen(port);
