const fs = require('fs');
const path = require('path');

function isExternalUrl (url) {
	return /^(?:data:|https?:|\/\/|#)/.test(url);
}

function isAppRootUrl (url) {
	return url.startsWith('/') && !url.startsWith('//');
}

function resolveAppRootImport (importPath, appContext = process.cwd()) {
	if (!isAppRootUrl(importPath)) {
		return null;
	}

	const resolvedPath = path.join(appContext, importPath.slice(1));
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

function resolveCssUrlPath (url, fromDir) {
	if (isExternalUrl(url) || isAppRootUrl(url)) {
		return null;
	}

	const resolvedPath = path.resolve(fromDir, url);
	if (fs.existsSync(resolvedPath)) {
		return toCssRelativeImport(fromDir, resolvedPath);
	}

	return null;
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
	resolveCssUrlPath,
	rewriteCssUrls,
	createPostcssUrlPlugin
};
