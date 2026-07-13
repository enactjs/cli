const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

const PROPS = [
	'icon',
	'largeIcon',
	'extraLargeIcon',
	'miniicon',
	'smallicon',
	'splashicon',
	'splashBackground',
	'bgImage',
	'imageForRecents'
];

let sysAssetsPath = 'sys-assets';
let variableSysPaths = null;
const assetPathCache = {};

function readAppInfo (file) {
	if (!fs.existsSync(file)) return null;
	try {
		return JSON.parse(fs.readFileSync(file, {encoding: 'utf8'}));
	} catch (e) {
		console.log('ERROR: unable to read/parse appinfo.json at ' + file);
		return null;
	}
}

function handleSysAssetPath (context, appinfo) {
	if (appinfo.sysAssetsBasePath && appinfo.sysAssetsBasePath !== sysAssetsPath) {
		sysAssetsPath = appinfo.sysAssetsBasePath;
		variableSysPaths = null;
	}
	const sys = path.join(context, sysAssetsPath);
	if (!variableSysPaths && fs.existsSync(sys)) {
		variableSysPaths = fs.readdirSync(sys)
			.map(name => path.join(context, sysAssetsPath, name))
			.filter(entry => fs.statSync(entry).isDirectory());
	}
}

function detectSysAssets (name) {
	const result = [];
	const trueName = name.substring(1);
	for (const dir of variableSysPaths || []) {
		const abs = path.resolve(path.join(dir, trueName));
		if (fs.existsSync(abs)) {
			result.push(abs);
		}
	}
	return result;
}

function rootAppInfo (context, specific) {
	const rootDir = [context, path.join(context, 'webos-meta')];
	if (specific) {
		rootDir.unshift(path.isAbsolute(specific) ? specific : path.join(context, specific));
	}
	for (const root of rootDir) {
		const meta = readAppInfo(path.join(root, 'appinfo.json'));
		if (meta) {
			return {path: root, obj: meta};
		}
	}
	return null;
}

function copyMetaAsset (abs, outPath, output) {
	const dest = path.join(output, outPath);
	fs.ensureDirSync(path.dirname(dest));
	if (!fs.existsSync(dest)) {
		fs.copySync(abs, dest, {dereference: true});
	}
}

function addMetaAssets (metaDir, outDirPrefix, appinfo, output) {
	for (const prop of PROPS) {
		if (!appinfo[prop]) continue;
		const assets = appinfo[prop].charAt(0) === '$'
			? detectSysAssets(appinfo[prop])
			: [path.resolve(path.join(metaDir, appinfo[prop]))];

		for (const abs of assets) {
			if (appinfo[prop].charAt(0) === '$') {
				if (!assetPathCache[abs]) {
					assetPathCache[abs] = path.relative(metaDir, abs).replace(/\\/g, '/');
				}
			} else if (assetPathCache[abs]) {
				appinfo[prop] = path.relative(outDirPrefix || output, assetPathCache[abs]).replace(/\\/g, '/');
			} else {
				assetPathCache[abs] = path.join(outDirPrefix || '', appinfo[prop]).replace(/\\/g, '/');
			}

			if (fs.existsSync(abs)) {
				copyMetaAsset(abs, assetPathCache[abs], output);
			}
		}
	}
}

function applyWebOSMeta (context, output, options = {}) {
	sysAssetsPath = 'sys-assets';
	variableSysPaths = null;
	Object.keys(assetPathCache).forEach(key => delete assetPathCache[key]);

	const meta = rootAppInfo(context, options.path);
	if (meta && meta.obj) {
		let appinfo = {...meta.obj};
		if (options.v8SnapshotFile) {
			appinfo.v8SnapshotFile = options.v8SnapshotFile;
		}
		handleSysAssetPath(context, appinfo);
		addMetaAssets(meta.path, '', appinfo, output);
		fs.writeFileSync(path.join(output, 'appinfo.json'), JSON.stringify(appinfo, null, '\t') + '\n', {encoding: 'utf8'});
	}

	const localized = glob.sync('resources/**/appinfo.json', {cwd: context, absolute: true});
	for (const locFile of localized) {
		const locRel = path.relative(context, locFile).replace(/\\/g, '/');
		const locMeta = readAppInfo(locFile);
		if (!locMeta) continue;

		handleSysAssetPath(context, locMeta);
		addMetaAssets(path.dirname(locFile), path.dirname(locRel), locMeta, output);
		fs.ensureDirSync(path.join(output, path.dirname(locRel)));
		fs.writeFileSync(path.join(output, locRel), JSON.stringify(locMeta, null, '\t') + '\n', {encoding: 'utf8'});
	}

	return meta && meta.obj && meta.obj.title;
}

module.exports = {applyWebOSMeta, rootAppInfo, readAppInfo};
