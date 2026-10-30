// Serves the production build for the end-to-end tests. Astro allows one preview server per
// project, so a developer's running preview would otherwise block the test run.
import { join, normalize } from "node:path";

const root = join(import.meta.dirname, "..", "..", "dist");
const port = Number(process.env["PORT"] ?? "4330");

Bun.serve({
	port,
	async fetch(request) {
		const path = normalize(decodeURIComponent(new URL(request.url).pathname));
		const file = Bun.file(join(root, path.endsWith("/") ? join(path, "index.html") : path));

		// normalize() resolves "..", so a request can never climb out of dist.
		if (!(await file.exists())) return new Response("Not found", { status: 404 });

		return new Response(file);
	},
});
