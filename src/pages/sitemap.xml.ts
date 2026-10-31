import type { APIRoute } from "astro";

import { siteOrigin, sitemap } from "../lib/crawlers.ts";

export const GET: APIRoute = ({ site }) =>
	new Response(sitemap(siteOrigin(site)), {
		headers: { "Content-Type": "application/xml; charset=utf-8" },
	});
