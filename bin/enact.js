#!/usr/bin/env node

'use strict';

require('v8-compile-cache');

const chalk = require('chalk');
const semver = require('semver');
const pkg = require('../package.json');

// Verify the correct version of Node is in use.
if (!semver.satisfies(process.version, pkg.engines.node)) {
	console.log(
		chalk.red(`You are running Node ${process.version}, but @enact/cli requires Node ${pkg.engines.node}.\n`) +
			chalk.bold.red('Please update your version of Node.')
	);
	process.exit(1);
}

// Uncaught error handler
process.on('uncaughtException', err => console.error(chalk.red('ERROR: ') + (err.message || err)));

// Write UTF-8 BOM for Windows PowerShell ISE
if (process.platform === 'win32' && process.title === 'Windows PowerShell ISE') console.log('\ufeff');

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
		case 'serve':
		case 'transpile':
		case 'pack':
		case 'clean':
		case 'test':
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
			console.log('    serve             Development server');
			console.log('    pack              Bundle source code');
			console.log('    test              Test specs runner');
			console.log('    transpile         Transpile to ES5');
			console.log('    template          Manage Enact templates');
			console.log('    license           Detect all used licenses');
			console.log('    lint              Lint source code');
			console.log('    clean             Clean build directory');
			console.log();
			console.log(`  Refer to each command's ${chalk.cyan('--help')} for more details.`);
			console.log();
		}
	}
}
