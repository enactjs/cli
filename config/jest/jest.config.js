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
const fs = require('fs');
const path = require('path');
const {optionParser: app} = require('@enact/dev-utils');

const rbConst = name =>
	'ILIB_' +
	path
		.basename(name)
		.replace(/[-_\s]/g, '_')
		.toUpperCase() +
	'_PATH';

const iLibDirs = ['node_modules/@enact/i18n/ilib', 'node_modules/ilib', 'ilib'];
const globals = {
	__DEV__: true,
	ILIB_BASE_PATH: iLibDirs.find(f => fs.existsSync(path.join(app.context, f))) || iLibDirs[1],
	ILIB_RESOURCES_PATH: 'resources',
	ILIB_CACHE_ID: new Date().getTime() + '',
	[rbConst(app.name)]: 'resources'
};

for (let t = app.theme; t; t = t.theme) {
	const themeRB = path.join(t.path, 'resources');
	globals[rbConst(t.name)] = path.relative(app.context, themeRB).replace(/\\/g, '/');
}

const ignorePatterns = [
	// Common directories to ignore
	'/node_modules/',
	'<rootDir>/(.*/)*coverage/',
	'<rootDir>/(.*/)*build/',
	'<rootDir>/(.*/)*dist/',
	'<rootDir>/(.*/)*docs/',
	'<rootDir>/(.*/)*samples/',
	'<rootDir>/(.*/)*tests/screenshot/',
	'<rootDir>/(.*/)*tests/ui/'
];

// Setup env var to signify a testing environment
process.env.BABEL_ENV = 'test';
process.env.NODE_ENV = 'test';
process.env.PUBLIC_URL = '';
process.env.BROWSERSLIST = 'current node';

// Load applicable .env files into environment variables.
require('../dotenv').load(app.context);

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
		'^react$': require.resolve('react'),
		// Backward compatibility for new iLib location with old Enact
		'^ilib[/](.*)$': path.join(app.context, globals.ILIB_BASE_PATH, '$1'),
		// Backward compatibility for old iLib location with new Enact
		'^@enact[/]i18n[/]ilib[/](.*)$': path.join(app.context, globals.ILIB_BASE_PATH, '$1')
	},
	moduleFileExtensions: ['js', 'jsx', 'json', 'ts', 'tsx'],
	globals
};
