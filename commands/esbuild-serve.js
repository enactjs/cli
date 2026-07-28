/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
/**
 * Experimental esbuild dev-server path for `enact serve`, opt-in via `--esbuild`
 * or ENACT_BUNDLER=esbuild. Kept in its own module so the webpack path in
 * `serve.js` stays untouched.
 *
 * esbuild's own dev server (`esbuild.context().serve()`) is used out of the box:
 * it serves the build output *and* static files from a single `servedir`, and
 * exposes a `/esbuild` Server-Sent-Events endpoint for live reload (full-page
 * reload on rebuild — esbuild has no HMR). The live-reload client is injected
 * into `index.html` by `EsbuildHtmlPlugin` (dev only), so esbuild can serve the
 * document directly with no rewriting.
 *
 * The only things esbuild's dev server does not do — a backend `proxy` table and
 * a DNS-rebinding host check — are added by a thin reverse proxy, and only when
 * a `proxy` is configured. Without one, esbuild's server is used directly.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const clearConsole = require('react-dev-utils/clearConsole');
const getPublicUrlOrPath = require('react-dev-utils/getPublicUrlOrPath');
const openBrowser = require('react-dev-utils/openBrowser');
const {choosePort, prepareProxy, prepareUrls} = require('react-dev-utils/WebpackDevServerUtils');
const esbuild = require('esbuild');
const {optionParser: app} = require('@enact/dev-utils');

// Thin reverse proxy in front of esbuild's own dev server, used only when the
// app configures a backend `proxy`. It forwards matched routes to their real
// targets and everything else straight to esbuild's server (which serves the
// build output, static files, and the `/esbuild` live-reload stream itself).
// This replaces only the two pieces esbuild's server lacks — a proxy table and
// a host check — not its static/asset serving.
function createProxyServer ({esbuildHost, esbuildPort, proxyConfig, host, port, allowedHost, disableFirewall}) {
	const proxyMatchers = Object.keys(proxyConfig || {});

	function forward (req, res, targetHost, targetPort, rewritePath, rewriteHost) {
		const options = {
			hostname: targetHost,
			port: targetPort,
			path: rewritePath || req.url,
			method: req.method,
			headers: rewriteHost ?
				Object.assign({}, req.headers, {host: `${targetHost}:${targetPort}`}) :
				req.headers
		};
		const proxyReq = http.request(options, proxyRes => {
			res.writeHead(proxyRes.statusCode, proxyRes.headers);
			proxyRes.pipe(res, {end: true});
		});
		proxyReq.on('error', err => {
			if (res.headersSent) {
				// A long-lived response (e.g. the /esbuild SSE stream) already
				// started; nothing left to do but close it out.
				res.end();
				return;
			}
			res.writeHead(502);
			res.end(`Dev server error: ${err.message}`);
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
		// Basic DNS-rebinding guard, mirroring WebpackDevServer's allowedHosts.
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
			forward(
				req,
				res,
				targetUrl.hostname,
				targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
				null,
				true
			);
			return;
		}

		// Everything else → esbuild's own dev server (assets + /esbuild stream).
		forward(req, res, esbuildHost, esbuildPort);
	});

	server.listen(port, host);
	return server;
}

async function serve (buildOptions, host, port, open, chalk) {
	// Use the default port, or the next free one if it's busy.
	const resolvedPort = await choosePort(host, port);
	if (resolvedPort == null) {
		throw new Error('Could not find a free port for the dev-server.');
	}
	const protocol = process.env.HTTPS === 'true' ? 'https' : 'http';
	const publicPath = getPublicUrlOrPath(true, app.publicUrl, process.env.PUBLIC_URL);
	const urls = prepareUrls(protocol, host, resolvedPort, publicPath.slice(0, -1));

	// Backend proxy table (bundler-agnostic; react-dev-utils just builds a map).
	const proxyConfig = prepareProxy(app.proxy, './public', publicPath);
	const hasProxy = proxyConfig && Object.keys(proxyConfig).length > 0;

	// Build an esbuild context: `ctx.watch()` rebuilds on change; `ctx.serve()`
	// starts esbuild's own dev server.
	const ctx = await esbuild.context(
		Object.assign({}, buildOptions, {
			// Ensure the CLI's Chalk is used, since some deps bundle an old copy
			// (mirrors the old webpack resolve.alias hack).
			alias: Object.assign({}, buildOptions.alias, {
				chalk: require.resolve('chalk'),
				'ansi-styles': require.resolve('ansi-styles')
			})
		})
	);
	await ctx.watch();

	// esbuild's serve() serves the build output and static files from one shared
	// `servedir`. Copy the static folders in alongside the build output so they
	// are served too (esbuild has a single servedir, unlike WebpackDevServer's
	// multiple static dirs).
	const outdir = buildOptions.outdir || path.resolve(app.context, 'dist');
	[path.resolve(app.context, 'public'), path.resolve(app.context, '__mocks__')].forEach(dir => {
		if (fs.existsSync(dir)) {
			fs.cpSync(dir, outdir, {recursive: true, force: true, errorOnExist: false});
		}
	});

	const announce = () => {
		if (process.stdout.isTTY) clearConsole();
		console.log(chalk.cyan('Starting the development server...\n'));
		if (open) openBrowser(urls.localUrlForBrowser);
	};

	let dispose;
	if (hasProxy) {
		// A backend proxy (and its host check) is needed — features esbuild's
		// server lacks. Run esbuild's server on an internal port and put a thin
		// proxy in front of it on the user-facing port.
		const {host: esbuildHost, port: esbuildPort} = await ctx.serve({
			servedir: outdir,
			host: '127.0.0.1',
			port: 0
		});
		const disableFirewall = process.env.DANGEROUSLY_DISABLE_HOST_CHECK === 'true';
		const devServer = createProxyServer({
			esbuildHost,
			esbuildPort,
			proxyConfig,
			host,
			port: resolvedPort,
			allowedHost: urls.lanUrlForConfig,
			disableFirewall
		});
		devServer.on('listening', announce);
		dispose = async () => {
			await ctx.dispose();
			devServer.close();
		};
	} else {
		// No backend proxy: esbuild's own dev server IS the server — it serves
		// the build output, the static folders, and the /esbuild live-reload
		// stream, all out of the box.
		await ctx.serve({servedir: outdir, host, port: resolvedPort});
		announce();
		dispose = () => ctx.dispose();
	}

	const shutdown = async () => {
		await dispose();
		process.exit();
	};
	['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, shutdown));
	if (process.env.CI !== 'true') {
		// Gracefully exit when stdin ends.
		process.stdin.on('end', shutdown);
	}
}

// Experimental esbuild dev-server path. `configFactory` (config/esbuild.config)
// returns an esbuild build-options object of the same shape the webpack config
// factory returns for webpack.
async function esbuildServe (opts, host, port, chalk) {
	// We can disable the typechecker formatter since react-dev-utils includes
	// their own formatter in their dev client.
	process.env.DISABLE_TSFORMATTER = 'true';
	// Marker read by esbuild.config.js so EsbuildHtmlPlugin injects the
	// `/esbuild` live-reload listener into the served index.html.
	process.env.ENACT_ESBUILD_SERVE = 'true';

	const configFactory = require('../config/esbuild.config');
	const buildOptions = configFactory('development', !opts.linting);

	// esbuild's dev server serves from a real on-disk `servedir`, so the build
	// output (bundle + iLib data + webOS meta + index.html + copied static) has
	// to live somewhere — but it should not be the app's `dist` (webpack serves
	// from an in-memory FS, so neither leaves
	// a build folder behind). Redirect serve's output into a cache dir instead,
	// so `enact serve` doesn't create/pollute `dist`; `enact pack` still uses it.
	// The iLib `ILIB_*` URLs are publicPath-based (not outdir-based), and every
	// served path is relative to `servedir`, so relocating the dir is transparent
	// to the browser. The webOS/iLib/HTML plugins and serve() all read
	// `build.initialOptions.outdir`, so overriding it here is sufficient.
	buildOptions.outdir = path.join(app.context, 'node_modules', '.cache', 'enact-esbuild');

	return serve(buildOptions, host, port, opts.browser, chalk);
}

module.exports = {esbuildServe};
