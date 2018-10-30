// @remove-file-on-eject
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

module.exports = {
	// TODO: I don't know if it's safe or not to just use / as path separator
	// in Jest configs. We need help from somebody with Windows to determine this.
	collectCoverageFrom: ['src/**/*.{js,jsx,ts,tsx}', '!src/**/*.d.ts'],
	setupFiles: [
		require.resolve('@babel/polyfill/dist/polyfill'),
		require.resolve('dirty-chai'),
		require.resolve('mocha-react-proptype-checker')
	],
	setupTestFrameworkScriptFile: require.resolve('./setupTests'),
	testMatch: ['<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}', '<rootDir>/src/**/?(*.)(spec|test).{js,jsx,ts,tsx}'],
	testEnvironment: 'jsdom',
	testURL: 'http://localhost',
	transform: {
		'^.+\\.(js|jsx|ts|tsx)$': require.resolve('./babelTransform'),
		'^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': require.resolve('./fileTransform')
	},
	transformIgnorePatterns: ['[/\\\\]node_modules[/\\\\].+\\.(js|jsx|ts|tsx)$'],
	moduleNameMapper: {
		'^.+\\.(css|less)$': 'identity-obj-proxy'
	},
	moduleFileExtensions: ['js', 'jsx', 'json', 'ts', 'tsx']
};
