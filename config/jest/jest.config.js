// @remove-file-on-eject
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'test';
process.env.NODE_ENV = 'test';
process.env.PUBLIC_URL = '';
process.env.BROWSERSLIST = 'current node';

module.exports = {
	collectCoverageFrom: ['src/**/*.{js,jsx,ts,tsx}', '!src/**/*.d.ts'],
	setupFiles: [require.resolve('../polyfills'), require.resolve('dirty-chai')],
	setupTestFrameworkScriptFile: require.resolve('./setupTests'),
	testMatch: ['<rootDir>/!(node_modules|dist|build)/**/*-specs.{js,jsx,ts,tsx}'],
	testEnvironment: 'jsdom',
	testURL: 'http://localhost',
	transform: {
		'^.+\\.(js|jsx|ts|tsx)$': require.resolve('./babelTransform'),
		'^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': require.resolve('./fileTransform')
	},
	transformIgnorePatterns: ['[/\\\\]node_modules[/\\\\].+\\.(js|jsx|ts|tsx)$'],
	moduleNameMapper: {
		'^.+\\.(css|less)$': 'identity-obj-proxy',
		'^enzyme$': require.resolve('enzyme'),
		'^sinon$': require.resolve('sinon')
	},
	moduleFileExtensions: ['js', 'jsx', 'json', 'ts', 'tsx']
};
