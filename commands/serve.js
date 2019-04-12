/* eslint-env node, es6 */
// @remove-on-eject-begin
/**
 * Portions of this source code file are from create-react-app, used under the
 * following MIT license:
 *
 * Copyright (c) 2013-present, Facebook, Inc.
 * https://github.com/facebook/create-react-app
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// @remove-on-eject-end
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const minimist = require('minimist');
const clearConsole = require('react-dev-utils/clearConsole');
const errorOverlayMiddleware = require('react-dev-utils/errorOverlayMiddleware');
const openBrowser = require('react-dev-utils/openBrowser');
const {choosePort, createCompiler, prepareProxy, prepareUrls} = require('react-dev-utils/WebpackDevServerUtils');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const {optionParser: app} = require('@enact/dev-utils');

// Any unhandled promise rejections should be treated like errors.
process.on('unhandledRejection', err => {
	throw err;
});

// As react-dev-utils assumes the webpack production packaging command is
// "npm run build" with no way to modify it yet, we provide a basic override
// to console.log to ensure the correct output is displayed to the user.
console.log = (log => (data, ...rest) =>
	typeof data === 'undefined'
		? log()
		: typeof data === 'string'
		? log(data.replace(/npm run build/, 'npm run pack-p'), ...rest)
		: log.call(this, data, ...rest))(console.log);

function displayHelp() {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact serve';

	console.log('  Usage');
	console.log(`    ${e} [options]`);
	console.log();
	console.log('  Options');
	console.log('    -b, --browser     Automatically open browser');
	console.log('    -i, --host        Server host IP address');
	console.log('    -p, --port        Server port number');
	console.log('    -m, --meta        JSON to override package.json enact metadata');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
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
	// This is necessary to emit hot updates
	config.plugins.unshift(new webpack.HotModuleReplacementPlugin());
	// Keep webpack alive when there are any errors, so user can fix and rebuild.
	config.bail = false;
	// Ensure the CLI version of Chalk is used for webpackHotDevClient
	// since tslint includes an out-of-date local version.
	config.resolve.alias.chalk = require.resolve('chalk');
	config.resolve.alias['ansi-styles'] = require.resolve('ansi-styles');
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
		before(build) {
			// This lets us open files from the runtime error overlay.
			build.use(errorOverlayMiddleware());
		}
	};
}

function serve(config, host, port, open) {
	// We attempt to use the default port but if it is busy, we offer the user to
	// run on a different port. `detect()` Promise resolves to the next free port.
	return choosePort(host, port).then(resolvedPort => {
		if (resolvedPort == null) {
			// We have not found a port.
			return Promise.reject(new Error('Could not find a free port for the dev-server.'));
		}
		const protocol = process.env.HTTPS === 'true' ? 'https' : 'http';
		const urls = prepareUrls(protocol, host, resolvedPort);
		const devSocket = {
			// eslint-disable-next-line no-use-before-define
			warnings: warnings => devServer.sockWrite(devServer.sockets, 'warnings', warnings),
			// eslint-disable-next-line no-use-before-define
			errors: errors => devServer.sockWrite(devServer.sockets, 'errors', errors)
		};
		// Create a webpack compiler that is configured with custom messages.
		const compiler = createCompiler({
			appName: app.name,
			config,
			devSocket,
			urls,
			useYarn: false,
			useTypeScript: fs.existsSync('tsconfig.json'),
			webpack
		});

		compiler.hooks.afterEmit.tapAsync('EnactCLI', (compilation, callback) => {
			compilation.warnings.forEach(w => {
				if (w.message) {
					// Remove any --fix ESLintinfo messages since the eslint-loader config is
					// internal and eslist is used in an embedded context.
					w.message = w.message.replace(/\n.* potentially fixable with the `--fix` option./gm, '');
				}
			});
			callback();
		});
		// Load proxy config
		const proxySetting = app.proxy;
		const proxyConfig = prepareProxy(proxySetting, './');
		// Serve webpack assets generated by the compiler over a web sever.
		const serverConfig = Object.assign(
			{},
			config.devServer,
			devServerConfig(host, protocol, proxyConfig, urls.lanUrlForConfig, config.output.publicPath)
		);
		const devServer = new WebpackDevServer(compiler, serverConfig);
		// Launch WebpackDevServer.
		devServer.listen(resolvedPort, host, err => {
			if (err) return console.log(err);
			if (process.stdout.isTTY) clearConsole();
			console.log(chalk.cyan('Starting the development server...\n'));
			if (open) {
				openBrowser(urls.localUrlForBrowser);
			}
		});

		['SIGINT', 'SIGTERM'].forEach(sig => {
			process.on(sig, () => {
				devServer.close();
				process.exit();
			});
		});
	});
}

function api(opts) {
	if (opts.meta) {
		let meta;
		try {
			meta = JSON.parse(opts.meta);
		} catch (e) {
			throw new Error('Invalid metadata; must be a valid JSON string.\n' + e.message);
		}
		app.applyEnactMeta(meta);
	}

	// We can disable the typechecker formatter since react-dev-utils includes their
	// own formatter in their dev client.
	process.env.DISABLE_TSFORMATTER = 'true';

	// Use inline styles for serving process.
	process.env.INLINE_STYLES = 'true';

	// Setup the development config with additional webpack-dev-server customizations.
	const configFactory = require('../config/webpack.config');
	const config = hotDevServer(configFactory('development'));

	// Tools like Cloud9 rely on this.
	const host = process.env.HOST || opts.host || config.devServer.host || '0.0.0.0';
	const port = parseInt(process.env.PORT || opts.port || config.devServer.port || 8080);

	// Start serving
	if (['node', 'async-node', 'webworker'].includes(app.environment)) {
		return Promise.reject(new Error('Serving is not supported for non-browser apps.'));
	} else {
		return serve(config, host, port, opts.browser);
	}
}

function cli(args) {
	const opts = minimist(args, {
		string: ['host', 'port', 'meta'],
		boolean: ['browser', 'help'],
		alias: {b: 'browser', i: 'host', p: 'port', m: 'meta', h: 'help'}
	});
	if (opts.help) displayHelp();

	process.chdir(app.context);

	api(opts).catch(err => {
		console.error(chalk.red('ERROR: ') + (err.message || err));
		process.exit(1);
	});
}

module.exports = {api, cli};
if (require.main === module) cli(process.argv.slice(2));
