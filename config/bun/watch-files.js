const fs = require('fs');
const path = require('path');

const IGNORE_DIR_NAMES = new Set([
	'node_modules',
	'dist',
	'.git',
	'.cache',
	'coverage',
	'build',
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

module.exports = {createFileWatcher, shouldIgnoreRelative, isWatchableFile};
