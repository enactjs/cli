const fs = require('fs');
const path = require('path');
const {createRequire} = require('module');

function getTlsOptions () {
	const {SSL_CRT_FILE, SSL_KEY_FILE} = process.env;
	if (process.env.HTTPS === 'true' && SSL_CRT_FILE && SSL_KEY_FILE &&
		fs.existsSync(SSL_CRT_FILE) && fs.existsSync(SSL_KEY_FILE)) {
		return {
			cert: fs.readFileSync(SSL_CRT_FILE),
			key: fs.readFileSync(SSL_KEY_FILE)
		};
	}
	return null;
}

function getProtocol () {
	return getTlsOptions() ? 'https' : 'http';
}

function normalizePublicPath (publicPath) {
	if (!publicPath || publicPath === '/') return '/';
	return publicPath.endsWith('/') ? publicPath : `${publicPath}/`;
}

function redirectPublicPath (pathname, publicPath) {
	const normalized = normalizePublicPath(publicPath);
	if (normalized === '/') return pathname;
	if (pathname.startsWith(normalized)) {
		return pathname.slice(normalized.length - 1) || '/';
	}
	return pathname;
}

function isAllowedHost (host, allowedHost, hasProxy) {
	if (!hasProxy || process.env.DANGEROUSLY_DISABLE_HOST_CHECK === 'true') {
		return true;
	}
	if (!host) return false;
	return host === allowedHost || host.startsWith(`${allowedHost}:`);
}

function createSetupProxyHandler (context) {
	const setupProxy = path.join(context, 'src', 'setupProxy.js');
	if (!fs.existsSync(setupProxy)) {
		return null;
	}

	let createProxyMiddleware;
	try {
		createProxyMiddleware = require(require.resolve('http-proxy-middleware', {paths: [context]}));
	} catch (e) {
		console.warn('setupProxy.js found but http-proxy-middleware is not installed in the project.');
		return null;
	}

	const stack = [];
	const app = {
		use (route, handler) {
			if (typeof route === 'function') {
				stack.push({route: null, handler: route});
			} else {
				stack.push({route: route, handler});
			}
		}
	};

	require(setupProxy)(app);

	return async function handleSetupProxy (req, pathname) {
		for (const entry of stack) {
			if (entry.route && !pathname.startsWith(entry.route)) {
				continue;
			}
			if (typeof entry.handler === 'function' && entry.handler.name === 'handle') {
				const targetUrl = new URL(req.url, 'http://localhost');
				const response = await fetch(new URL(pathname + targetUrl.search, 'http://localhost'));
				if (response.status !== 404) {
					return response;
				}
			}
		}
		return null;
	};
}

function getDevOverlayScript () {
	try {
		const requireFromCli = createRequire(path.join(__dirname, '..', '..', 'package.json'));
		const overlayPath = requireFromCli.resolve('react-error-overlay/lib/index');
		return [
			'<script>',
			'window.__ENACT_BUILD_ERROR__ = null;',
			'window.addEventListener("error", function (event) {',
			'\tif (window.__ENACT_OVERLAY__) { window.__ENACT_OVERLAY__.reportRuntimeError(event.error); }',
			'});',
			'</script>'
		].join('\n');
	} catch (e) {
		return '';
	}
}

module.exports = {
	getTlsOptions,
	getProtocol,
	redirectPublicPath,
	isAllowedHost,
	createSetupProxyHandler,
	getDevOverlayScript
};
