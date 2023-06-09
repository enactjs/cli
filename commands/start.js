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
const {spawn} = require('child_process');
const {optionParser: app} = require('@enact/dev-utils');
const resolve = require('resolve');

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
	throw err;
});

function api(args = []) {
	const viteDir = path.dirname(resolve.sync('vite', {basedir: __dirname}));
	const viteBinDir = path.join(viteDir, '../../bin/vite.js');
	const viteArgs = [viteBinDir, app.context, ...args];
	return new Promise((resolves, reject) => {
		const proc = spawn('node', viteArgs);
		//spit stdout to screen
		proc.stdout.on('data', function (data) {
			process.stdout.write(data.toString());
		});

		//spit stderr to screen
		proc.stderr.on('data', function (data) {
			process.stdout.write(data.toString());
		});

		proc.on('close', code => {
			if (code !== 0) {
				reject(new Error('failed with code ' + code));
			} else {
				resolves();
			}
		});
	});
}

function cli(args) {
	process.chdir(app.context);
	api(args).catch(() => {
		process.exit(1);
	});
}

module.exports = {api, cli};
if (require.main === module) cli(process.argv.slice(2));
