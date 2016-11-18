#!/usr/bin/env node

'use strict';

if(process.argv.indexOf('-v')>=0 || process.argv.indexOf('--version')>=0) {
	var pkg = require('../package.json');
	console.log(pkg.name);
	console.log('version: ' + pkg.version);
	console.log();
} else {
	var command = process.argv[2];

	switch(command) {
		case 'init':
			var chalk = require('chalk');
			console.log(chalk.gray('Warning: \'enact init\' is depreciated.'
				+ ' Please use \'enact create\''));
			command = 'create';
		case 'create':
		case 'serve':
		case 'transpile':
		case 'pack':
		case 'clean':
		case 'test':
		case 'lint':
			var task = require('../global-cli/' + command);
			task(process.argv.slice(3));
			break;
		default:
			var create = require('../global-cli/create');
			create(['--help']);
	}
}
