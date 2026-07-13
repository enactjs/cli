const strict = require('eslint-config-enact/strict');
const globals = require('globals');

const bunGlobals = {
	...globals.node,
	Bun: 'readonly'
};

const bunRules = {
	'no-console': 'off',
	'no-nested-ternary': 'off',
	'no-undefined': 'off',
	'operator-linebreak': 'off',
	'radix': 'off',
	'no-unused-vars': ['error', {
		argsIgnorePattern: '^_',
		varsIgnorePattern: '^_',
		caughtErrorsIgnorePattern: '^_'
	}],
	'no-shadow': ['error', {
		builtinGlobals: false,
		hoist: 'all',
		allow: ['context', 'require', 'exports']
	}]
};

module.exports = [
	...strict,
	{
		files: ['config/bun/**/*.{js,mjs}'],
		languageOptions: {
			globals: bunGlobals
		},
		rules: bunRules
	}
];
