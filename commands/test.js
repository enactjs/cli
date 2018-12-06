/* eslint-env node, es6 */
// @remove-on-eject-begin
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
// @remove-on-eject-end
const path = require('path');
const {execSync} = require('child_process');
const {packageRoot} = require('@enact/dev-utils');
const chalk = require('chalk');
const jest = require('jest');
const resolve = require('resolve');

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
	throw err;
});

function isInGitRepository() {
	try {
		execSync('git rev-parse --is-inside-work-tree', {stdio: 'ignore'});
		return true;
	} catch (e) {
		return false;
	}
}

function isInMercurialRepository() {
	try {
		execSync('hg --cwd . root', {stdio: 'ignore'});
		return true;
	} catch (e) {
		return false;
	}
}

// This is a very dirty workaround for https://github.com/facebook/jest/issues/5913.
// We're trying to resolve the environment ourselves because Jest does it incorrectly.
function resolveJestDefaultEnvironment(name) {
	const jestDir = path.dirname(resolve.sync('jest', {basedir: __dirname}));
	const jestCLIDir = path.dirname(resolve.sync('jest-cli', {basedir: jestDir}));
	const jestConfigDir = path.dirname(resolve.sync('jest-config', {basedir: jestCLIDir}));
	return resolve.sync(name, {basedir: jestConfigDir});
}

function testEnvironment(args) {
	const env = (
		args.reverse().find((curr, i, a) => curr.startsWith('--env=') || a[i + 1] === '--env') || 'jsdom'
	).replace(/^--env=/, '');
	args.reverse();
	let resolvedEnv;
	try {
		resolvedEnv = resolveJestDefaultEnvironment(`jest-environment-${env}`);
	} catch (e) {
		// ignore
	}
	if (!resolvedEnv) {
		try {
			resolvedEnv = resolveJestDefaultEnvironment(env);
		} catch (e) {
			// ignore
		}
	}
	return resolvedEnv || env;
}

function assignOverrides(config) {
	const {meta} = packageRoot();
	const overrides = Object.assign({}, meta.jest);
	const supportedKeys = [
		'collectCoverageFrom',
		'coverageReporters',
		'coverageThreshold',
		'globalSetup',
		'globalTeardown',
		'resetMocks',
		'resetModules',
		'snapshotSerializers',
		'watchPathIgnorePatterns'
	];
	if (overrides) {
		supportedKeys.forEach(key => {
			if (overrides.hasOwnProperty(key)) {
				config[key] = overrides[key];
				delete overrides[key];
			}
		});
		const unsupportedKeys = Object.keys(overrides);
		if (unsupportedKeys.length) {
			const isOverridingSetupFile = unsupportedKeys.includes('setupTestFrameworkScriptFile');

			if (isOverridingSetupFile) {
				console.error(
					chalk.red(
						'We detected ' +
							chalk.bold('setupTestFrameworkScriptFile') +
							' in your package.json.\n\n' +
							'Remove it from Jest configuration, and put the initialization code in ' +
							chalk.bold('src/setupTests.js') +
							'.\nThis file will be loaded automatically.\n'
					)
				);
			} else {
				console.error(
					chalk.red(
						'\nOut of the box, Enact CLI only supports overriding ' +
							'these Jest options:\n\n' +
							supportedKeys.map(key => chalk.bold('	\u2022 ' + key)).join('\n') +
							'.\n\n' +
							'These options in your package.json Jest configuration ' +
							'are not currently supported by Enact CLI:\n\n' +
							unsupportedKeys.map(key => chalk.bold('	\u2022 ' + key)).join('\n') +
							'\n\nIf you wish to override other Jest options, you need to ' +
							'eject from the default setup. You can do so by running ' +
							chalk.bold('npm run eject') +
							' but remember that this is a one-way operation. ' +
							'You may also file an issue with Enact CLI to discuss ' +
							'supporting more options out of the box.\n'
					)
				);
			}
			process.exit(1);
		}
	}
}

function api(args = []) {
	const config = require('../config/jest/jest.config');

	// @TODO: readd dotenv parse support

	// Watch unless on CI, in coverage mode, or explicitly running all tests
	const wIndex = args.indexOf('--watch');
	if (wIndex > -1 && !process.env.CI && !args.includes('--coverage') && !args.includes('--watchAll')) {
		// https://github.com/facebook/create-react-app/issues/5210
		const hasSourceControl = isInGitRepository() || isInMercurialRepository();
		args[wIndex] = hasSourceControl ? '--watch' : '--watchAll';
	}

	// Apply safe override options from package.json
	assignOverrides(config);

	args.push('--config', JSON.stringify(config));
	args.push('--env', testEnvironment(args));

	return jest.run(args);
}

function cli(args) {
	api(args).catch(() => {
		process.exit(1);
	});
}

module.exports = {api, cli};
if (require.main === module) cli(process.argv.slice(2));
