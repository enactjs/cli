import path from 'path';
import {fileURLToPath} from 'url';
import {createRequire} from 'module';
import {createBuildOptions} from './build-options.js';
import {writeIndexHtml} from './generate-html.js';
import {createEnactPlugins} from './plugins/index.js';
import {getIsomorphicExternals} from './plugins/isomorphic-enact.js';

const nodeRequire = createRequire(import.meta.url);

function parseArgs (argv) {
	const opts = {
		production: false,
		watch: false,
		output: null,
		entry: null,
		isomorphic: false,
		noAnimation: false,
		contentHash: false,
		minify: true,
		ilibAdditionalResourcesPath: null,
		locales: null,
		snapshot: false,
		stats: false,
		verbose: false,
		externals: null,
		externalsPublic: null,
		customSkin: false,
		linting: true,
		splitCss: true,
		externalsPolyfill: false,
		prerenderOnly: false
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--production' || arg === '-p') opts.production = true;
		else if (arg === '--watch' || arg === '-w') opts.watch = true;
		else if (arg === '--isomorphic' || arg === '-i') opts.isomorphic = true;
		else if (arg === '--no-animation') opts.noAnimation = true;
		else if (arg === '--content-hash') opts.contentHash = true;
		else if (arg === '--no-minify') opts.minify = false;
		else if (arg === '--snapshot' || arg === '-s') opts.snapshot = true;
		else if (arg === '--verbose') opts.verbose = true;
		else if (arg === '--no-linting') opts.linting = false;
		else if (arg === '--no-split-css') opts.splitCss = false;
		else if (arg === '--externals-polyfill') opts.externalsPolyfill = true;
		else if (arg === '--output' || arg === '-o') opts.output = argv[++i];
		else if (arg === '--entry') opts.entry = argv[++i];
		else if (arg === '--ilib-additional-path') opts.ilibAdditionalResourcesPath = argv[++i];
		else if (arg === '--locales' || arg === '-l') opts.locales = argv[++i];
		else if (arg === '--stats') opts.stats = true;
		else if (arg === '--externals') opts.externals = argv[++i];
		else if (arg === '--externals-public') opts.externalsPublic = argv[++i];
		else if (arg === '--custom-skin') opts.customSkin = true;
		else if (arg === '--prerender-only') opts.prerenderOnly = true;
		else if (arg === '--context') opts.context = argv[++i];
	}
	return opts;
}

function normalizePath (filePath) {
	return filePath.replace(/\\/g, '/');
}

function getOutputNaming (buildOpts) {
	if (buildOpts.contentHash) {
		return 'main.[hash].[ext]';
	}
	if (!buildOpts.splitCss) {
		return 'main.[ext]';
	}
	return buildOpts.isomorphic ? 'main.[ext]' : '[name].[ext]';
}

function getIsomorphicExternalsList () {
	return getIsomorphicExternals();
}

function createBuildConfig (buildOpts, options, plugins) {
	const config = {
		entrypoints: [normalizePath(options.entryFile)],
		outdir: normalizePath(options.outputPath),
		target: 'browser',
		format: buildOpts.isomorphic ? 'cjs' : 'esm',
		naming: getOutputNaming(buildOpts),
		minify: options.minify,
		sourcemap: options.sourcemap ? 'linked' : 'none',
		define: options.defines,
		publicPath: options.publicPath || '/',
		plugins,
		alias: options.aliases,
		metafile: !!buildOpts.stats
	};

	if (buildOpts.isomorphic && !buildOpts.externals) {
		config.external = getIsomorphicExternalsList();
	}

	if (buildOpts.verbose) {
		console.log('Bun build configuration:');
		console.log(`  entry: ${config.entrypoints[0]}`);
		console.log(`  outdir: ${config.outdir}`);
		console.log(`  format: ${config.format}`);
		console.log(`  naming: ${config.naming}`);
		console.log(`  minify: ${config.minify}`);
		console.log(`  sourcemap: ${config.sourcemap}`);
		console.log(`  publicPath: ${config.publicPath}`);
		if (buildOpts.externals) {
			console.log(`  externals: ${buildOpts.externals}`);
			if (buildOpts.externalsPublic) {
				console.log(`  externals-public: ${buildOpts.externalsPublic}`);
			}
		}
	}

	return config;
}

