/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
/**
 * Experimental esbuild build path for `enact pack`, opt-in via `--esbuild` or
 * ENACT_BUNDLER=esbuild. Kept in its own module so the webpack path in
 * `pack.js` stays untouched — mirrors `esbuild-serve.js`'s split from `serve.js`.
 *
 * Reuses the same `config/esbuild.config` factory the esbuild serve path uses.
 * The webOS-specific build modes now have esbuild counterparts: --isomorphic
 * prerendering (esbuild-isomorphic.js), --snapshot (esbuild-snapshot.js,
 * wired through esbuild-isomorphic.js since --snapshot implies isomorphic),
 * and --framework/--externals (esbuild-framework.js / esbuild-externals.js).
 * Only --isomorphic/--snapshot combined with --watch is not supported, since
 * prerendering is a one-shot build+render pass with no rebuild-and-re-render
 * story yet.
 */
const path = require('path');
const {filesize} = require('filesize');
const fs = require('fs-extra');
const {optionParser: app} = require('@enact/dev-utils');
const viteFw = require('@enact/dev-utils/mixins/vite-framework');
const {writeEsbuildStatsReport} = require('./esbuild-stats');
const {applyEsbuildExternals, jsAssetUrls, markScriptsAsModule} = require('./esbuild-externals');

function copyPublicFolder (output) {
	const staticAssets = './public';
	if (fs.existsSync(staticAssets)) {
		fs.copySync(staticAssets, output, {
			dereference: true
		});
	}
}

