const fs = require('fs');
const path = require('path');

function isExternalUrl (url) {
	return /^(?:data:|https?:|\/\/|#)/.test(url);
}

function isAppRootUrl (url) {
	if (!url.startsWith('/') || url.startsWith('//')) {
		return false;
	}

	// PostCSS rewrites asset URLs to absolute filesystem paths on Linux (e.g.
	// /home/.../fonts/foo.ttf). Those are not app-root imports like /assets/foo.png.
	if (path.isAbsolute(url) && fs.existsSync(url)) {
		return false;
	}

	return true;
}

function resolveAppRootImport (importPath, appContext = process.cwd()) {
	if (!isAppRootUrl(importPath)) {
		return null;
	}

	const resolvedPath = path.resolve(appContext, importPath.slice(1));
	return fs.existsSync(resolvedPath) ? resolvedPath : null;
}

function resolveTildeImport (packagePath, fromDir, appContext = process.cwd()) {
	const searchPaths = [
		fromDir,
		appContext,
		path.join(appContext, 'node_modules')
	];

	for (const searchPath of searchPaths) {
		try {
			return require.resolve(packagePath, {paths: [searchPath]});
		} catch (_e) {
			// try next search path
		}
	}

	throw new Error(`Could not resolve: ~${packagePath}`);
}

function toCssRelativeImport (fromDir, resolvedPath) {
	let relativePath = path.relative(fromDir, resolvedPath).replace(/\\/g, '/');
	if (!relativePath.startsWith('.')) {
		relativePath = `./${relativePath}`;
	}
	return relativePath;
}

function parseImportPath (params) {
	const trimmed = params.trim();
	const urlMatch = trimmed.match(/^url\(\s*(['"]?)([^'")]+)\1\s*\)$/i);
	if (urlMatch) {
		return urlMatch[2];
	}

	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

function formatImportParams (params, resolvedRelativePath) {
	const trimmed = params.trim();
	if (/^url\(/i.test(trimmed)) {
		return `url("${resolvedRelativePath}")`;
	}
	return `"${resolvedRelativePath}"`;
}

function parseCssUrls (value) {
	const urls = [];
	const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
	let match;

	while ((match = pattern.exec(value)) !== null) {
		urls.push({
			full: match[0],
			quote: match[1],
			url: match[2],
			index: match.index
		});
	}

	return urls;
}

function normalizeCssUrlPath (url) {
	return url.replace(/\\/g, '/').split(/[?#]/)[0];
}

function resolveCssAssetPath (url, fromDir) {
	if (isExternalUrl(url) || isAppRootUrl(url)) {
		return null;
	}

	const directPath = path.resolve(fromDir, url);
	if (fs.existsSync(directPath)) {
		return directPath;
	}

	// LESS keeps url() paths relative to the file where they were authored, even
	// after those sheets are imported elsewhere (e.g. fonts.less -> ThemeDecorator).
	const segments = normalizeCssUrlPath(url).split('/').filter(Boolean);
	while (segments[0] === '..') {
		segments.shift();
	}

	if (!segments.length) {
		return null;
	}

	const tailPath = segments.join('/');
	let searchDir = fromDir;
	while (searchDir !== path.dirname(searchDir)) {
		const candidate = path.join(searchDir, tailPath);
		if (fs.existsSync(candidate)) {
			return candidate;
		}
		searchDir = path.dirname(searchDir);
	}

	return null;
}

function toBundlerCssUrl (filePath) {
	return filePath.replace(/\\/g, '/');
}

function resolveCssUrlPath (url, fromDir) {
	const resolvedPath = resolveCssAssetPath(url, fromDir);
	if (!resolvedPath) {
		return null;
	}

	return toBundlerCssUrl(resolvedPath);
}

function rewriteCssUrls (value, fromDir) {
	const urls = parseCssUrls(value);
	if (!urls.length) {
		return value;
	}

	let result = value;
	for (let i = urls.length - 1; i >= 0; i--) {
		const {full, url} = urls[i];
		const rewritten = resolveCssUrlPath(url, fromDir);
		if (rewritten && rewritten !== url) {
			result = result.slice(0, urls[i].index) +
				`url("${rewritten}")` +
				result.slice(urls[i].index + full.length);
		}
	}

	return result;
}

function createPostcssUrlPlugin (appContext = process.cwd()) {
	return {
		postcssPlugin: 'postcss-enact-url',
		Declaration (decl) {
			if (!decl.value.includes('url(')) {
				return;
			}

			const inputFile = decl.source?.input?.file || appContext;
			decl.value = rewriteCssUrls(decl.value, path.dirname(inputFile));
		}
	};
}
createPostcssUrlPlugin.postcss = true;

module.exports = {
	resolveTildeImport,
	toCssRelativeImport,
	parseImportPath,
	formatImportParams,
	isExternalUrl,
	isAppRootUrl,
	resolveAppRootImport,
	resolveCssAssetPath,
	resolveCssUrlPath,
	rewriteCssUrls,
	createPostcssUrlPlugin
};