function getExternalHtmlAssets (buildOpts) {
	if (!buildOpts.externals) return null;
	const {getExternalAssets} = nodeRequire('./externals.js');
	return getExternalAssets(buildOpts.externals, buildOpts.externalsPublic);
}

function getStartupAssets (publicPath, jsName, buildOpts) {
	const normalize = asset => asset.replace(/\/{2,}/g, '/');
	const assets = [];

	if (buildOpts.externals) {
		const externalAssets = getExternalHtmlAssets(buildOpts);
		if (externalAssets?.scripts) {
			for (const script of externalAssets.scripts) {
				assets.push(normalize(script));
			}
		}
	} else if (buildOpts.isomorphic) {
		assets.push(normalize(`${publicPath}react-globals.js`));
	}

	assets.push(normalize(`${publicPath}${jsName}`));
	return assets;
}

function getPrerenderPayload (options, buildOpts, jsName) {
	const app = nodeRequire('@enact/dev-utils/option-parser');
	return {
		context: options.context,
		output: options.outputPath,
		chunk: jsName,
		locales: buildOpts.locales || 'en-US',
		publicPath: options.publicPath,
		screenTypes: app.screenTypes,
		deep: app.deep,
		fontGenerator: app.fontGenerator,
		externalStartup: app.externalStartup,
		externals: buildOpts.externals,
		startupAssets: getStartupAssets(options.publicPath, jsName, buildOpts)
	};
}

function runIsomorphicPrerender (options, buildOpts, jsName) {
	nodeRequire('./run-prerender-in-node.cjs').runPrerenderInNode(
		getPrerenderPayload(options, buildOpts, jsName)
	);
}

async function buildReactGlobals (options, _buildOpts) {
	const globalsEntry = path.join(path.dirname(fileURLToPath(import.meta.url)), 'react-globals-entry.js');
	const result = await Bun.build({
		entrypoints: [globalsEntry],
		outdir: options.outputPath,
		target: 'browser',
		format: 'iife',
		globalName: 'EnactReactGlobals',
		naming: 'react-globals.[ext]',
		minify: options.minify,
		sourcemap: false,
		define: options.defines,
		alias: options.aliases
	});
	if (!result.success) {
		for (const log of result.logs) console.error(log);
		throw new Error('Failed to build React globals for isomorphic mode.');
	}
}

function finalizeBuild (result, buildOpts, options) {
	if (!result.success) {
		for (const log of result.logs) console.error(log);
		return null;
	}

	const jsOutput = result.outputs.find(o => o.path.endsWith('.js'));
	const cssOutput = result.outputs.find(o => o.path.endsWith('.css'));
	const jsName = jsOutput ? path.basename(jsOutput.path) : (buildOpts.isomorphic ? 'main.js' : 'entry.js');
	const cssName = cssOutput ? path.basename(cssOutput.path) : null;
	const externalAssets = getExternalHtmlAssets(buildOpts);

	if (buildOpts.verbose) {
		console.log('Build outputs:');
		for (const output of result.outputs) {
			console.log(`  ${path.basename(output.path)} (${output.kind}, ${output.size} bytes)`);
		}
	}

	writeIndexHtml(options.outputPath, {
		title: options.title,
		context: options.context,
		publicPath: options.publicPath,
		scriptSrc: `${options.publicPath}${jsName}`.replace(/\/{2,}/g, '/'),
		cssHref: cssName ? `${options.publicPath}${cssName}`.replace(/\/{2,}/g, '/') : null,
		isomorphic: buildOpts.isomorphic,
		customSkin: options.customSkin,
		externalScripts: externalAssets?.scripts,
		externalStyles: externalAssets?.styles
	});

	nodeRequire('./post-build.js').applyPostBuild(options.context, options.outputPath, {
		publicPath: options.publicPath,
		ilibAdditionalResourcesPath: options.ilibAdditionalResourcesPath,
		customSkin: options.customSkin,
		watch: buildOpts.watch
	});

	if (buildOpts.isomorphic) {
		runIsomorphicPrerender(options, buildOpts, jsName);
	}

	let v8SnapshotFile;
	if (buildOpts.snapshot) {
		if (buildOpts.externals) {
			const {getFrameworkPublicPath} = nodeRequire('./externals.js');
			const frameworkPublicPath = getFrameworkPublicPath(buildOpts.externals, buildOpts.externalsPublic);
			if (frameworkPublicPath) {
				v8SnapshotFile = `${frameworkPublicPath}/snapshot_blob.bin`.replace(/\/{2,}/g, '/');
			}
		} else {
			nodeRequire('./snapshot.js').applySnapshot({
				output: options.outputPath,
				target: jsName
			});
			v8SnapshotFile = 'snapshot_blob.bin';
		}
	}

	if (v8SnapshotFile) {
		nodeRequire('./webos-meta.js').applyWebOSMeta(options.context, options.outputPath, {
			v8SnapshotFile
		});
	}

	if (buildOpts.stats) {
		nodeRequire('./generate-stats.js').writeStatsReport(options.outputPath, result.metafile);
	}

	return {jsName, cssName};
}

