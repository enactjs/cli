// This is a workaround for https://github.com/eslint/eslint/issues/3458
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
	env: {
		node: true
	},
	extends: ['enact', 'plugin:prettier/recommended', 'prettier'],
	parserOptions: {
		ecmaFeatures: {
			jsx: true
		},
		ecmaVersion: 'latest',
		sourceType: 'module'
	},
	plugins: ['import'],
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
};
