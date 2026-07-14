const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const app = require('@enact/dev-utils/option-parser');

function packageSearch (dir, pkg) {
	const root = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
	dir = root;
	while (dir.length > 0 && dir !== path.dirname(dir)) {
		const full = path.join(dir, 'node_modules', pkg);
		if (fs.existsSync(full)) {
			return path.relative(root, full).replace(/\\/g, '/');
		}
		dir = path.dirname(dir);
	}
	return null;
}

function hasLocaleMatchJson (ilibPath) {
	return fs.existsSync(path.join(ilibPath, 'locale', 'localematch.json'));
}

function transformPath (context, file) {
	return path
		.relative(context, file)
		.replace(/\\/g, '/')
		.replace(/\.\.(\/)?/g, '_$1');
}

function bundleConst (name) {
	return (
		'ILIB_' +
		path.basename(name).toUpperCase().replace(/[-_\s]/g, '_') +
		'_PATH'
	);
}

function resolveBundlePath ({dir, context, publicPath, relative, symlinks = true}) {
	if (path.isAbsolute(dir)) {
		return JSON.stringify(dir.replace(/\\/g, '/'));
	}
	let full = path.join(context, dir);
	if (fs.existsSync(full)) {
		if (symlinks) {
			full = fs.realpathSync(full);
		}
	} else {
		full = dir;
	}
	if (relative) {
		return JSON.stringify(transformPath(context, full));
	}
	return JSON.stringify(path.join(publicPath || '/', transformPath(context, full)).replace(/\\/g, '/'));
}

function findIlibPath (context) {
	const candidates = [
		packageSearch(context, path.join('@enact', 'i18n', 'ilib')),
		packageSearch(context, 'ilib'),
		fs.existsSync(path.join(context, 'ilib')) && 'ilib'
	].filter(Boolean);

	for (const rel of candidates) {
		const full = path.join(context, rel);
		if (fs.existsSync(full) && hasLocaleMatchJson(fs.realpathSync(full))) {
			return rel;
		}
	}

	return candidates[0] || null;
}

function resolveIlibFsPath (context) {
	const candidates = [];
	const fromEnact = packageSearch(context, path.join('@enact', 'i18n', 'ilib'));
	const standalone = packageSearch(context, 'ilib');

	if (fromEnact) candidates.push(fromEnact);
	if (standalone && standalone !== fromEnact) candidates.push(standalone);
	if (fs.existsSync(path.join(context, 'ilib'))) {
		candidates.push('ilib');
	}

	for (const rel of candidates) {
		const full = path.join(context, rel);
		if (!fs.existsSync(full)) continue;

		const resolved = fs.realpathSync(full).replace(/\\/g, '/');
		if (hasLocaleMatchJson(resolved)) {
			return resolved;
		}
	}

	return null;
}

function readManifestFiles (manifestPath) {
	if (!fs.existsSync(manifestPath)) return [];
	const data = JSON.parse(fs.readFileSync(manifestPath, {encoding: 'utf8'}));
	return data.files || [];
}

function emitManifestAssets (context, output, manifestPath, cache) {
	const dir = path.dirname(manifestPath);
	const relManifest = transformPath(context, manifestPath);
	const outManifest = path.join(output, relManifest);
	fs.ensureDirSync(path.dirname(outManifest));

	if (!cache || !fs.existsSync(outManifest) || fs.statSync(manifestPath).mtimeMs > fs.statSync(outManifest).mtimeMs) {
		fs.copySync(manifestPath, outManifest, {dereference: true});
	}

	for (const file of readManifestFiles(manifestPath)) {
		const src = path.join(dir, file);
		const dest = path.join(output, transformPath(context, src));
		if (!fs.existsSync(src)) continue;
		fs.ensureDirSync(path.dirname(dest));
		if (!cache || !fs.existsSync(dest) || fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs) {
			fs.copySync(src, dest, {dereference: true});
		}
	}
}

function ensureManifest (manifestPath, create) {
	if (fs.existsSync(manifestPath)) return manifestPath;
	const dir = path.dirname(manifestPath);
	let files = [];
	if (fs.existsSync(dir)) {
		files = glob.sync('./**/!(appinfo).json', {cwd: dir, onlyFiles: true}).map(f => f.replace(/^\.\//, ''));
	}
	if (create) {
		fs.ensureDirSync(dir);
		fs.writeFileSync(manifestPath, JSON.stringify({files}, null, '\t') + '\n', {encoding: 'utf8'});
	}
	return manifestPath;
}

function getIlibDefines (context, publicPath, options = {}) {
	const ilibDir = options.ilib || findIlibPath(context);
	if (!ilibDir) return {};

	const defines = {
		ILIB_BASE_PATH: resolveBundlePath({dir: ilibDir, context, publicPath}),
		ILIB_RESOURCES_PATH: resolveBundlePath({dir: options.resources || 'resources', context, publicPath}),
		ILIB_CACHE_ID: JSON.stringify(String(Date.now())),
		ILIB_NO_ASSETS: JSON.stringify(false)
	};

	if (options.ilibAdditionalResourcesPath) {
		defines.ILIB_ADDITIONAL_RESOURCES_PATH = JSON.stringify(options.ilibAdditionalResourcesPath.replace(/\\/g, '/'));
	}

	defines[bundleConst(app.name || 'app')] = defines.ILIB_RESOURCES_PATH;

	let pkgDir = context;
	for (let t = app.theme; t; t = t.theme) {
		const themeDir = packageSearch(pkgDir, t.name);
		if (themeDir) {
			defines[bundleConst(t.name)] = resolveBundlePath({
				dir: path.join(themeDir, 'resources'),
				context,
				publicPath
			});
			pkgDir = path.dirname(path.join(context, themeDir));
		}
	}

	return defines;
}

function applyIlibResources (context, output, options = {}) {
	const ilibDir = options.ilib || findIlibPath(context);
	if (!ilibDir) return;

	const create = options.create !== false;
	const cache = options.cache !== false;
	const manifests = [];

	const ilibPath = path.join(context, ilibDir);
	if (fs.existsSync(ilibPath)) {
		const ilibManifest = path.join(ilibPath, 'locale', 'ilibmanifest.json');
		manifests.push(ensureManifest(ilibManifest, create));
	}

	const resourcesManifest = path.join(context, options.resources || 'resources', 'ilibmanifest.json');
	manifests.push(ensureManifest(resourcesManifest, create));

	let pkgDir = context;
	for (let t = app.theme; t; t = t.theme) {
		const themeDir = packageSearch(pkgDir, t.name);
		if (themeDir) {
			const themeManifest = path.join(context, themeDir, 'resources', 'ilibmanifest.json');
			manifests.push(ensureManifest(themeManifest, create));
			pkgDir = path.dirname(path.join(context, themeDir));
		}
	}

	for (const manifest of manifests) {
		if (fs.existsSync(manifest)) {
			emitManifestAssets(context, output, manifest, cache);
		}
	}
}

module.exports = {getIlibDefines, applyIlibResources, findIlibPath, resolveIlibFsPath, bundleConst};
