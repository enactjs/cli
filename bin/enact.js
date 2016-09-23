#!/usr/bin/env node

'use strict';

var command = process.argv[2];

switch(command) {
	case 'init':
	case 'serve':
	case 'transpile':
	case 'pack':
	case 'clean':
	case 'test':
	case 'lint':
		var task = require('../global-cli/' + command);
		task(process.argv.slice(3));
		break;
	case '-v':
	case '--version':
		var pkg = require('../package.json');
		console.log(pkg.name);
		console.log('version: ' + pkg.version);
		break;
	default:
		console.error('Usage: enact init [directory]');
}
