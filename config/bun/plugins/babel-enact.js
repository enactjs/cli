const path = require('path');
const babel = require('@babel/core');

function createBabelEnactPlugin (options = {}) {
	const babelConfigPath = path.join(__dirname, '..', '..', 'babel.config.js');
	const compact = !!options.production;
	const babelPlugins = [];

	if (options.fastRefresh) {
		babelPlugins.push(require.resolve('react-refresh/babel'));
	}

	return {
		name: 'enact-babel',
		setup (build) {
			build.onLoad({filter: /\.(js|mjs|jsx|ts|tsx)$/}, async args => {
				if (/node_modules/.test(args.path) && !/node_modules[/\\]@enact/.test(args.path)) {
					return undefined;
				}

				const source = await Bun.file(args.path).text();
				const result = await babel.transformAsync(source, {
					filename: args.path,
					configFile: babelConfigPath,
					babelrc: false,
					plugins: babelPlugins,
					sourceMaps: options.sourcemap ? 'inline' : false,
					compact
				});

				let loader = 'js';
				if (/\.tsx?$/.test(args.path)) loader = 'ts';
				if (/\.jsx$/.test(args.path)) loader = 'jsx';

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