// Print a detailed summary of build files (esbuild counterpart to pack.js's
// webpack-stats-based `printFileSizes`, reading esbuild's metafile instead).
function printEsbuildFileSizes (metafile, chalk, stripAnsi) {
	if (!metafile) return;
	const assets = Object.keys(metafile.outputs)
		.filter(name => /\.(js|css|bin)$/.test(name) && !name.endsWith('.map'))
		.map(name => {
			const abs = path.resolve(name);
			const size = fs.statSync(abs).size;
			return {
				folder: path.relative(app.context, path.dirname(abs)),
				name: path.basename(abs),
				size,
				sizeLabel: filesize(size)
			};
		})
		.sort((a, b) => b.size - a.size);
	if (!assets.length) return;
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

// Experimental esbuild build path (core scope: a standard browser bundle for
// `enact pack` / `enact pack -p`, plus `--isomorphic` prerendering — see
// esbuild-isomorphic.js). Mirrors the webpack `build`/`watch` behavior via
// esbuild's JS API, reusing config/esbuild.config (the same factory the
// esbuild serve path uses). `chalk`/`stripAnsi` are passed in (rather than
// dynamically imported here) since `pack.js`'s `cli()` already loads them.
async function esbuildBuild (opts, chalk, stripAnsi) {
	const esbuild = require('esbuild');
	const configFactory = require('../config/esbuild.config');

	// --framework takes precedence over everything else, matching the Vite
	// path's dispatch order in pack.js's `viteBuild`.
	if (opts.framework) {
		const {esbuildFramework} = require('./esbuild-framework');
		return esbuildFramework(opts, chalk, esbuild, configFactory);
	}

	// --snapshot implies --isomorphic (the snapshot embeds the prerendered
	// app), matching webpack's `mixins/index.js` and the Vite path's
	// `viteBuild`.
	if ((opts.isomorphic || opts.snapshot) && !opts.watch) {
		const {esbuildIsomorphicBuild} = require('./esbuild-isomorphic');
		return esbuildIsomorphicBuild(opts, chalk, esbuild, configFactory);
	}

	const unsupported = [];
	if (opts.isomorphic && opts.watch) unsupported.push('isomorphic (with --watch)');
	if (opts.snapshot && opts.watch) unsupported.push('snapshot (with --watch)');
	if (unsupported.length) {
		console.log(
			chalk.yellow(
				`NOTICE: ${unsupported.map(f => '--' + f).join(', ')} ` +
				`${unsupported.length > 1 ? 'are' : 'is'} not yet supported on the esbuild ` +
				'path; building a standard browser bundle.'
			)
		);
	}

	const output = opts.output ? path.resolve(opts.output) : path.resolve('./dist');
	const buildOptions = configFactory(
		opts.production ? 'production' : 'development',
		!opts.linting,
		opts['content-hash'],
		// isomorphic forced off here: either not requested, or requested
		// alongside --watch (not yet supported — see the NOTICE above), so a
		// client render is the correct behavior for this path.
		false,
		!opts.animation,
		!opts['split-css'],
		opts['ilib-additional-path'],
		opts.locales,
		opts.output,
		Boolean(opts.externals && opts['externals-polyfill'])
	);

	// --no-minify: config/esbuild.config.js's `minify` build option is
	// otherwise driven only by NODE_ENV/ENACT_ESBUILD_MINIFY, not this flag.
	// Also strip the separate `enact-terser` plugin, which runs its own
	// minification pass in an onEnd hook when ENACT_ESBUILD_MINIFY=terser is
	// set — that's baked into `plugins` at config-build time, so simply
	// setting `minify: false` above wouldn't stop it on its own.
	if (!opts.minify) {
		buildOptions.minify = false;
		buildOptions.plugins = buildOptions.plugins.filter(p => p.name !== 'enact-terser');
	}

	if (opts.verbose) {
		const {esbuildVerbosePlugin} = require('./esbuild-verbose');
		buildOptions.plugins = buildOptions.plugins.concat([esbuildVerbosePlugin()]);
	}

	// --externals: externalize the shared framework specifiers out of the app
	// build, collecting the ones actually imported so the import map injected
	// into index.html afterward only lists what's really used. Manifest-aware
	// (see esbuild-externals.js): only specifiers the framework build's
	// manifest actually provides are externalized, so an app whose imports
	// the framework doesn't cover still builds — the uncovered pieces stay
	// bundled.
	const collected = new Set();
	let manifest = null;
	if (opts.externals) {
		manifest = viteFw.readManifest(path.resolve(opts.externals));
		applyEsbuildExternals(buildOptions, collected, manifest, {polyfill: opts['externals-polyfill']});
	}

	// Entry override (the esbuild config defaults the entry to the app context).
	if (opts.entry || app.entry) {
		buildOptions.entryPoints = {main: path.resolve(opts.entry || app.entry)};
	}

	// Remove all content but keep the directory so that if you're in it, you
	// don't end up in Trash (matches the webpack path).
	await fs.emptyDir(output);

	if (opts.watch) {
		const ctx = await esbuild.context(buildOptions);
		await ctx.watch();
		copyPublicFolder(output);
		console.log(
			opts.production ?
				'Creating an optimized production build and watching for changes...' :
				'Creating a development build and watching for changes...'
		);
		['SIGINT', 'SIGTERM'].forEach(sig =>
			process.on(sig, async () => {
				await ctx.dispose();
				process.exit();
			})
		);
		return;
	}

	console.log(opts.production ? 'Creating an optimized production build...' : 'Creating a development build...');
	// esbuild.build rejects on build errors; the cli() catch formats them.
	const result = await esbuild.build(buildOptions);
	copyPublicFolder(output);

	// --externals post-step: resolve the collected specifiers against the
	// framework's manifest and inject the import map + shared stylesheet into
	// the built index.html (matches the Vite path's `viteBuild`).
	if (opts.externals) {
		let base = opts['externals-public'];
		if (!base) {
			fs.copySync(path.resolve(opts.externals), path.join(output, 'framework'), {dereference: true});
			base = './framework';
		}
		const indexHtmlPath = path.join(output, 'index.html');
		markScriptsAsModule(indexHtmlPath, jsAssetUrls(result.metafile, output, buildOptions.publicPath));
		const n = viteFw.injectHtml(indexHtmlPath, manifest, collected, base);
		console.log(chalk.cyan(`Externalized ${n} framework specifiers via import map (base: ${base}).`));
	}

	if (result.warnings && result.warnings.length) {
		console.log(chalk.yellow('Compiled with warnings:\n'));
		result.warnings.forEach(w => console.log('  ' + (w.text || '')));
		console.log();
	} else {
		console.log(chalk.green('Compiled successfully.'));
	}
	console.log();
	printEsbuildFileSizes(result.metafile, chalk, stripAnsi);
	console.log();

	if (opts.stats) {
		const reportPath = writeEsbuildStatsReport(result.metafile, output, app.context);
		if (reportPath) {
			console.log(chalk.dim(`Bundle stats written to ${path.relative(app.context, reportPath)}`));
			console.log();
		}
	}
}

module.exports = {esbuildBuild};