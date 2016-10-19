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

var
	path = require('path'),
	os = require('os'),
	chalk = require('chalk'),
	webpack = require('webpack'),
	WebpackDevServer = require('webpack-dev-server'),
	historyApiFallback = require('connect-history-api-fallback'),
	httpProxyMiddleware = require('http-proxy-middleware'),
	detect = require('detect-port'),
	minimist = require('minimist'),
	checkRequiredFiles = require('react-dev-utils/checkRequiredFiles'),
	formatWebpackMessages = require('react-dev-utils/formatWebpackMessages'),
	openBrowser = require('react-dev-utils/openBrowser'),
	prompt = require('react-dev-utils/prompt'),
	config = require('../config/webpack.config.dev');
var compiler;

// Include an alternative client for WebpackDevServer. A client's job is to
// connect to WebpackDevServer by a socket and get notified about changes.
// When you save a file, the client will either apply hot updates (in case
// of CSS changes), or refresh the page (in case of JS changes). When you
// make a syntax error, this client will display a syntax error overlay.
// Note: instead of the default WebpackDevServer client, we use a custom one
// to bring better experience.
config.entry.main.unshift(require.resolve('react-dev-utils/webpackHotDevClient'));
// This is necessary to emit hot updates
config.plugins.push(new webpack.HotModuleReplacementPlugin());

var isFirstClear = true;
function clearConsole() {
	// On first run, clear completely so it doesn't show half screen on Windows.
	// On next runs, use a different sequence that properly scrolls back.
	process.stdout.write(isFirstClear ? '\x1bc' : (os.platform()==='linux' ? '\x1b[2J\x1b[0;0f' : '\x1b[2J\x1b[0f'));
	isFirstClear = false;
}

function setupCompiler(host, port, protocol) {
	// "Compiler" is a low-level interface to Webpack.
	// It lets us listen to some events and provide our own custom messages.
	compiler = webpack(config);

	// "invalid" event fires when you have changed a file, and Webpack is
	// recompiling a bundle. WebpackDevServer takes care to pause serving the
	// bundle, so if you refresh, it'll wait instead of serving the old one.
	// "invalid" is short for "bundle invalidated", it doesn't imply any errors.
	compiler.plugin('invalid', function() {
		clearConsole();
		console.log('Compiling...');
		console.log();
	});

	// "done" event fires when Webpack has finished recompiling the bundle.
	// Whether or not you have warnings or errors, you will get this event.
	compiler.plugin('done', function(stats) {
		//clearConsole();

		// We have switched off the default Webpack output in WebpackDevServer
		// options so we are going to "massage" the warnings and errors and present
		// them in a readable focused way.
		var messages = formatWebpackMessages(stats.toJson({}, true));
		if (!messages.errors.length && !messages.warnings.length) {
			console.log(chalk.green('Compiled successfully!'));
			console.log();
			console.log('The app is running at:');
			console.log();
			console.log('	' + chalk.cyan(protocol + '://' + host + ':' + port + '/'));
			console.log();
			console.log('Note that the development build is not optimized.');
			console.log('To create a production build, use ' + chalk.cyan('npm run pack-p') + '.');
			console.log();
		}

		// If errors exist, only show errors.
		if (messages.errors.length) {
			console.log(chalk.red('Failed to compile.'));
			console.log();
			messages.errors.forEach(message => {
				console.log(message);
				console.log();
			});
			return;
		}

		// Show warnings if no errors were found.
		if (messages.warnings.length) {
			console.log(chalk.yellow('Compiled with warnings.'));
			console.log();
			messages.warnings.forEach(message => {
				console.log(message);
				console.log();
			});
			// Teach some ESLint tricks.
			console.log('You may use special comments to disable some warnings.');
			console.log('Use ' + chalk.yellow('// eslint-disable-next-line') + ' to ignore the next line.');
			console.log('Use ' + chalk.yellow('/* eslint-disable */') + ' to ignore all warnings in a file.');
		}
	});
}

// We need to provide a custom onError function for httpProxyMiddleware.
// It allows us to log custom error messages on the console.
function onProxyError(proxy) {
	return function(err, req, res){
		var host = req.headers && req.headers.host;
		console.log(
			chalk.red('Proxy error:') + ' Could not proxy request ' + chalk.cyan(req.url) +
			' from ' + chalk.cyan(host) + ' to ' + chalk.cyan(proxy) + '.'
		);
		console.log(
			'See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (' +
			chalk.cyan(err.code) + ').'
		);
		console.log();

		// And immediately send the proper error response to the client.
		// Otherwise, the request will eventually timeout with ERR_EMPTY_RESPONSE on the client side.
		if (res.writeHead && !res.headersSent) {
				res.writeHead(500);
		}
		res.end('Proxy error: Could not proxy request ' + req.url + ' from ' +
			host + ' to ' + proxy + ' (' + err.code + ').'
		);
	};
}

