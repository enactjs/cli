const fs = require('fs');
const path = require('path');

const CUSTOM_SKIN_JS = 'customizations/custom_skin.js';
const CUSTOM_SKIN_CSS = 'customizations/custom_skin.css';

function usesCustomSkinTemplate (templatePath) {
	return !!(templatePath && /custom-skin-template\.ejs$/i.test(path.basename(templatePath)));
}

function getCustomSkinHeadHtml () {
	return [
		`\n\t\t<script type="text/javascript" src="${CUSTOM_SKIN_JS}"></script>`,
		`\t\t<link rel="stylesheet" href="${CUSTOM_SKIN_CSS}" />`
	].join('\n');
}

function readWebOSTitle (context) {
	const roots = [context, path.join(context, 'webos-meta')];
	for (const root of roots) {
		const appinfoPath = path.join(root, 'appinfo.json');
		if (fs.existsSync(appinfoPath)) {
			try {
				const appinfo = JSON.parse(fs.readFileSync(appinfoPath, {encoding: 'utf8'}));
				if (appinfo.title) return appinfo.title;
			} catch (_e) {
				// ignore parse errors
			}
		}
	}
	return null;
}

function renderHtml ({title, scriptSrc, cssHref, isomorphic, externalScripts, externalStyles, customSkin}) {
	const customSkinHead = customSkin ? getCustomSkinHeadHtml() : '';
	const externalCss = (externalStyles || [])
		.map(href => `\n\t\t<link rel="stylesheet" href="${href}" />`)
		.join('');
	const css = cssHref ? `\n\t\t<link rel="stylesheet" href="${cssHref}" />` : '';
	const externalJs = !isomorphic && (externalScripts || [])
		.map(src => `\n\t\t<script type="text/javascript" src="${src}"></script>`)
		.join('');
	const scriptType = isomorphic ? 'text/javascript' : 'module';
	const appScript = scriptSrc && !isomorphic
		? `\n\t\t<script type="${scriptType}" src="${scriptSrc}"></script>`
		: '';
	const bodyScripts = externalJs + appScript;

	return `<!DOCTYPE html>
<html>
	<head>
		<meta charset="UTF-8">
		<meta http-equiv="x-ua-compatible" content="ie=edge">
		<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no">
		<title>${title || ''}</title>${customSkinHead}${externalCss}${css}
	</head>
	<body>
		<div id="root"></div>${bodyScripts}
	</body>
</html>
`;
}

function writeIndexHtml (outputDir, options) {
	fs.mkdirSync(outputDir, {recursive: true});
	const title = options.title || readWebOSTitle(options.context) || options.fallbackTitle || '';
	const html = renderHtml({...options, title});
	const target = path.join(outputDir, 'index.html');
	fs.writeFileSync(target, html, {encoding: 'utf8'});
	return target;
}

function writeDevHtml (cacheDir, options) {
	fs.mkdirSync(cacheDir, {recursive: true});
	const overlay = require('./dev-serve-utils').getDevOverlayScript();
	const html = renderHtml({...options, scriptSrc: './entry.js'}).replace('</head>', `${overlay}\n\t</head>`);
	const target = path.join(cacheDir, 'index.html');
	fs.writeFileSync(target, html, {encoding: 'utf8'});
	return target;
}

module.exports = {
	renderHtml,
	writeIndexHtml,
	writeDevHtml,
	usesCustomSkinTemplate,
	getCustomSkinHeadHtml,
	CUSTOM_SKIN_JS,
	CUSTOM_SKIN_CSS
};
