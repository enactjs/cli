#!/usr/bin/env node

'use strict';

/**
 * https://github.com/zertosh/v8-compile-cache
 * Attaches a require hook to use V8's code cache to speed up instantiation time
 * Load Times: babel-core 218ms without Cache -> 185ms with Cache
 */
require('v8-compile-cache');

/**
 * https://github.com/chalk/chalk
 *
 * Modifiers - bold : chalk.bold.red()
 * Colors - cyan : chalk.cyan()
 * Background colors - chalk.bgBlueBright()
 */
const chalk = require('chalk');

/**
 * https://docs.npmjs.com/misc/semver.html
 *
 * semver.satisfies('1.2.3', '1.x || >=2.5.0 || 5.0.0 - 7.2.3') // true
 */
const semver = require('semver');

const pkg = require('../package.json');

// Verify the correct version of Node is in use.
if (!semver.satisfies(process.version, pkg.engines.node)) {
	console.log(
		chalk.red(`You are running Node ${process.version}, but @enact/cli requires Node ${pkg.engines.node}.\n`) +
			chalk.bold.red('Please update your version of Node.')
	);
	/**
	 * https://nodejs.org/api/process.html#process_process_exit_code
	 *
	 * The exit code.
	 * Default: 0 - The 'success' code
	 */
	process.exit(1); // To exit with a 'failure' code
}

/**
 * https://nodejs.org/api/process.html#process_process_events
 *
 * The process object is an instance of EventEmitter.
 * ```
 * 	process.on('exit', (code) => {
 * 		console.log('Process exit event with code: ', code);
 * 	});
 * ```
 */
// Uncaught error handler
process.on('uncaughtException', err => console.error(chalk.red('ERROR: ') + (err.message || err)));

/**
 * https://nodejs.org/api/process.html#process_process_platform
 *
 * 'win32', 'linux', ...
 */
/**
 * https://nodejs.org/api/process.html#process_process_title
 *
 * the current process title
 */
// Write UTF-8 BOM for Windows PowerShell ISE
if (process.platform === 'win32' && process.title === 'Windows PowerShell ISE') console.log('\ufeff');

/**
 * https://nodejs.org/api/process.html#process_process_argv
 *
 * ```
 * $ node process-args.js one two=three four
 * ```
 *
 * 0: /usr/local/bin/node
 * 1: /Users/mjr/work/node/process-args.js
 * 2: one
 * 3: two=three
 * 4: four
 */
// Handle tasks/arguments
if (process.argv.indexOf('-v') >= 0 || process.argv.indexOf('--version') >= 0) {
	// Enact-CLI ascii art title
	const title = `
    ┌─┐┌┐┌┌─┐┌─┐┌┬┐  ┌─┐┬  ┬    ▐██▄▄    ▄▄██▌
    │  ││││ ││   │   │  │  │    ▐██▀██████▀▀
    ├┤ │││├─┤│   │ ──│  │  │    ▐██▄▄ ▀▀ ▄▄
    │  ││││ ││   │   │  │  │    ▐██▀██████▀
    └─┘┘└┘┴ ┴└─┘ ┴   └─┘┴─┘┴    ▐██▄▄ ▀▀ ▄▄██▌
    ────────────────────────      ▀▀██████▀▀
                                      ▀▀       `;
	// Add colour to the logo
	const colourTitle = title
		.split(/[\n\r]+/g)
		.map(l => {
			const half = (l.length - 31) / 2;
			return (
				l.substring(0, 31) +
				chalk.bgBlueBright(chalk.whiteBright(l.substring(31, 31 + half)) + chalk.white(l.substring(31 + half)))
			);
		})
		.join('\n');
	console.log();
	console.log(colourTitle);
	console.log('    Version ' + pkg.version);
	console.log();
} else {
	const command = process.argv[2];

	switch (command) {
		case 'create':
		case 'link':
		case 'bootstrap':
		case 'serve':
		case 'transpile':
		case 'pack':
		case 'clean':
		case 'info':
		case 'test':
		case 'eject':
		case 'template':
		case 'lint':
		case 'license': {
			const task = require('../commands/' + command).cli;
			task(process.argv.slice(3));
			break;
		}
		default: {
			console.log('  Usage');
			console.log('    enact <command> [...]');
			console.log();
			console.log('  Commands');
			console.log('    create            Create a new project');
			console.log('    link              Link @enact dependencies');
			console.log('    bootstrap         Install and link dependencies');
			console.log('    serve             Development server');
			console.log('    pack              Bundle source code');
			console.log('    test              Test specs runner');
			console.log('    transpile         Transpile to ES5');
			console.log('    template          Manage Enact templates');
			console.log('    license           Detect all used licenses');
			console.log('    lint              Lint source code');
			console.log('    clean             Clean build directory');
			console.log('    eject             Eject to standalone app');
			console.log();
			console.log(`  Refer to each command's ${chalk.cyan('--help')} for more details.`);
			console.log();
		}
	}
}
