const path = require('path');

const FRAMEWORK_LIBRARIES = [
	'react',
	'react-dom',
	'react-dom/client',
	'react-dom/server',
	'react-is',
	'ilib',
	'@enact/core',
	'@enact/i18n',
	'@enact/spotlight',
	'@enact/ui'
];

function normalizePublicPath (publicPath) {
	if (!publicPath || publicPath === '/') return '';
	const normalized = publicPath.replace(/\\/g, '/');
	return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function getFrameworkPublicPath (externalsPath, externalsPublic) {
	if (externalsPublic) {
		return normalizePublicPath(externalsPublic);
	}
	if (!externalsPath) return null;
	return normalizePublicPath(path.relative(process.cwd(), path.resolve(externalsPath)).replace(/\\/g, '/'));
}

function getExternalAssets (externalsPath, externalsPublic) {
	const publicPath = getFrameworkPublicPath(externalsPath, externalsPublic);
	if (!publicPath) return null;

	return {
		publicPath,
		scripts: [`${publicPath}/enact.js`],
		styles: [`${publicPath}/enact.css`]
	};
}

function getExternalPackages () {
	return [...FRAMEWORK_LIBRARIES];
}

module.exports = {
	FRAMEWORK_LIBRARIES,
	getExternalAssets,
	getExternalPackages,
	getFrameworkPublicPath
};
