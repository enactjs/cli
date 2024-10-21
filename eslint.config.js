import _import from "eslint-plugin-import";
import { fixupPluginRules } from "@eslint/compat";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
});

export default [...compat.extends("enact", "plugin:prettier/recommended", "prettier"), {
	plugins: {
		import: fixupPluginRules(_import),
	},

	languageOptions: {
		globals: {
			...globals.node,
		},

		ecmaVersion: "latest",
		sourceType: "module",

		parserOptions: {
			ecmaFeatures: {
				jsx: true,
			},
		},
	},

	rules: {
		"import/no-unresolved": ["error", {
			commonjs: true,
			caseSensitive: true,
		}],

		"import/named": "error",
		"import/first": "warn",
		"import/no-duplicates": "error",

		"import/extensions": ["warn", "always", {
			js: "never",
			json: "always",
		}],

		"import/newline-after-import": "warn",

		"import/order": ["warn", {
			"newlines-between": "never",
			groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
		}],
	},
}];