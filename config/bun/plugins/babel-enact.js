const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

function getPackageVersion (name) {
	try {
		return require(`${name}/package.json`).version;
	} catch (_e) {
		return '0';
	}
}

function createBabelEnactPlugin (options = {}) {
	const babelConfigPath = path.join(__dirname, '..', '..', 'babel.config.js');
	const compact = !!options.production;
	const babelPlugins = [];

	if (options.fastRefresh) {
		babelPlugins.push(require.resolve('react-refresh/babel'));
	}

	// Persistent transform cache (parity with babel-loader's cacheDirectory).
	// Content-addressed: any change to the source, mode flags, or toolchain
	// versions produces a new key, so stale entries are never served.
	const context = path.resolve(options.context || process.cwd());
	const cacheDir = path.join(context, 'node_modules', '.cache', 'enact-bun', 'babel');
	const cacheKeyPrefix = [
		getPackageVersion('@babel/core'),
		getPackageVersion('babel-preset-enact'),
		options.production ? 'prod' : 'dev',
		options.fastRefresh ? 'fr' : '',
		options.sourcemap ? 'sm' : ''
	].join('|');
	let cacheDirReady = false;

	const ensureCacheDir = () => {
		if (!cacheDirReady) {
			fs.mkdirSync(cacheDir, {recursive: true});
			cacheDirReady = true;
		}
	};

	return {
		name: 'enact-babel',
		setup (build) {
			build.onLoad({filter: /\.(js|mjs|jsx|ts|tsx)$/}, async args => {
				if (/node_modules/.test(args.path) && !/node_modules[/\\]@enact/.test(args.path)) {
					return undefined;
				}

				const source = await Bun.file(args.path).text();

				let loader = 'js';
				if (/\.tsx?$/.test(args.path)) loader = 'ts';
				if (/\.jsx$/.test(args.path)) loader = 'jsx';

				const hash = crypto
					.createHash('sha256')
					.update(cacheKeyPrefix)
					.update('\0')
					.update(args.path)
					.update('\0')
					.update(source)
					.digest('hex');
				const cacheFile = path.join(cacheDir, `${hash}.js`);

				try {
					const cached = await fs.promises.readFile(cacheFile, 'utf8');
					return {
						loader,
						contents: cached,
						resolveDir: path.dirname(args.path)
					};
				} catch (_e) {
					// cache miss
				}

				const result = await babel.transformAsync(source, {
					filename: args.path,
					configFile: babelConfigPath,
					babelrc: false,
					plugins: babelPlugins,
					sourceMaps: options.sourcemap ? 'inline' : false,
					compact
				});

				ensureCacheDir();
				try {
					await fs.promises.writeFile(cacheFile, result.code, 'utf8');
				} catch (_e) {
					// caching is best-effort; never fail the build over it
				}

				return {
					loader,
					contents: result.code,
					resolveDir: path.dirname(args.path)
				};
			});
		}
	};
}

module.exports = {createBabelEnactPlugin};
