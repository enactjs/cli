module.exports = {
	env: {
		node: true
	},
	extends: ['enact', 'plugin:prettier/recommended', 'prettier'],
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
