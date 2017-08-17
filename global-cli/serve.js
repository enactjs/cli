// @remove-on-eject-begin
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */
// @remove-on-eject-end

const
	path = require('path'),
	chalk = require('chalk'),
	webpack = require('webpack'),
	WebpackDevServer = require('webpack-dev-server'),
	minimist = require('minimist'),
	checkRequiredFiles = require('react-dev-utils/checkRequiredFiles'),
	findProjectRoot = require('./modifiers/util/find-project-root'),
	{choosePort, createCompiler, prepareProxy, prepareUrls} = require('react-dev-utils/WebpackDevServerUtils'),
	errorOverlayMiddleware = require('react-error-overlay/middleware'),
	clearConsole = require('react-dev-utils/clearConsole'),
	openBrowser = require('react-dev-utils/openBrowser'),
	devConfig = require('../config/webpack.config.dev');

// Any unhandled promise rejections should be treated like errors.
process.on('unhandledRejection', err => {
	throw err;
});

// As react-dev-utils assumes the webpack production packaging command is
// "npm run build" with no way to modify it yet, we provide a basic override
// to console.log to ensure the correct output is displayed to the user.
console.log = (log => (data, ...rest) =>
	typeof data==='undefined' ? log()
	: (typeof data==='string') ? log(data.replace(/npm run build/, 'npm run pack-p'), ...rest)
	: log.call(this, data, ...rest))(console.log);

function displayHelp() {
	console.log('	Usage');
	console.log('		enact serve [options]');
	console.log();
	console.log('	Options');
	console.log('		-b, --browser		 Automatically open browser');
	console.log('		-i, --host				Server host IP address');
	console.log('		-p, --port				Server port number');
	console.log('		-v, --version		 Display version information');
	console.log('		-h, --help				Display help information');
	console.log();
	process.exit(0);
}

function hotDevServer(config) {
	// Include an alternative client for WebpackDevServer. A client's job is to
	// connect to WebpackDevServer by a socket and get notified about changes.
	// When you save a file, the client will either apply hot updates (in case
	// of CSS changes), or refresh the page (in case of JS changes). When you
	// make a syntax error, this client will display a syntax error overlay.
	// Note: instead of the default WebpackDevServer client, we use a custom one
	// to bring better experience.
	config.entry.main.unshift(require.resolve('react-dev-utils/webpackHotDevClient'));
	// Inject the crash overlay client-side code. This is not part of the dev config by
	// default as it is not isomorphic-friendly.
	config.entry.main.splice(-1, 0, require.resolve('react-error-overlay'));
	// This is necessary to emit hot updates
	config.plugins.push(new webpack.HotModuleReplacementPlugin());
	// Keep webpack alive when there are any errors, so user can fix and rebuild.
	config.bail = false;
	return config;
}

function devServerConfig(host, protocol, proxy, allowedHost, publicPath) {
	return {
		// WebpackDevServer 2.4.3 introduced a security fix that prevents remote
		// websites from potentially accessing local content through DNS rebinding:
		// https://github.com/webpack/webpack-dev-server/issues/887
		// https://medium.com/webpack/webpack-dev-server-middleware-security-issues-1489d950874a
		// However, it made several existing use cases such as development in cloud
		// environment or subdomains in development significantly more complicated:
		// https://github.com/facebookincubator/create-react-app/issues/2271
		// https://github.com/facebookincubator/create-react-app/issues/2233
		// While we're investigating better solutions, for now we will take a
		// compromise. Since our WDS configuration only serves files in the `public`
		// folder we won't consider accessing them a vulnerability. However, if you
		// use the `proxy` feature, it gets more dangerous because it can expose
		// remote code execution vulnerabilities in backends like Django and Rails.
		// So we will disable the host check normally, but enable it if you have
		// specified the `proxy` setting. Finally, we let you override it if you
		// really know what you're doing with a special environment variable.
		disableHostCheck: !proxy || process.env.DANGEROUSLY_DISABLE_HOST_CHECK === 'true',
		// Silence WebpackDevServer's own logs since they're generally not useful.
		// It will still show compile warnings and errors with this setting.
		clientLogLevel: 'none',
		// By default WebpackDevServer serves physical files from current directory
		// in addition to all the virtual build products that it serves from memory.
		contentBase: process.cwd(),
		// By default files from `contentBase` will not trigger a page reload.
		watchContentBase: true,
		// Enable hot reloading server. It will provide /sockjs-node/ endpoint
		// for the WebpackDevServer client so it can learn when the files were
		// updated. The WebpackDevServer client is included as an entry point
		// in the Webpack development configuration. Note that only changes
		// to CSS are currently hot reloaded. JS changes will refresh the browser.
		hot: true,
		// It is important to tell WebpackDevServer to use the same "root" path
		// as we specified in the config. In development, we always serve from /.
		publicPath: publicPath || '/',
		// WebpackDevServer is noisy by default so we emit custom message instead
		// by listening to the compiler events with `compiler.plugin` calls above.
		quiet: true,
		// Reportedly, this avoids CPU overload on some systems.
		// https://github.com/facebookincubator/create-react-app/issues/293
		watchOptions: {
			ignored: /node_modules/
		},
		// Enable HTTPS if the HTTPS environment variable is set to 'true'
		https: protocol === 'https',
		host: host,
		overlay: false,
		// Allow cross-origin HTTP requests
		headers: {
			'Access-Control-Allow-Origin': '*'
		},
		historyApiFallback: {
			// ensure JSON file requests correctly 404 error when not found.
			rewrites: [{from: /.*\.json$/, to: context => context.parsedUrl.pathname}],
			// Paths with dots should still use the history fallback.
			// See https://github.com/facebookincubator/create-react-app/issues/387.
			disableDotRule: true
		},
		public: allowedHost,
		proxy,
		setup(app) {
			// This lets us open files from the runtime error overlay.
			app.use(errorOverlayMiddleware());
		}
	};
}

