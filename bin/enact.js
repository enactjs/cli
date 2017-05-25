#!/usr/bin/env node

'use strict';

if (process.argv.indexOf('-v') >= 0 || process.argv.indexOf('--version') >= 0) {
	const pkg = require('../package.json');
	console.log(pkg.name);
	console.log('version: ' + pkg.version);
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
		case 'lint':
		case 'license':{
			const task = require('../global-cli/' + command);
			task(process.argv.slice(3));
			break;
		}
		default: {
			const create = require('../global-cli/create');
			create(['--help']);
		}
	}
}