function addMiddleware(devServer) {
	// `proxy` lets you to specify a fallback server during development.
	// Every unrecognized request will be forwarded to it.
	var appPkg;
	try {
		appPkg = require(path.join(process.cwd(), 'package.json'));
	} catch(e) {
		appPkg = {};
	}
	var enact = appPkg.enact || {};
	var proxy = enact.proxy || appPkg.proxy;
	devServer.use(historyApiFallback({
		rewrites: [
			{
				from: /.*\.json$/,
				to: function(context) {
					return context.parsedUrl.pathname;
				}
			}
		],
		// Paths with dots should still use the history fallback.
		// See https://github.com/facebookincubator/create-react-app/issues/387.
		disableDotRule: true,
		// For single page apps, we generally want to fallback to /index.html.
		// However we also want to respect `proxy` for API calls.
		// So if `proxy` is specified, we need to decide which fallback to use.
		// We use a heuristic: if request `accept`s text/html, we pick /index.html.
		// Modern browsers include text/html into `accept` header when navigating.
		// However API calls like `fetch()` won’t generally accept text/html.
		// If this heuristic doesn’t work well for you, don’t use `proxy`.
		htmlAcceptHeaders: proxy ?
			['text/html'] :
			['text/html', '*/*']
	}));
	if (proxy) {
		if (typeof proxy !== 'string') {
			console.log(chalk.red('When specified, "proxy" in package.json must be a string.'));
			console.log(chalk.red('Instead, the type of "proxy" was "' + typeof proxy + '".'));
			console.log(chalk.red('Either remove "proxy" from package.json, or make it a string.'));
			process.exit(1);
		}

		// Otherwise, if proxy is specified, we will let it handle any request.
		// There are a few exceptions which we won't send to the proxy:
		// - /index.html (served as HTML5 history API fallback)
		// - /*.hot-update.json (WebpackDevServer uses this too for hot reloading)
		// - /sockjs-node/* (WebpackDevServer uses this for hot reloading)
		// Tip: use https://jex.im/regulex/ to visualize the regex
		var mayProxy = /^(?!\/(index\.html$|.*\.hot-update\.json$|sockjs-node\/)).*$/;
		devServer.use(mayProxy,
			// Pass the scope regex both to Express and to the middleware for proxying
			// of both HTTP and WebSockets to work without false positives.
			httpProxyMiddleware(pathname => mayProxy.test(pathname), {
				target: proxy,
				logLevel: 'silent',
				onError: onProxyError(proxy),
				secure: false,
				changeOrigin: true
			})
		);
	}
	// Finally, by now we have certainly resolved the URL.
	// It may be /index.html, so let the dev server try serving it again.
	devServer.use(devServer.middleware);
}

function runDevServer(host, port, protocol) {
	var devServer = new WebpackDevServer(compiler, {
		contentBase: process.cwd(),
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
		publicPath: config.output.publicPath || '/',
		// WebpackDevServer is noisy by default so we emit custom message instead
		// by listening to the compiler events with `compiler.plugin` calls above.
		quiet: true,
		// Reportedly, this avoids CPU overload on some systems.
		// https://github.com/facebookincubator/create-react-app/issues/293
		watchOptions: {
			ignored: /node_modules/
		},
		// Enable HTTPS if the HTTPS environment variable is set to 'true'
		https: protocol === "https",
		host: host
	});
	// Our custom middleware proxies requests to /index.html or a remote API.
	addMiddleware(devServer);
	// Launch WebpackDevServer.
	devServer.listen(port, (err, result) => {
		if (err) {
			return console.log(err);
		}

		clearConsole();
		console.log(chalk.cyan('Starting the development server...'));
		console.log();
		if(host==='0.0.0.0') {
			openBrowser(protocol + '://127.0.0.1:' + port + '/');
		} else {
			openBrowser(protocol + '://' + host + ':' + port + '/');
		}
	});
}

function run(port) {
	var protocol = process.env.HTTPS === 'true' ? "https" : "http";
	var host = process.env.HOST || config.devServer.host || 'localhost';
	setupCompiler(host, port, protocol);
	runDevServer(host, port, protocol);
}

function displayHelp() {
	console.log('  Usage');
	console.log('    enact serve [options]');
	console.log();
	console.log('  Options');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

module.exports = function(args) {
	var opts = minimist(args, {
		boolean: ['h', 'help'],
		alias: {h:'help'}
	});
	opts.help && displayHelp();

	process.env.NODE_ENV = 'development';

	// Warn and crash if required files are missing
	if (!checkRequiredFiles([config.entry.main[config.entry.main.length-1]])) {
		process.exit(1);
	}

	// Tools like Cloud9 rely on this.
	var DEFAULT_PORT = process.env.PORT || config.devServer.port || 8080;

	// We attempt to use the default port but if it is busy, we offer the user to
	// run on a different port. `detect()` Promise resolves to the next free port.
	detect(DEFAULT_PORT).then(port => {
		if (port === DEFAULT_PORT) {
			run(port);
			return;
		}

		clearConsole();
		var question =
			chalk.yellow('Something is already running on port ' + DEFAULT_PORT + '.') +
			'\n\nWould you like to run the app on another port instead?';

		prompt(question, true).then(shouldChangePort => {
			if (shouldChangePort) {
				run(port);
			}
		});
	});
};
