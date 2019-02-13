// @remove-file-on-eject
/**
 * Portions of this source code file are from create-react-app, used under the
 * following MIT license:
 *
 * Copyright (c) 2015-present, Facebook, Inc.
 * https://github.com/facebook/create-react-app
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
const path = require('path');
const {packageRoot} = require('@enact/dev-utils');

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'test';
process.env.NODE_ENV = 'test';
process.env.PUBLIC_URL = '';
process.env.BROWSERSLIST = 'current node';

const pkg = packageRoot();
const globals = {
	__DEV__: true,
	ILIB_BASE_PATH: 'node_modules/@enact/i18n/ilib',
	ILIB_RESOURCES_PATH: 'resources',
	ILIB_CACHE_ID: new Date().getTime() + '',
	ILIB_MOONSTONE_PATH: 'node_modules/@enact/moonstone/resources'
};

if (pkg.meta.name === '@enact/moonstone') {
	globals.ILIB_MOONSTONE_PATH = 'resources';
	globals.ILIB_RESOURCES_PATH = '_resources_';
} else if (pkg.meta.name === '@enact/i18n') {
	globals.ILIB_BASE_PATH = 'ilib';
}

const ignorePatterns = [
	// Common directories to ignore
	'/node_modules/',
	'<rootDir>/(.*/)*coverage/',
	'<rootDir>/(.*/)*build/',
	'<rootDir>/(.*/)*dist/'
];

module.exports = {
	collectCoverageFrom: ['**/*.{js,jsx,ts,tsx}', '!**/*.d.ts'],
	coveragePathIgnorePatterns: ignorePatterns,
	setupFiles: [require.resolve('../polyfills')],
	setupFilesAfterEnv: [require.resolve('./setupTests')],
	testMatch: [
		'<rootDir>/**/__tests__/**/*.{js,jsx,ts,tsx}',
		'<rootDir>/**/?(*.)(spec|test).{js,jsx,ts,tsx}',
		'<rootDir>/**/*-specs.{js,jsx,ts,tsx}'
	],
	testPathIgnorePatterns: ignorePatterns,
	testEnvironment: 'jsdom',
	testEnvironmentOptions: {pretendToBeVisual: true},
	testURL: 'http://localhost',
	transform: {
		'^.+\\.(js|jsx|ts|tsx)$': require.resolve('./babelTransform'),
		'^.+\\.css$': require.resolve('./cssTransform.js'),
		'^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': require.resolve('./fileTransform')
	},
	transformIgnorePatterns: [
		'[/\\\\]node_modules[/\\\\](?!@enact).+\\.(js|jsx|ts|tsx)$',
		'^.+\\.module\\.(css|less)$'
	],
	moduleNameMapper: {
		'^.+\\.module\\.(css|less)$': require.resolve('identity-obj-proxy'),
		'^enzyme$': require.resolve('enzyme'),
		'^ilib$': path.join(pkg.path, globals.ILIB_BASE_PATH, 'lib', 'ilib.js'),
		'^ilib[/\\\\](.*)$': path.join(pkg.path, globals.ILIB_BASE_PATH, 'lib', '$1')
	},
	moduleFileExtensions: ['js', 'jsx', 'json', 'ts', 'tsx'],
	globals
};
