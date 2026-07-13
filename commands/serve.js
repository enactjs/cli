/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
const path = require('path');
const minimist = require('minimist');
const {choosePort} = require('react-dev-utils/WebpackDevServerUtils');
const {optionParser: app} = require('@enact/dev-utils');
const {spawnBunScript} = require('../config/bun/spawn');

let chalk;

function displayHelp () {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact serve';

	console.log('  Usage');
	console.log(`    ${e} [options]`);
	console.log();
	console.log('  Options');
	console.log('    -b, --browser     Automatically open browser');
	console.log('    -i, --host        Server host IP address');
	console.log('    -f, --fast        Enables experimental fast refresh');
	console.log('    -p, --port        Server port number');
	console.log('    -m, --meta        JSON to override package.json enact metadata');
	console.log('    --no-linting      Build without code linting');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function api (opts) {
	if (opts.meta) {
		let meta;
		try {
			meta = JSON.parse(opts.meta);
		} catch (e) {
			throw new Error('Invalid metadata; must be a valid JSON string.\n' + e.message);
		}
		app.applyEnactMeta(meta);
	}

	process.env.DISABLE_TSFORMATTER = 'true';
	process.env.INLINE_STYLES = 'true';
	if (opts.fast) process.env.FAST_REFRESH = 'true';

	const host = process.env.HOST || opts.host || '0.0.0.0';
	const port = parseInt(process.env.PORT || opts.port || 8080, 10);

	if (['node', 'async-node', 'webworker'].includes(app.environment)) {
		return Promise.reject(new Error('Serving is not supported for non-browser apps.'));
	}

	return choosePort(host, port).then(resolvedPort => {
		if (resolvedPort == null) {
			return Promise.reject(new Error('Could not find a free port for the dev-server.'));
		}

		const protocol = process.env.HTTPS === 'true' ? 'https' : 'http';
		void protocol;

		console.log(chalk.cyan('Starting the development server...\n'));

		const args = ['--context', app.context, '--host', host, '--port', String(resolvedPort)];
		if (opts.browser) args.push('--browser');
		if (!opts.linting) args.push('--no-linting');
		if (opts.fast) args.push('--fast');

		return spawnBunScript('dev-server.mjs', args, {cwd: app.context});
	});
}

function cli (args) {
	const opts = minimist(args, {
		string: ['host', 'port', 'meta'],
		boolean: ['browser', 'fast', 'help', 'linting'],
		default: {linting: true},
		alias: {b: 'browser', i: 'host', p: 'port', f: 'fast', m: 'meta', h: 'help'}
	});
	if (opts.help) displayHelp();

	process.chdir(app.context);

	import('chalk').then(({default: _chalk}) => {
		chalk = _chalk;
		api(opts).catch(err => {
			console.log(err);
			process.exit(1);
		});
	});
}

module.exports = {api, cli};
if (require.main === module) cli(process.argv.slice(2));
