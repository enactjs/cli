const fs = require('fs');
const path = require('path');
const {prepareProxy} = require('react-dev-utils/WebpackDevServerUtils');

function createProxyHandler (proxySetting, publicFolder, publicPath) {
	const proxyConfig = prepareProxy(proxySetting, publicFolder, publicPath);
	if (!proxyConfig) {
		return null;
	}

	const entry = Array.isArray(proxyConfig) ? proxyConfig[0] : proxyConfig;
	const target = entry.target;
	const contextFn = entry.context;

	return async function proxyRequest (req, pathname) {
		if (typeof contextFn === 'function' && !contextFn(pathname, req)) {
			return null;
		}

		const targetUrl = new URL(pathname + new URL(req.url).search, target);
		const headers = new Headers(req.headers);
		if (headers.has('origin')) {
			headers.set('origin', target);
		}

		const init = {
			method: req.method,
			headers,
			redirect: 'manual'
		};

		if (req.method !== 'GET' && req.method !== 'HEAD') {
			init.body = req.body;
			init.duplex = 'half';
		}

		const response = await fetch(targetUrl, init);
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	};
}

function shouldServeSpaIndex (req, pathname, publicFolder, publicPath) {
	if (req.method !== 'GET') {
		return false;
	}

	const accept = req.headers.get('accept') || '';
	if (!accept.includes('text/html')) {
		return false;
	}

	if (pathname.includes('.')) {
		const maybePublicPath = path.resolve(
			publicFolder,
			pathname.replace(new RegExp(`^${publicPath}`), '')
		);
		if (fs.existsSync(maybePublicPath)) {
			return false;
		}
	}

	return true;
}

module.exports = {createProxyHandler, shouldServeSpaIndex};
