import type { APIRoute } from "astro";

import { robots, siteOrigin } from "../lib/crawlers.ts";

export const GET: APIRoute = ({ site }) =>
	new Response(robots(siteOrigin(site)), {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
