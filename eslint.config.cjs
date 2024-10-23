const _import = require('eslint-plugin-import');
const {fixupPluginRules} = require('@eslint/compat');
const globals = require('globals');
const js = require('@eslint/js');
const {FlatCompat} = require('@eslint/eslintrc');

const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
});

module.exports = [
	...compat.extends('enact', 'plugin:prettier/recommended', 'prettier'),
	{
		plugins: {
			import: fixupPluginRules(_import)
		},
		languageOptions: {
			globals: {
				...globals.node
			},
			ecmaVersion: 'latest',
			sourceType: 'module',
			parserOptions: {
				ecmaFeatures: {
					jsx: true
				}
			}
		},
		rules: {
			'import/no-unresolved': [
				'error',
				{
					commonjs: true,
					caseSensitive: true
				}
			],
			'import/named': 'error',
			'import/first': 'warn',
			'import/no-duplicates': 'error',
			'import/extensions': [
				'warn',
				'always',
				{
					js: 'never',
					json: 'always'
				}
			],
			'import/newline-after-import': 'warn',
			'import/order': [
				'warn',
				{
					'newlines-between': 'never',
					groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index']
				}
			]
		}
	}
];
