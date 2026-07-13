import path from 'path';
import fs from 'fs';
import {createRequire} from 'module';
import {createBuildOptions, getCacheDir, ensureEntryFile} from './build-options.js';
import {writeDevHtml} from './generate-html.js';
import {createEnactPlugins} from './plugins/index.js';
import {createProxyHandler, shouldServeSpaIndex} from './dev-proxy.js';
import {
	getTlsOptions,
	getProtocol,
	redirectPublicPath,
	isAllowedHost,
	createSetupProxyHandler
} from './dev-serve-utils.js';

const nodeRequire = createRequire(import.meta.url);

function parseArgs (argv) {
	const opts = {
		host: '0.0.0.0',
		port: 8080,
		open: false,
		linting: true,
		fast: false
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--host' || arg === '-i') opts.host = argv[++i];
		else if (arg === '--port' || arg === '-p') opts.port = parseInt(argv[++i], 10);
		else if (arg === '--browser' || arg === '-b') opts.open = true;
		else if (arg === '--context') opts.context = argv[++i];
		else if (arg === '--no-linting') opts.linting = false;
		else if (arg === '--fast' || arg === '-f') opts.fast = true;
	}
	return opts;
}

async function runBuild (opts, entry, buildPlugins, outDir) {
	const result = await Bun.build({
		entrypoints: [entry],
		outdir: outDir,
		target: 'browser',
		minify: false,
		sourcemap: opts.sourcemap ? 'linked' : 'none',
		define: opts.defines,
		publicPath: opts.publicPath || '/',
		plugins: buildPlugins,
		alias: opts.aliases
	});
	if (!result.success) {
		for (const log of result.logs) console.error(log);
		throw new Error('Dev build failed.');
	}
	return result;
}

const cliOpts = parseArgs(process.argv.slice(2));
process.env.INLINE_STYLES = 'true';
if (cliOpts.fast) {
	process.env.FAST_REFRESH = 'true';
}

const buildOpts = createBuildOptions({
	context: cliOpts.context,
	production: false,
	linting: cliOpts.linting,
	fastRefresh: cliOpts.fast
});
const cacheDir = getCacheDir(buildOpts.context);
fs.mkdirSync(cacheDir, {recursive: true});

const app = nodeRequire('@enact/dev-utils/option-parser');
const entryFile = ensureEntryFile(buildOpts.context, buildOpts.mainEntry, {
	isomorphic: false,
	snapshot: false,
	fastRefresh: cliOpts.fast
});
const plugins = createEnactPlugins({
	production: false,
	sourcemap: buildOpts.sourcemap,
	context: buildOpts.context,
	additionalModulePaths: buildOpts.additionalModulePaths,
	accent: buildOpts.accent,
	forceCSSModules: buildOpts.forceCSSModules,
	useTailwind: buildOpts.useTailwind,
	ri: buildOpts.ri,
	aliases: buildOpts.aliases,
	linting: cliOpts.linting,
	fastRefresh: cliOpts.fast
});

await runBuild(buildOpts, entryFile, plugins, cacheDir);
writeDevHtml(cacheDir, {title: buildOpts.title, publicPath: buildOpts.publicPath, customSkin: buildOpts.customSkin});

const publicDir = path.join(buildOpts.context, 'public');
const mocksDir = path.join(buildOpts.context, '__mocks__');
const publicPath = buildOpts.publicPath || '/';
const proxyHandler = createProxyHandler(app.proxy, publicDir, publicPath);
const setupProxyHandler = createSetupProxyHandler(buildOpts.context);
const tls = getTlsOptions();
const allowedHost = cliOpts.host === '0.0.0.0' ? 'localhost' : cliOpts.host;

const server = Bun.serve({
	hostname: cliOpts.host,
	port: cliOpts.port,
	tls,
	development: {
		hmr: true,
		console: true
	},
	async fetch (req) {
		const url = new URL(req.url);
		if (!isAllowedHost(url.hostname, allowedHost, !!app.proxy)) {
			return new Response('Invalid Host header', {status: 403});
		}

		let pathname = decodeURIComponent(url.pathname);
		pathname = redirectPublicPath(pathname, publicPath);

		if (pathname === '/' || pathname === '/index.html') {
			return new Response(Bun.file(path.join(cacheDir, 'index.html')), {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					'Access-Control-Allow-Origin': '*'
				}
			});
		}

		for (const dir of [cacheDir, publicDir, mocksDir]) {
			if (!fs.existsSync(dir)) continue;
			const candidate = path.join(dir, pathname.replace(/^\//, ''));
			if (candidate.startsWith(dir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
				return new Response(Bun.file(candidate), {
					headers: {'Access-Control-Allow-Origin': '*'}
				});
			}
		}

		if (setupProxyHandler) {
			const setupResponse = await setupProxyHandler(req, pathname);
			if (setupResponse) {
				return setupResponse;
			}
		}

		if (proxyHandler) {
			const proxied = await proxyHandler(req, pathname);
			if (proxied) {
				return proxied;
			}
		}

		if (shouldServeSpaIndex(req, pathname, publicDir, publicPath)) {
			return new Response(Bun.file(path.join(cacheDir, 'index.html')), {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					'Access-Control-Allow-Origin': '*'
				}
			});
		}

		return new Response('Not Found', {status: 404});
	}
});

Bun.build({
	entrypoints: [entryFile],
	outdir: cacheDir,
	target: 'browser',
	minify: false,
	sourcemap: buildOpts.sourcemap ? 'linked' : 'none',
	define: buildOpts.defines,
	publicPath: buildOpts.publicPath || '/',
	plugins,
	alias: buildOpts.aliases,
	watch: {
		onRebuild (error) {
			if (error) {
				console.error('Rebuild failed:', error);
			} else {
				console.log('Rebuilt.');
			}
		}
	}
});

const protocol = getProtocol();
const localUrl = `${protocol}://localhost:${server.port}${normalizePublicPath(publicPath)}`;
console.log(`Starting the development server at ${localUrl}`);

if (cliOpts.open) {
	const openBrowser = nodeRequire('react-dev-utils/openBrowser');
	openBrowser(localUrl);
}

function normalizePublicPath (value) {
	if (!value || value === '/') return '/';
	return value.endsWith('/') ? value : `${value}/`;
}
