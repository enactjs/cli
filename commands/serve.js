/* eslint no-console: off, no-undef: off */
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
const http = require('http');
const path = require('path');
const minimist = require('minimist');
const clearConsole = require('react-dev-utils/clearConsole');
const getPublicUrlOrPath = require('react-dev-utils/getPublicUrlOrPath');
const openBrowser = require('react-dev-utils/openBrowser');
const {choosePort, prepareProxy, prepareUrls} = require('react-dev-utils/WebpackDevServerUtils');
// esbuild replaces webpack + webpack-dev-server as the bundler/dev-server.
const esbuild = require('esbuild');
// react-refresh-webpack-plugin has no esbuild equivalent; esbuild's dev server
// only supports full-page reload via its built-in `/esbuild` SSE endpoint, so
// "fast refresh" below really means "reload the page when a rebuild finishes".
const {optionParser: app} = require('@enact/dev-utils');
const configFactory = require('../config/esbuild.config');

let chalk;

// Any unhandled promise rejections should be treated like errors.
process.on('unhandledRejection', err => {
	throw err;
});

// As react-dev-utils assumes the webpack production packaging command is
// "npm run build" with no way to modify it yet, we provide a basic override
// to console.log to ensure the correct output is displayed to the user.
// prettier-ignore
console.log = (log => (data, ...rest) => {
	if (typeof data === 'undefined') {
		return log();
	} else if (typeof data === 'string') {
		return log(data.replace(/npm run build/, 'npm run pack-p'), ...rest);
	}
	return log.call(this, data, ...rest);
})(console.log);

function displayHelp () {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact serve';

	console.log('  Usage');
	console.log(`    ${e} [options]`);
	console.log();
	console.log('  Options');
	console.log('    -b, --browser     Automatically open browser');
	console.log('    -i, --host        Server host IP address');
	console.log('    -f, --fast        Enables experimental frast refresh');
	console.log('    -p, --port        Server port number');
	console.log('    -m, --meta        JSON to override package.json enact metadata');
	console.log('    --no-linting      Build without code linting');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

// Formerly `hotDevServer`: wired up webpack's dev-client / React Refresh
// plugin. esbuild has no HMR client of its own, so instead we inject a tiny
// live-reload snippet that listens on esbuild's built-in `/esbuild` SSE
// stream and reloads the page whenever a build completes.
const LIVE_RELOAD_SCRIPT = `
<script>
	(function () {
		new EventSource('/esbuild').addEventListener('change', () => location.reload());
	})();
</script>`;

function injectLiveReload (html) {
	if (html.includes('</body>')) {
		return html.replace('</body>', `${LIVE_RELOAD_SCRIPT}</body>`);
	}
	return html + LIVE_RELOAD_SCRIPT;
}

const STATIC_MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.webp': 'image/webp',
	'.ttf': 'font/ttf',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.eot': 'application/vnd.ms-fontobject',
	'.otf': 'font/otf',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.txt': 'text/plain; charset=utf-8'
};

// Recursively lists every file under `dir`, returning URL-style relative
// paths (forward slashes, no leading slash) suitable for matching against
// req.url once joined with `publicPath`.
function listFilesRecursive (dir, baseDir = dir) {
	let results = [];
	for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results = results.concat(listFilesRecursive(full, baseDir));
		} else {
			results.push(path.relative(baseDir, full).replace(/\\/g, '/'));
		}
	}
	return results;
}

// Builds (and can rebuild) the set of URL paths that correspond to files
// copied verbatim from `public`/`__mocks__` rather than esbuild's own JS/CSS
// bundle output, so the request handler can serve them directly instead of
// forwarding to esbuild's serve() — which rebuilds the *entire app* on every
// request it handles, triggering every onEnd plugin (eslint, tsc, ilib/webOS
// asset copying) each time. Routing plain static files around that avoids
// paying that cost for every font/image/manifest request.
function buildStaticFileIndex (staticDirs, publicPath) {
	const index = new Set();
	staticDirs.forEach(dir => {
		if (!fs.existsSync(dir)) return;
		listFilesRecursive(dir).forEach(relPath => {
			index.add(`${publicPath}/${relPath}`.replace(/\/+/g, '/'));
		});
	});
	return index;
}

