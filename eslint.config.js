const enactConfig = require('eslint-config-enact');
const prettierConfig = require('eslint-config-prettier');
const importPlugin = require('eslint-plugin-import');
const prettierPlugin = require('eslint-plugin-prettier');
const globals = require('globals');

module.exports = [
	{
		files: ['*/.js', '*/.jsx', '*/.ts', '*/.tsx'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...globals.node
			},
			parserOptions: {
				ecmaFeatures: {
					jsx: true
				}
			}
		},
		plugins: {
			import: importPlugin,
			prettier: prettierPlugin
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
			...prettierPlugin.configs.recommended.rules,
			...prettierConfig.rules
		}
	},
	{
		...enactConfig,
		files: ['*/.js', '*/.jsx', '*/.ts', '*/.tsx']
	}
];
