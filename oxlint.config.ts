import { defineConfig, type OxlintOverride } from "oxlint";

// The PDF tool's folders (src/tools/pdf/): contract/ is shared by both threads, worker/ is the only
// place that loads the PDF and Office engines, and the flows never import each other; index.ts
// wires them together.
const flows = ["intake", "single", "assembly", "settings", "dialogs"];
const inside = (folder: string): string => `**/${folder}/**`;

const engines = [
	{ name: "@libpdf/core", message: "PDF work happens in the worker (src/tools/pdf/worker/)." },
	{ name: "reamkit", message: "Office work happens in the worker (src/tools/pdf/worker/)." },
];

// Each override replaces the rule for its files, so every one repeats the engines except worker/.
function boundary(
	files: Array<string>,
	group: Array<string>,
	message: string,
	worker = false,
): OxlintOverride {
	return {
		files,
		rules: {
			"no-restricted-imports": [
				"error",
				{ paths: worker ? [] : engines, patterns: [{ group, message }] },
			],
		},
	};
}

export default defineConfig({
	plugins: ["typescript", "unicorn", "oxc", "import"],
	categories: { correctness: "error", suspicious: "error" },
	ignorePatterns: [
		".agent/**",
		".agents/**",
		".claude/**",
		".codex/**",
		".continue/**",
		".cursor/**",
		".gemini/**",
		".opencode/**",
		".pi/**",
		".roo/**",
		".windsurf/**",
		"tools/oxlint/anti-slop/**",
		"dist/**",
		".astro/**",
	],
	jsPlugins: [{ name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" }],
	overrides: [
		{ files: ["src/**"], rules: { "no-restricted-imports": ["error", { paths: engines }] } },
		boundary(
			["src/tools/pdf/contract/**"],
			["../**"],
			"contract/ is read by both threads and imports nothing else.",
		),
		boundary(
			["src/tools/pdf/worker/**"],
			[...flows, "shared", "conversion", "lib", "i18n"].map(inside),
			"The worker imports only contract/ and itself.",
			true,
		),
		boundary(
			["src/tools/pdf/shared/**", "src/tools/pdf/conversion/**"],
			[...flows, "worker"].map(inside),
			"shared/ and conversion/ serve every flow, so they never import one.",
		),
		...flows.map((flow) =>
			boundary(
				[`src/tools/pdf/${flow}/**`],
				[...flows.filter((other) => other !== flow), "worker"].map(inside),
				"Flows never import each other or the worker; index.ts wires them.",
			),
		),
		boundary(
			["src/lib/**", "src/i18n/**"],
			[inside("tools")],
			"lib/ and i18n/ serve every tool, so they never import one.",
		),
	],
	rules: {
		"oxc/no-accumulating-spread": "error",
		// Global stylesheets are imported for their side effect; JS modules still must be assigned.
		"import/no-unassigned-import": ["error", { allow: ["**/*.css"] }],
		// Imports read as the module's header: nothing runs or is declared before them.
		"import/first": "error",
		"anti-slop/no-array-filter-map": "error",
		"anti-slop/no-reduce-accumulator-copy": "error",
		"anti-slop/no-chained-type-assertions": "error",
		"anti-slop/no-conditional-empty-object-spread": "error",
		"anti-slop/no-known-value-widening": "error",
		"anti-slop/no-module-mocking": "error",
		"anti-slop/no-object-parameters": "error",
		"anti-slop/no-reflect-apply": "error",
		"anti-slop/no-reflect-get": "error",
		"anti-slop/no-runtime-typeof": "error",
		"anti-slop/no-shape-in-symbol-names": "error",
		"anti-slop/no-unknown-parameters": "error",
		"anti-slop/no-unknown-returns": "error",
		"anti-slop/no-unknown-type-aliases": "error",
		"anti-slop/no-unsafe-dictionary-type": "error",
		"anti-slop/no-widen-then-assert": "error",
		"anti-slop/require-readable-spacing": "error",
		"anti-slop/require-safety-comment-for-type-assertion": "error",
	},
});