// Minimal reverse proxy: forwards everything to esbuild's internal serve()
// host/port, except paths matched by the user's configured `proxy` (backend
// API requests), which are forwarded to their real targets instead.
// This replaces WebpackDevServer's built-in `proxy` + `static` + history
// fallback handling.
function createDevServer ({
							  esbuildHost,
							  esbuildPort,
							  proxyConfig,
							  publicPath,
							  host,
							  port,
							  allowedHost,
							  disableFirewall,
							  outdir,
							  staticFileIndexRef
						  }) {
	const proxyMatchers = Object.keys(proxyConfig || {});

	function forward (req, res, targetHost, targetPort, rewritePath) {
		const options = {
			hostname: targetHost,
			port: targetPort,
			path: rewritePath || req.url,
			method: req.method,
			headers: Object.assign({}, req.headers, {host: `${targetHost}:${targetPort}`})
		};
		const proxyReq = http.request(options, proxyRes => {
			res.writeHead(proxyRes.statusCode, proxyRes.headers);
			proxyRes.pipe(res, {end: true});
		});
		proxyReq.on('error', err => {
			if (res.headersSent) {
				res.end();
				return;
			}
			res.writeHead(502);
			res.end(`Proxy error: ${err.message}`);
		});
		req.pipe(proxyReq, {end: true});
	}

	function matchProxy (reqUrl) {
		return proxyMatchers.find(rule => {
			if (rule === '/') return true;
			return reqUrl === rule || reqUrl.startsWith(rule);
		});
	}

	const server = http.createServer((req, res) => {
		// Basic DNS-rebinding guard, mirroring WebpackDevServer's allowedHosts
		// behavior: if a firewall host is configured, reject mismatched Host
		// headers unless it's been explicitly disabled.
		if (!disableFirewall) {
			const hostHeader = (req.headers.host || '').split(':')[0];
			if (hostHeader !== allowedHost && hostHeader !== 'localhost') {
				res.writeHead(403);
				res.end('Invalid Host header');
				return;
			}
		}

		const matchedRule = matchProxy(req.url);
		if (matchedRule) {
			const target = proxyConfig[matchedRule].target || proxyConfig[matchedRule];
			const targetUrl = new URL(target);
			forward(req, res, targetUrl.hostname, targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80));
			return;
		}

		const urlPath = req.url.split('?')[0];
		if (staticFileIndexRef.current.has(urlPath)) {
			const filePath = path.join(outdir, decodeURIComponent(urlPath.slice(publicPath.length)));
			if (fs.existsSync(filePath)) {
				const ext = path.extname(filePath).toLowerCase();
				res.writeHead(200, {'Content-Type': STATIC_MIME_TYPES[ext] || 'application/octet-stream'});
				fs.createReadStream(filePath).pipe(res);
				return;
			}
			// Index says it should exist but it's gone (e.g. deleted after the
			// index was built); fall through to the normal 404 path below.
		}

		// Everything else (JS/CSS/HTML assets) is served by esbuild's own
		// dev server, which rebuilds on demand for each request.
		const options = {
			hostname: esbuildHost,
			port: esbuildPort,
			path: req.url,
			method: req.method,
			headers: req.headers
		};
		const proxyReq = http.request(options, proxyRes => {
			const contentType = proxyRes.headers['content-type'] || '';
			if (contentType.includes('text/html')) {
				const chunks = [];
				proxyRes.on('data', chunk => chunks.push(chunk));
				proxyRes.on('end', () => {
					const html = injectLiveReload(Buffer.concat(chunks).toString('utf8'));
					const headers = Object.assign({}, proxyRes.headers, {'content-length': Buffer.byteLength(html)});
					res.writeHead(proxyRes.statusCode, headers);
					res.end(html);
				});
			} else {
				res.writeHead(proxyRes.statusCode, proxyRes.headers);
				proxyRes.pipe(res, {end: true});
			}
		});
		proxyReq.on('error', err => {
			if (res.headersSent) {
				// Response (e.g. a long-lived /esbuild SSE stream) already
				// started; nothing left to do but close it out.
				res.end();
				return;
			}
			res.writeHead(502);
			res.end(`Dev server error: ${err.message}`);
		});
		req.pipe(proxyReq, {end: true});
	});

	server.listen(port, host);
	return server;
}

