const enactPlugin = require('eslint-plugin-enact');
const importPlugin = require('eslint-plugin-import');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierRecommended = require('eslint-config-prettier');

module.exports = [
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			parserOptions: {
				ecmaFeatures: {
					jsx: true,
				},
			}
		},
		plugins: {
			enactPlugin,
			import: importPlugin,
			prettier: prettierRecommended,
			prettierPlugin
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
			],
			"prettier/prettier": "error",
			"prettier/arrow-body-style": "off",
			"prettier/prefer-arrow-callback": "off"
		}
	}
];
