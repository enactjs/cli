var
	minimist = require('minimist'),
	checker = require('license-checker'),
	path = require('path');

function displayHelp() {
	console.log('  Usage');
	console.log('    enact license [options] [<module>]');
	console.log();
	console.log('  Arguments');
	console.log('    module            Optional module path');
	console.log('                          (default: <current directory>');
	console.log();
	console.log('  Options');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

// The following modules reside in `enact-dev` but end up in production builds of apps
const enactDevProdModules = [
	'babel-core',
	'string.fromcodepoint',
	'string.prototype.codepointat',
	'whatwg-fetch',
	'object-assign',
	'promise'
];

let output = {};

module.exports = function(args) {
	const opts = minimist(args, {
		boolean: ['h', 'help'],
		alias: {h:'help'}
	});

	opts.help && displayHelp();

	let modules = [];

	if (opts._.length) {
		modules = modules.concat(opts._);
	} else {
		modules = [...resolveModulePath(enactDevProdModules), '.'];
	}

	modules.forEach(package => {
		checker.init({
			start: package
		}, function(err, json) {
			if (err) {
				console.warn(`Unable to process licenses for ${path}: `, err);
			} else {
				output = Object.assign(output, json);
			}
		});
	});
};

process.on('exit', () => {
	if (Object.keys(output).length) {
		console.log(output);
	}
});

// Resolve module directories relative to `enact-dev`
function resolveModulePath(modules) {
	return modules.map(mod => path.dirname(require.resolve(mod)));
}
