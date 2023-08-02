const enact = require('eslint-config-enact');
const importPlugin = require('eslint-plugin-import');
const prettier = require('eslint-config-prettier');
const prettierPlugin = require('eslint-plugin-prettier');

module.exports = [
	enact,
	prettier,
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			parserOptions: {
				ecmaFeatures: {
					jsx: true
				}
			}
		}
	},
	{
		plugins: {
			import: importPlugin
		},
		rules: {
			'import/no-unresolved': ['error', {commonjs: true, caseSensitive: true}],
			'import/named': 'error',
			'import/first': 'warn',
			'import/no-duplicates': 'error',
			'import/extensions': ['warn', 'always', {js: 'never', json: 'always'}],
			'import/newline-after-import': 'warn',
			'import/order': [
				'warn',
				{
					'newlines-between': 'never',
					groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index']
				}
			]
		}
	},
	{
		plugins: {
			prettier: prettierPlugin
		},
		rules: {
			"prettier/prettier": "error",
			"arrow-body-style": "off",
			"prefer-arrow-callback": "off"
		}
	}
];
