import { defineConfig, fontProviders } from "astro/config";

import { defaultLocale, locales } from "./src/i18n/locales.ts";

// Latin subset of @fontsource-variable/inter: covers Spanish and English completely.
// Latin-ext is left out on purpose: it would always be preloaded and rarely used.
const latin =
	"U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

export default defineConfig({
	output: "static",
	trailingSlash: "always",
	i18n: {
		locales: [...locales],
		defaultLocale,
		routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: "Inter",
			cssVariable: "--font-inter",
			fallbacks: ["system-ui", "sans-serif"],
			options: {
				variants: [
					{
						src: ["@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2"],
						weight: "100 900",
						style: "normal",
						unicodeRange: [latin],
					},
				],
			},
		},
		{
			provider: fontProviders.local(),
			name: "Paper Mono",
			cssVariable: "--font-paper-mono",
			fallbacks: ["ui-monospace", "monospace"],
			options: {
				variants: [
					{
						src: ["./src/assets/fonts/PaperMono-Variable.woff2"],
						weight: "100 800",
						style: "normal",
					},
				],
			},
		},
	],
});