function serve(config, host, port, open) {
	// We attempt to use the default port but if it is busy, we offer the user to
	// run on a different port. `detect()` Promise resolves to the next free port.
	choosePort(host, port).then(resolvedPort => {
		if (resolvedPort == null) {
			// We have not found a port.
			return;
		}
		const appPkg = require(path.resolve('./package.json'));
		const enact = appPkg.enact || {};
		const protocol = process.env.HTTPS === 'true' ? 'https' : 'http';
		const appName = appPkg.name;
		const urls = prepareUrls(protocol, host, resolvedPort);
		// Create a webpack compiler that is configured with custom messages.
		const compiler = createCompiler(webpack, config, appName, urls);
		// Load proxy config
		const proxySetting = enact.proxy || appPkg.proxy;
		const proxyConfig = prepareProxy(proxySetting, './');
		// Serve webpack assets generated by the compiler over a web sever.
		const serverConfig = devServerConfig(host, protocol, proxyConfig, urls.lanUrlForConfig,
				config.output.publicPath);
		const devServer = new WebpackDevServer(compiler, serverConfig);
		// Launch WebpackDevServer.
		devServer.listen(resolvedPort, host, err => {
			if(err) return console.log(err);
			if(process.stdout.isTTY) clearConsole();
			console.log(chalk.cyan('Starting the development server...\n'));
			if(open) {
				openBrowser(urls.localUrlForBrowser);
			}
		});

		['SIGINT', 'SIGTERM'].forEach(sig => {
			process.on(sig, () => {
				devServer.close();
				process.exit();
			});
		});
	}).catch(err => {
		if(err && err.message) {
			console.log(err.message);
		}
		process.exit(1);
	});
}

module.exports = function(args) {
	const opts = minimist(args, {
		string: ['i', 'host', 'p', 'port'],
		boolean: ['b', 'browser', 'h', 'help'],
		alias: {b:'browser', i:'host', p:'port', h:'help'}
	});
	opts.help && displayHelp();

	process.chdir(findProjectRoot().path);
	process.env.NODE_ENV = 'development';

	const config = hotDevServer(devConfig);

	// Temporary workaround until https://github.com/webpack-contrib/extract-text-webpack-plugin/issues/579 is fixed
	const enact = require(path.resolve('./package.json')).enact || {};
	const autoprefixer = require('autoprefixer');
	const LessPluginRi = require('resolution-independence');
	config.module.rules[4] = {
		test: /\.(c|le)ss$/,
		use: [
			require.resolve('style-loader'),
			{
				loader: require.resolve('css-loader'),
				options: {
					importLoaders: 2,
					modules: true,
					sourceMap: true,
					localIdentName: '[name]__[local]___[hash:base64:5]'
				}
			},
			{
				loader: require.resolve('postcss-loader'),
				options: {
					ident: 'postcss',
					sourceMap: true,
					plugins: () => [
						autoprefixer({browsers:['>1%', 'last 4 versions', 'Firefox ESR', 'not ie < 9'], flexbox:'no-2009'}),
						require('postcss-flexbugs-fixes')
					]
				}
			},
			{
				loader: require.resolve('less-loader'),
				options: {
					sourceMap: true,
					plugins: ((enact.ri) ? [new LessPluginRi(enact.ri)] : [])
				}
			}
		]
	};
	config.plugins.splice(2, 1);

	// Warn and crash if required files are missing
	if (!checkRequiredFiles([config.entry.main[config.entry.main.length-1]])) {
		process.exit(1);
	}

	// Tools like Cloud9 rely on this.
	const host = process.env.HOST || opts.host || config.devServer.host || '0.0.0.0';
	const port = parseInt(process.env.PORT || opts.port || config.devServer.port || 8080);

	serve(config, host, port, opts.browser);
};