function logBuildResult (buildOpts, options, info) {
	console.log(JSON.stringify({
		success: true,
		output: options.outputPath,
		js: info.jsName,
		css: info.cssName,
		stats: !!buildOpts.stats,
		watch: !!buildOpts.watch,
		contentHash: !!buildOpts.contentHash,
		externals: !!buildOpts.externals
	}));
}

async function runPrerenderOnly (buildOpts) {
	buildOpts.isomorphic = true;
	const options = createBuildOptions(buildOpts);
	const jsName = buildOpts.chunk || 'main.js';
	runIsomorphicPrerender(options, buildOpts, jsName);
	console.log(JSON.stringify({success: true, prerenderOnly: true, locales: buildOpts.locales}));
}

async function runBuild (buildOpts) {
	if (buildOpts.snapshot) {
		buildOpts.isomorphic = true;
	}

	if (buildOpts.prerenderOnly) {
		return runPrerenderOnly(buildOpts);
	}

	const options = createBuildOptions(buildOpts);
	const polyfillPath = options.externalsPolyfill
		? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'polyfills.js')
		: null;
	const plugins = createEnactPlugins({
		production: buildOpts.production,
		sourcemap: options.sourcemap,
		context: options.context,
		additionalModulePaths: options.additionalModulePaths,
		accent: options.accent,
		forceCSSModules: options.forceCSSModules,
		useTailwind: options.useTailwind,
		ri: options.ri,
		aliases: options.aliases,
		isomorphic: buildOpts.isomorphic,
		snapshot: options.snapshot,
		linting: options.linting,
		useExternals: !!buildOpts.externals,
		externalsOptions: buildOpts.externals
			? {
				polyfill: polyfillPath,
				context: options.context,
				local: nodeRequire('./plugins/externals-enact').shouldEnableLocalExternals(options.context)
			}
			: undefined
	});
	const buildConfig = createBuildConfig(buildOpts, options, plugins);

	if (buildOpts.isomorphic && !buildOpts.externals) {
		await buildReactGlobals(options, buildOpts);
	}

	if (buildOpts.watch) {
		console.log('Watching for file changes...');

		const watchResult = await Bun.build({
			...buildConfig,
			watch: {
				onRebuild (error, rebuildResult) {
					if (error) {
						console.error('Rebuild failed:', error);
						return;
					}
					const rebuildInfo = finalizeBuild(rebuildResult, buildOpts, options);
					if (rebuildInfo) {
						console.log('Recompiled successfully.');
						logBuildResult(buildOpts, options, rebuildInfo);
					}
				}
			}
		});

		const watchInfo = finalizeBuild(watchResult, buildOpts, options);
		if (!watchInfo) process.exit(1);
		logBuildResult(buildOpts, options, watchInfo);

		await new Promise(() => {});
		return;
	}

	const result = await Bun.build(buildConfig);
	const info = finalizeBuild(result, buildOpts, options);
	if (!info) process.exit(1);
	logBuildResult(buildOpts, options, info);
}

const cliOpts = parseArgs(process.argv.slice(2));

runBuild(cliOpts).catch(err => {
	console.error(err);
	process.exit(1);
});