async function serve (buildOptions, host, port, open) {
	// We attempt to use the default port but if it is busy, we offer the user to
	// run on a different port. `detect()` Promise resolves to the next free port.
	const resolvedPort = await choosePort(host, port);
	if (resolvedPort == null) {
		// We have not found a port.
		throw new Error('Could not find a free port for the dev-server.');
	}
	const protocol = process.env.HTTPS === 'true' ? 'https' : 'http';
	const publicPath = getPublicUrlOrPath(true, app.publicUrl, process.env.PUBLIC_URL);
	const urls = prepareUrls(protocol, host, resolvedPort, publicPath.slice(0, -1));

	// Load proxy config (still uses react-dev-utils' `prepareProxy`, since
	// that piece is bundler-agnostic and just builds a proxy table).
	const proxySetting = app.proxy;
	const proxyConfig = prepareProxy(proxySetting, './public', publicPath);

	// Build an esbuild context. `ctx.watch()` rebuilds automatically on file
	// changes; `ctx.serve()` starts esbuild's own lightweight HTTP server
	// (assets + the `/esbuild` live-reload event stream) on a local port that
	// our reverse proxy above sits in front of.
	const ctx = await esbuild.context(
		Object.assign({}, buildOptions, {
			// Ensure the CLI version of Chalk is used, since some deps bundle
			// an out-of-date local copy (mirrors the old resolve.alias hack).
			// esbuild handles this via `alias` in its build options instead
			// of webpack's `resolve.alias`.
			alias: Object.assign({}, buildOptions.alias, {
				chalk: require.resolve('chalk'),
				'ansi-styles': require.resolve('ansi-styles')
			})
		})
	);
	// `ctx.watch()` takes no options at all — esbuild watches every file
	// that ends up in the build's module graph and has no ignore-pattern
	// concept (unlike chokidar/WebpackDevServer's `static.watch.ignored`).
	// In practice this means esbuild will simply never watch files it
	// never bundled in the first place (e.g. node_modules files that
	// weren't imported), so no separate exclusion list is needed.
	await ctx.watch();

	// esbuild's serve() requires build output and any static files it serves
	// to live under one shared `servedir` root — unlike WebpackDevServer,
	// which could merge `dist` (in-memory) and `public`/`__mocks__` (on disk)
	// at the same publicPath even though they're separate directories. So we
	// copy the static folders into the build's outdir once up front and
	// serve from there instead.
	const outdir = buildOptions.outdir || path.resolve(app.context, 'dist');
	const staticDirs = [path.resolve(app.context, 'public'), path.resolve(app.context, '__mocks__')];
	staticDirs.forEach(dir => {
		if (fs.existsSync(dir)) {
			fs.cpSync(dir, outdir, {recursive: true, force: true, errorOnExist: false});
		}
	});
	const staticFileIndexRef = {current: buildStaticFileIndex(staticDirs, publicPath)};
	// Static files can still change while serving; re-sync on any change
	// since esbuild's own watcher only tracks files already in its bundle
	// graph, not arbitrary static assets.
	staticDirs.forEach(dir => {
		if (fs.existsSync(dir)) {
			fs.watch(dir, {recursive: true}, () => {
				fs.cpSync(dir, outdir, {recursive: true, force: true, errorOnExist: false});
				staticFileIndexRef.current = buildStaticFileIndex(staticDirs, publicPath);
			});
		}
	});

	const {host: esbuildHost, port: esbuildPort} = await ctx.serve({
		servedir: outdir,
		host: '127.0.0.1',
		port: 0
	});

	const disableFirewall = !proxyConfig || process.env.DANGEROUSLY_DISABLE_HOST_CHECK === 'true';
	const devServer = createDevServer({
		esbuildHost,
		esbuildPort,
		proxyConfig,
		publicPath,
		host,
		port: resolvedPort,
		allowedHost: urls.lanUrlForConfig,
		disableFirewall,
		outdir,
		staticFileIndexRef
	});

	devServer.on('listening', () => {
		if (process.stdout.isTTY) clearConsole();
		console.log(chalk.cyan('Starting the development server...\n'));
		if (open) {
			openBrowser(urls.localUrlForBrowser);
		}
	});

	const shutdown = async () => {
		await ctx.dispose();
		devServer.close();
		process.exit();
	};

	['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, shutdown));

	if (process.env.CI !== 'true') {
		// Gracefully exit when stdin ends
		process.stdin.on('end', shutdown);
	}
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

	// We can disable the typechecker formatter since react-dev-utils includes their
	// own formatter in their dev client.
	process.env.DISABLE_TSFORMATTER = 'true';

	// Use inline styles for serving process.
	process.env.INLINE_STYLES = 'true';

	// Setup the development build options with additional esbuild dev-server
	// customizations. `../config/esbuild.config` should export a factory of
	// the same shape as the old webpack.config factory, but returning an
	// esbuild build-options object (entryPoints, bundle, outdir, plugins, etc.)
	// instead of a webpack config.
	const configFactory = require('../config/esbuild.config');
	const buildOptions = configFactory('development', !opts.linting);

	// Tools like Cloud9 rely on this.
	const host = process.env.HOST || opts.host || '0.0.0.0';
	const port = parseInt(process.env.PORT || opts.port || 8080);

	// Start serving
	if (['node', 'async-node', 'webworker'].includes(app.environment)) {
		return Promise.reject(new Error('Serving is not supported for non-browser apps.'));
	} else {
		return serve(buildOptions, host, port, opts.browser);
	}
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
			// console.error(chalk.red('ERROR: ') + (err.message || err));
			console.log(err);
			process.exit(1);
		});
	});
}

module.exports = {api, cli};
if (require.main === module) cli(process.argv.slice(2));