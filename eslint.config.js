const enactConfig = require('eslint-config-enact');
const eslintConfigPrettier = require('eslint-config-prettier');
const eslintPluginImport = require('eslint-plugin-import');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');
const globals = require('globals');

module.exports = [
	enactConfig,
	eslintPluginPrettierRecommended,
	eslintConfigPrettier,
	{
		plugins: {
			import: eslintPluginImport,
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
	}
];
