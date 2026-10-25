import { defineConfig } from "astro/config";

import { defaultLocale, locales } from "./src/i18n/locales.ts";

export default defineConfig({
	output: "static",
	trailingSlash: "always",
	i18n: {
		locales: [...locales],
		defaultLocale,
		routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
	},
});
