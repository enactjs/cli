const fs = require('fs');
const path = require('path');

// Do not include "build" — some apps use that as a legitimate source folder name.
const IGNORE_DIR_NAMES = new Set([
	'node_modules',
	'dist',
	'.git',
	'.cache',
	'coverage',
	'tmp',
	'temp'
]);

const WATCH_EXTENSIONS = /\.(js|jsx|mjs|cjs|ts|tsx|json|css|less|scss|sass|html|ejs|md|txt)$/i;

function normalizePath (filePath) {
	return path.resolve(filePath).replace(/\\/g, '/');
}

function shouldIgnoreRelative (relativePath) {
	const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
	return parts.some(part => IGNORE_DIR_NAMES.has(part));
}

function isWatchableFile (relativePath) {
	const base = path.basename(relativePath);
	if (base.startsWith('.env')) {
		return true;
	}
	return WATCH_EXTENSIONS.test(relativePath);
}

/**
 * Resolve @enact/* packages that are symlinks/junctions (or otherwise realpath
 * outside node_modules) so framework edits trigger pack/serve rebuilds.
 * webpack watched the resolved module graph; Bun only watches explicit roots.
 */
function getLinkedEnactWatchRoots (context) {
	const roots = [];
	const seen = new Set();
	const enactScope = path.join(path.resolve(context), 'node_modules', '@enact');

	if (!fs.existsSync(enactScope)) {
		return roots;
	}

	let entries;
	try {
		entries = fs.readdirSync(enactScope);
	} catch (_e) {
		return roots;
	}

	for (const name of entries) {
		const pkgPath = path.join(enactScope, name);
		let realPath;
		try {
			const stat = fs.lstatSync(pkgPath);
			if (!stat.isDirectory() && !stat.isSymbolicLink()) {
				continue;
			}
			realPath = fs.realpathSync(pkgPath);
		} catch (_e) {
			continue;
		}

		const normalizedPkg = normalizePath(pkgPath);
		const normalizedReal = normalizePath(realPath);
		if (normalizedReal === normalizedPkg || seen.has(normalizedReal)) {
			continue;
		}

		seen.add(normalizedReal);
		roots.push(realPath);
	}

	return roots;
}

function collectWatchRoots (context, additionalModulePaths = []) {
	const roots = [path.resolve(context)];
	const seen = new Set([normalizePath(context)]);

	const add = dir => {
		if (!dir) return;
		const resolved = path.resolve(dir);
		const key = normalizePath(resolved);
		if (seen.has(key) || !fs.existsSync(resolved)) return;
		seen.add(key);
		roots.push(resolved);
	};

	if (Array.isArray(additionalModulePaths)) {
		for (const modulePath of additionalModulePaths) {
			add(modulePath);
		}
	}

	for (const linked of getLinkedEnactWatchRoots(context)) {
		add(linked);
	}

	return roots;
}

/**
 * Watch project roots and invoke onChange (debounced) when source files change.
 * Bun.build has no watch/onRebuild API, so pack/serve use this instead.
 */
function createFileWatcher (roots, options = {}) {
	const debounceMs = options.debounceMs ?? 200;
	const onChange = options.onChange;
	const ignoreAbsolute = (options.ignorePaths || []).map(normalizePath);
	const filter = options.filter;

	let timer = null;
	let closed = false;
	let pending = new Set();
	const watchers = [];

	const isIgnoredAbsolute = absPath => {
		const normalized = normalizePath(absPath);
		return ignoreAbsolute.some(
			ignored => normalized === ignored || normalized.startsWith(`${ignored}/`)
		);
	};

	const flush = () => {
		timer = null;
		if (closed || !onChange || pending.size === 0) {
			pending.clear();
			return;
		}
		const files = [...pending];
		pending.clear();
		Promise.resolve(onChange(files)).catch(err => {
			console.error('Watch rebuild failed:', err);
		});
	};

	const queue = (root, filename) => {
		if (!filename || closed) return;

		const relative = String(filename).replace(/\\/g, '/');
		if (shouldIgnoreRelative(relative) || !isWatchableFile(relative)) {
			return;
		}

		const absolute = normalizePath(path.join(root, filename));
		if (isIgnoredAbsolute(absolute)) {
			return;
		}
		if (filter && !filter(absolute, relative)) {
			return;
		}

		pending.add(absolute);
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(flush, debounceMs);
	};

	for (const root of roots) {
		const resolvedRoot = path.resolve(root);
		if (!fs.existsSync(resolvedRoot)) {
			continue;
		}

		try {
			const watcher = fs.watch(resolvedRoot, {recursive: true}, (_eventType, filename) => {
				queue(resolvedRoot, filename);
			});
			watcher.on('error', err => {
				console.warn(`File watcher error (${resolvedRoot}):`, err.message);
			});
			watchers.push(watcher);
		} catch (err) {
			console.warn(`Unable to watch ${resolvedRoot}:`, err.message);
		}
	}

	return {
		close () {
			closed = true;
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			pending.clear();
			for (const watcher of watchers) {
				watcher.close();
			}
			watchers.length = 0;
		}
	};
}

module.exports = {
	createFileWatcher,
	shouldIgnoreRelative,
	isWatchableFile,
	getLinkedEnactWatchRoots,
	collectWatchRoots
};
