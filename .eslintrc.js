module.exports = {
	env: {
		node: true
	},
	extends: ['enact', 'plugin:prettier/recommended', 'prettier', 'plugin:jsx-a11y/strict'],
	plugins: ['import', 'jsx-a11y'],
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
		'jsx-a11y/alt-text': 'warn',
		'jsx-a11y/aria-role': 'warn',
		'jsx-a11y/aria-props': 'warn',
		'jsx-a11y/img-redundant-alt': [
			'warn',
			{
				components: ['Image'],
				words: ['picture', 'image']
			}
		]
	}
};
