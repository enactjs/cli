const enactPlugin = require('eslint-plugin-enact');
const importPlugin = require('eslint-plugin-import');
const prettierPlugin = require('eslint-plugin-prettier');
const globals = require('globals');

module.exports = [
	{
		files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
		languageOptions: {
		  ecmaVersion: 'latest',
		  sourceType: 'module',
		  globals: {
			  ...globals.browser,
		  },
		  parserOptions: {
			  ecmaFeatures: {
				  jsx: true,
			  },
		  }
		},
		plugins: {
			enactPlugin,
			importPlugin,
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
		  ]
		}
	}
];