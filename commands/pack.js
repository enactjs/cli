/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
const path = require('path');
const {filesize} = require('filesize');
const fs = require('fs-extra');
const minimist = require('minimist');
const {optionParser: app} = require('@enact/dev-utils');
const {spawnBunScript} = require('../config/bun/spawn');

let chalk;
let stripAnsi;

function displayHelp () {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact pack';

	console.log('  Usage');
	console.log(`    ${e} [options]`);
	console.log();
	console.log('  Options');
	console.log('    -o, --output      Specify an output directory');
	console.log('    --content-hash    Add a unique hash to output file names based on the content of an asset');
	console.log('    -w, --watch       Rebuild on file changes');
	console.log('    -p, --production  Build in production mode');
	console.log('    -i, --isomorphic  Use isomorphic code layout');
	console.log('                      (includes prerendering)');
	console.log('    -l, --locales     Locales for isomorphic mode; one of:');
	console.log('            <comma-separated-values> Locale list');
	console.log('            <JSON-filepath> - Read locales from JSON file');
	console.log('            "none" - Disable locale-specific handling');
	console.log('            "used" - Detect locales used within ./resources/');
	console.log('            "tv" - Locales supported on webOS TV');
	console.log('            "signage" - Locales supported on webOS signage');
	console.log('            "all" - All locales that iLib supports');
	console.log('    -s, --snapshot    Generate V8 snapshot blob');
	console.log('                      (requires V8_MKSNAPSHOT set)');
	console.log('    -m, --meta        JSON to override package.json enact metadata');
	console.log('    -c, --custom-skin Build with a custom skin');
	console.log('    --no-linting      Build without code linting');
	console.log('    --no-animation    Build without effects such as animation and shadow');
	console.log('    --stats           Output bundle analysis file');
	console.log('    --verbose         Verbose log build details');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function printFileSizes (output) {
	const assets = fs
		.readdirSync(output)
		.filter(name => /\.(js|css|bin)$/.test(name))
		.map(name => {
			const size = fs.statSync(path.join(output, name)).size;
			return {
				folder: path.relative(app.context, output),
				name,
				size,
				sizeLabel: filesize(size)
			};
		});
	assets.sort((a, b) => b.size - a.size);
	const longestSizeLabelLength = Math.max.apply(
		null,
		assets.map(a => stripAnsi(a.sizeLabel).length)
	);
	assets.forEach(asset => {
		let sizeLabel = asset.sizeLabel;
		const sizeLength = stripAnsi(sizeLabel).length;
		if (sizeLength < longestSizeLabelLength) {
			sizeLabel += ' '.repeat(longestSizeLabelLength - sizeLength);
		}
		console.log('	' + sizeLabel + '	' + chalk.dim(asset.folder + path.sep) + chalk.cyan(asset.name));
	});
}

function printErrorDetails (err, handler) {
	console.log();
	console.log(chalk.red('Failed to compile.\n'));
	console.log(err.message || err);
	if (handler) handler();
}

function buildArgs (opts) {
	const args = ['--context', app.context];
	if (opts.production) args.push('--production');
	if (opts.watch) args.push('--watch');
	if (opts.isomorphic) args.push('--isomorphic');
	if (opts.locales) args.push('--locales', opts.locales);
	if (opts.snapshot) args.push('--snapshot');
	if (opts.stats) args.push('--stats');
	if (!opts.animation) args.push('--no-animation');
	if (opts['content-hash']) args.push('--content-hash');
	if (opts.minify === false) args.push('--no-minify');
	if (opts.verbose) args.push('--verbose');
	if (!opts.linting) args.push('--no-linting');
	if (!opts['split-css']) args.push('--no-split-css');
	if (opts['externals-corejs'] || opts['externals-polyfill']) args.push('--externals-polyfill');
	if (opts.externals) args.push('--externals', opts.externals);
	if (opts['externals-public']) args.push('--externals-public', opts['externals-public']);
	if (opts.output) args.push('--output', opts.output);
	if (opts.entry) args.push('--entry', opts.entry);
	if (opts['ilib-additional-path']) args.push('--ilib-additional-path', opts['ilib-additional-path']);
	if (opts['custom-skin']) args.push('--custom-skin');
	if (opts.meta) {
		args.push('--meta', typeof opts.meta === 'string' ? opts.meta : JSON.stringify(opts.meta));
	}
	return args;
}

function api (opts = {}) {
	if (opts.meta) {
		let meta = opts.meta;
		if (typeof meta === 'string') {
			try {
				meta = JSON.parse(opts.meta);
			} catch (e) {
				throw new Error('Invalid metadata; must be a valid JSON string.\n' + e.message);
			}
		}
		app.applyEnactMeta(meta);
	}

	if (opts['custom-skin']) {
		app.applyEnactMeta({template: path.join(__dirname, '..', 'config', 'custom-skin-template.ejs')});
	}

	process.env.FRAMEWORK = opts.framework;

	if (opts.framework) {
		if (process.env.NODE_ENV === 'development' || !opts.production) {
			console.log('Creating a development framework build...');
		} else {
			console.log('Creating an optimized production framework build...');
		}
		const frameworkOutput = path.resolve(opts.output || path.join(app.context, 'dist'));
		return fs.emptyDir(frameworkOutput).then(() =>
			spawnBunScript('build-framework.mjs', buildArgs({...opts, output: frameworkOutput}), {cwd: app.context}).then(() => {
				console.log(chalk.green('Compiled successfully.'));
				console.log();
				printFileSizes(frameworkOutput);
				console.log();
			})
		);
	}

	if (opts.entry || app.entry) {
		opts.entry = opts.entry || app.entry;
	}

	if (opts.snapshot) {
		opts.isomorphic = true;
	}

	const output = path.resolve(opts.output || path.join(app.context, 'dist'));

	if (process.env.NODE_ENV === 'development' || !opts.production) {
		console.log('Creating a development build...');
	} else {
		console.log('Creating an optimized production build...');
	}

	return fs.emptyDir(output).then(() => {
		const build = spawnBunScript('build.mjs', buildArgs({...opts, output}), {cwd: app.context});
		if (opts.watch) {
			return build;
		}
		return build.then(() => {
			console.log(chalk.green('Compiled successfully.'));
			if (!opts.production) {
				console.log(
					chalk.yellow(
						'NOTICE: This build contains debugging functionality and may run slower than in production mode.'
					)
				);
			}
			console.log();
			printFileSizes(output);
			if (opts.stats && fs.existsSync(path.join(output, 'stats.html'))) {
				console.log(chalk.cyan('Bundle analysis written to ') + chalk.underline(path.join(output, 'stats.html')));
			}
			console.log();
		});
	});
}

function cli (args) {
	const opts = minimist(args, {
		boolean: [
			'linting',
			'content-hash',
			'custom-skin',
			'minify',
			'split-css',
			'framework',
			'externals-corejs',
			'externals-polyfill',
			'stats',
			'production',
			'isomorphic',
			'snapshot',
			'animation',
			'verbose',
			'watch',
			'help'
		],
		string: ['externals', 'externals-public', 'locales', 'entry', 'ilib-additional-path', 'output', 'meta'],
		default: {minify: true, 'split-css': true, animation: true, linting: true},
		alias: {
			o: 'output',
			p: 'production',
			i: 'isomorphic',
			l: 'locales',
			s: 'snapshot',
			m: 'meta',
			c: 'custom-skin',
			w: 'watch',
			h: 'help'
		}
	});
	if (opts.help) displayHelp();

	process.chdir(app.context);
	import('chalk').then(({default: _chalk}) => {
		chalk = _chalk;
		import('strip-ansi').then(({default: _stripAnsi}) => {
			stripAnsi = _stripAnsi;
			api(opts).catch(err => {
				printErrorDetails(err, () => {
					process.exit(1);
				});
			});
		});
	});
}

module.exports = {api, cli};
if (require.main === module) cli(process.argv.slice(2));
