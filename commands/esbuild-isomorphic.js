/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
/**
 * `--isomorphic` prerendering for `enact pack --esbuild`. Server-renders the
 * app to static HTML per target locale (`-l`), producing per-locale variant
 * files plus a startup script that shows the prerendered markup immediately
 * and hydrates on the client — matching the webpack path's output shape
 * closely enough that webOS treats it as a prerendered app
 * (`appinfo.usePrerendering = true`, per-locale `main`).
 *
 * Reused as-is from @enact/dev-utils (bundler-agnostic, same as the Vite
 * isomorphic path reuses them): FileXHR.js, templates.js, parse-locales.js.
 *
 * The HTML-assembly/dedup logic below (`simplifyAliases`, `parsePrerender`,
 * `rootInjection`/`findRootDiv`, `language`) is ported near-verbatim from
 * PrerenderPlugin/index.js's private helpers — that module only exports its
 * webpack-Compiler-hook-shaped class, not these pure functions, so they
 * can't be required directly.
 *
 * NOT ported: the webpack-runtime-specific rewrites in the old
 * vdom-server-render.js (`__webpack_require__.e`, `webpackAsyncContext`) —
 * esbuild's CJS bundle has no such runtime to patch, same reasoning the Vite
 * isomorphic path uses for its own SSR bundle (see
 * docs/vite-isomorphic-scope.md).
 *
 * Scope: `--isomorphic --framework` combined is not supported — `--framework`
 * is dispatched before this module is ever reached (see esbuild-pack.js), so
 * the two are mutually exclusive by construction, matching the Vite path's
 * own precedence in `viteBuild`. `--isomorphic --externals` and `--snapshot`
 * (which implies isomorphic) ARE supported below, via esbuild-externals.js /
 * esbuild-snapshot.js. Auto-generating brand-new per-locale appinfo.json
 * files that don't already exist isn't ported — this pass only patches files
 * EsbuildWebOSMetaPlugin already emitted from the client build.
 */
const fs = require('fs');
const path = require('path');
// Plain `fs` above is used throughout this file (existing code); `fs-extra`
// is only needed for `copySync` when staging the externalized framework
// files into the output (mirrors esbuild-pack.js, which imports fs-extra as
// its `fs` directly — kept separate here rather than renaming this file's
// existing `fs` usages).
const fsExtra = require('fs-extra');
const importFresh = require('import-fresh');
const FileXHR = require('@enact/dev-utils/plugins/PrerenderPlugin/FileXHR');
const templates = require('@enact/dev-utils/plugins/PrerenderPlugin/templates');
const {optionParser: app} = require('@enact/dev-utils');
// Tolerant load, same reasoning/pattern as esbuild-pack.js and pack.js: only
// needed here by --isomorphic/--snapshot combined with --externals.
let viteFw;
try {
	viteFw = require('@enact/dev-utils/mixins/vite-framework');
} catch (e) {
	// Optional; see above. `--externals` throws a clear error if used without it.
}
const {writeEsbuildStatsReport} = require('./esbuild-stats');
const {applyEsbuildExternals, jsAssetUrls, markScriptsAsModule} = require('./esbuild-externals');
const {applyEsbuildSnapshotBuild, runMkSnapshot, writeSnapshotAppinfo} = require('./esbuild-snapshot');

let parseLocales;
try {
	({parseLocales} = require('@enact/dev-utils/plugins/PrerenderPlugin/parse-locales'));
} catch (e) {
	parseLocales = null;
}

// ---------------------------------------------------------------------
// Ported from PrerenderPlugin/index.js (pure functions; not separately
// exported by that module).
// ---------------------------------------------------------------------

// Extracts a valid language string from a locale.
function language (locale) {
	const matchLang = locale.match(/\b([a-z]{2})\b/);
	return matchLang && matchLang[1];
}

// Find the location of the root div (can be empty or with contents) and
// return the contents of the HTML before and after it.
function findRootDiv (html, start, end) {
	if (/^<div[^>]+id="root"/i.test(html.substring(start, end + 7))) {
		return {before: html.substring(0, start), after: html.substring(end + 6)};
	}
	const a = html.indexOf('<div', start + 4);
	const b = html.lastIndexOf('</div>', end);
	if (a >= 0 && b >= 0 && a < b) {
		return findRootDiv(html, a, b);
	}
}

function rootInjection (html) {
	const rootDiv = findRootDiv(html);
	return function (prerender) {
		if (rootDiv) {
			return rootDiv.before + '<div id="root">' + prerender + '</div>' + rootDiv.after;
		}
		throw new Error('esbuild-isomorphic: Unable to find root div element. Please verify it exists in index.html.');
	};
}

// Parse the prerendered HTML to extract any header elements (e.g. a font
// generator's <style> block, wrapped in "head append" markers by
// renderLocale below).
function parsePrerender (html) {
	const elementParse = /<([^/][^>]*)\/*>([^<]*)/g;
	const head = [];
	const prerender = html.replace(/<!-- head append start -->([\s\S]*)<!-- head append end -->/, (m, content) => {
		let match;
		while ((match = elementParse.exec(content))) {
			const tokens = match[1].split(/\s+/);
			head.push({
				tagName: tokens.shift(),
				closeTag: !match[1].endsWith('/'),
				attributes: tokens.reduce((result, curr) => {
					const [, key, value] = curr.replace(/[/]$/, '').match(/^([^=]*)(?:="(.*)")*/);
					return Object.assign(result, {[key]: value !== undefined ? value : 'true'});
				}, {}),
				innerHTML: match[1].endsWith('/') ? '' : match[2].replace(/^\s+|\s+$/g, '')
			});
		}
		return '';
	});
	return {head, prerender};
}

// Simplified stand-in for html-webpack-plugin's htmlTagObjectToString.
function headTagToString (tag) {
	const attrs = Object.keys(tag.attributes)
		.map(k => (tag.attributes[k] === 'true' ? ` ${k}` : ` ${k}="${tag.attributes[k]}"`))
		.join('');
	if (!tag.closeTag) return `<${tag.tagName}${attrs}/>`;
	return `<${tag.tagName}${attrs}>${tag.innerHTML}</${tag.tagName}>`;
}

// Simplifies and groups the locales and aliases to ensure minimal output
// needed — ported verbatim from PrerenderPlugin/index.js.
function simplifyAliases (locales, status) {
	const links = {};
	const sharedCSS = {};
	const common = (a, b) => a.filter(b.includes.bind(b));
	const remove = (targets, classes) =>
		classes
			.split(/\s+/)
			.filter(c => !targets.includes(c))
			.join(' ');
	let multiCount = 1;

	// First pass: simplify alias names to language designations or 'multi' for multi-language groupings.
	// Additionally determines all shared root CSS classes for the groupings.
	for (let i = 0; i < status.alias.length; i++) {
		if (status.alias[i]) {
			const lang = language(locales[i]);
			if (!links[status.alias[i]]) {
				const alias = language(status.alias[i]);
				let regionCount = 0;
				for (const x in links) {
					if (links[x] === alias || links[x].indexOf(alias + '.') === 0) {
						regionCount++;
					}
				}
				links[status.alias[i]] = regionCount > 0 ? alias + '.' + (regionCount + 1) : alias;
			}
			if (links[status.alias[i]].indexOf(lang) !== 0 && links[status.alias[i]].indexOf('multi') !== 0) {
				if (multiCount > 1) {
					links[status.alias[i]] = 'multi.' + multiCount;
				} else {
					links[status.alias[i]] = 'multi';
				}
				multiCount++;
			}

			status.attr[i].classes = status.attr[i].classes || '';
			if (!sharedCSS[status.alias[i]]) {
				sharedCSS[status.alias[i]] = common(
					status.attr[i].classes.split(/\s+/),
					status.attr[locales.indexOf(status.alias[i])].classes.split(/\s+/)
				);
			} else {
				sharedCSS[status.alias[i]] = common(sharedCSS[status.alias[i]], status.attr[i].classes.split(/\s+/));
			}
		}
	}

	// Second pass: with the shared root CSS classes determined, remove from the individual class strings
	// and update the alias names to the new simplified names.
	for (let j = 0; j < status.alias.length; j++) {
		if (status.alias[j]) {
			if (sharedCSS[status.alias[j]]) {
				status.attr[j].classes = remove(sharedCSS[status.alias[j]], status.attr[j].classes);
			}
			if (links[status.alias[j]]) {
				status.alias[j] = links[status.alias[j]];
			}
		}
	}

	// For every grouping processed, create new faux-locale entries to generate html files for, and
	// re-insert the common root CSS classes back into the shared prerendered html code.
	for (const l in links) {
		const index = locales.indexOf(l);
		status.alias[index] = links[l];
		status.attr[index].classes = remove(sharedCSS[l], status.attr[index].classes);
		locales.push(links[l]);
		if (sharedCSS[l] && sharedCSS[l].length > 0) {
			status.prerender[locales.length - 1] = status.prerender[index].replace(
				/(<div[^>]*class="[^"]*)"/i,
				'$1 ' + sharedCSS[l].join(' ') + '"'
			);
		} else {
			status.prerender[locales.length - 1] = status.prerender[index];
		}
		status.prerender[index] = undefined;
	}
}

// ---------------------------------------------------------------------
// Server render. Replaces vdom-server-render.js's stage()/render(): no
// staging step is needed since esbuild already wrote the SSR bundle to
// disk, and none of the webpack-runtime string rewrites apply to an
// esbuild CJS bundle.
// ---------------------------------------------------------------------
function renderLocale ({ssrBundlePath, locale, ReactDOMServer}) {
	if (locale) {
		global.XMLHttpRequest = FileXHR;
	} else {
		delete global.XMLHttpRequest;
	}

	let style;
	try {
		if (app.fontGenerator) {
			const generator = require(path.resolve(app.fontGenerator));
			const loc = locale || 'en-US';
			style = generator(loc);
			if (generator.fontOverrideGenerator) style += generator.fontOverrideGenerator(loc);
		}
	} catch (e) {
		// No font generator configured, or it failed to load; proceed without it.
	}

	global.process.env.LANG = locale;

	const chunk = importFresh(ssrBundlePath);
	let rendered = ReactDOMServer.renderToString(chunk.default || chunk);

	if (style) {
		rendered = '<!-- head append start -->\n' + style + '\n<!-- head append end -->' + rendered;
	}

	// If --expose-gc is used in NodeJS, force garbage collect after prerender for minimal memory usage.
	if (global.gc) global.gc();

	return rendered;
}

async function esbuildIsomorphicBuild (opts, chalk, esbuild, configFactory) {
	if (!parseLocales) {
		throw new Error(
			'esbuild-isomorphic: could not load ' +
			'@enact/dev-utils/plugins/PrerenderPlugin/parse-locales — please update @enact/dev-utils.'
		);
	}

	// --snapshot + --externals is unsupported (the snapshot must embed
	// @enact, not externalize it) — matches the webpack/Vite paths'
	// `opts.snapshot && !opts.externals` guard.
	if (opts.snapshot && opts.externals) {
		console.log(
			chalk.yellow(
				'NOTICE: --snapshot with --externals is not supported; the snapshot must embed @enact. ' +
				'Building without a snapshot.'
			)
		);
	}

	const output = opts.output ? path.resolve(opts.output) : path.resolve('./dist');
	// Match the Vite path's default (pack.js's `viteIsomorphic`): --isomorphic/--snapshot
	// without an explicit --locales still prerenders, defaulting to en-US, rather than
	// silently skipping prerendering and falling back to a plain client build.
	const locales = opts.locales ? parseLocales(app.context, opts.locales) || ['en-US'] : ['en-US'];

	console.log(
		opts.snapshot && !opts.externals ?
			`Creating a V8 snapshot production build (${locales.length} locale(s))...` :
			opts.production ?
				`Creating an optimized isomorphic build (${locales.length} locale(s))...` :
				`Creating an isomorphic build (${locales.length} locale(s))...`
	);

	// Remove all content but keep the directory so that if you're in it, you
	// don't end up in Trash (matches the plain esbuild pack path).
	await fs.promises.rm(output, {recursive: true, force: true});

	// 1. Client build (hydration shell). isomorphic=true makes the app's
	// entry guard createRoot/hydrateRoot behind `typeof window` +
	// ENACT_PACK_ISOMORPHIC and call hydrateRoot once loaded.
	const clientOptions = configFactory(
		opts.production ? 'production' : 'development',
		!opts.linting,
		opts['content-hash'],
		true,
		!opts.animation,
		!opts['split-css'],
		opts['ilib-additional-path'],
		opts.locales,
		opts.output,
		Boolean(opts.externals && opts['externals-polyfill'])
	);
	if (opts.entry || app.entry) {
		clientOptions.entryPoints = {main: path.resolve(opts.entry || app.entry)};
	}
	// --no-minify: same override as the plain esbuild pack path (see
	// esbuild-pack.js) — config/esbuild.config.js doesn't know about this
	// CLI flag on its own, and the enact-terser plugin (ENACT_ESBUILD_MINIFY=
	// terser) needs stripping separately since it's baked in at build time.
	if (!opts.minify) {
		clientOptions.minify = false;
		clientOptions.plugins = clientOptions.plugins.filter(p => p.name !== 'enact-terser');
	}

	// --externals: externalize the shared framework out of the CLIENT build
	// (the browser loads it via import map); the SSR build below always
	// bundles @enact so it can render server-side. Both reuse `configFactory`
	// (same rootContext), so CSS-module hashes stay consistent between them.
	const collected = new Set();
	let manifest = null;
	if (opts.externals) {
		if (!viteFw) {
			throw new Error(
				'--externals requires @enact/dev-utils/mixins/vite-framework, which is not available. ' +
				'Update @enact/dev-utils to a version that includes it.'
			);
		}
		manifest = viteFw.readManifest(path.resolve(opts.externals));
		applyEsbuildExternals(clientOptions, collected, manifest, {polyfill: opts['externals-polyfill']});
	}
	// --snapshot: build the client as a self-contained bundle (global `App`)
	// that mksnapshot can snapshot. Implies isomorphic; combined with
	// --externals is unsupported (NOTICE'd above) — the snapshot must embed
	// @enact, not externalize it.
	if (opts.snapshot && !opts.externals) {
		// No `serverEntry` variable exists in this file (unlike pack.js's
		// `viteIsomorphic`) — the rest of this module instead falls back to
		// `app.context` itself (a directory; esbuild resolves it the same way
		// as any other directory entry point) whenever neither `--entry` nor
		// the package's `entry` field is set, so the snapshot entry mirrors
		// that same convention rather than inventing a different default.
		applyEsbuildSnapshotBuild(clientOptions, {context: app.context, appEntry: opts.entry || app.entry || app.context});
	}

	const clientResult = await esbuild.build(clientOptions);

	// Inject the framework import map (+ shared stylesheet) into the client
	// index.html BEFORE the isomorphic assembly below transforms it into the
	// fallback/variant files, and mark its own bundle script as a module —
	// applyEsbuildExternals switches the client build to ESM output, which a
	// plain (non-module) `<script defer>` tag can't parse.
	if (opts.externals) {
		let base = opts['externals-public'];
		if (!base) {
			fsExtra.copySync(path.resolve(opts.externals), path.join(output, 'framework'), {dereference: true});
			base = './framework';
		}
		const indexHtmlPath = path.join(output, 'index.html');
		markScriptsAsModule(indexHtmlPath, jsAssetUrls(clientResult.metafile, output, clientOptions.publicPath));
		viteFw.injectHtml(indexHtmlPath, manifest, collected, base);
	}

	// 2. SSR build — same transform pipeline (Babel, CSS Modules), which
	// matters: both builds must produce identical CSS-module class names for
	// the prerendered markup to match what the client then hydrates onto.
	// platform:'node'/format:'cjs'/no minify come from ENACT_ESBUILD_SSR
	// inside config/esbuild.config.js; written to a throwaway directory.
	process.env.ENACT_ESBUILD_SSR = 'true';
	let ssrOptions;
	try {
		ssrOptions = configFactory(
			opts.production ? 'production' : 'development',
			true,
			opts['content-hash'],
			true,
			!opts.animation,
			!opts['split-css'],
			opts['ilib-additional-path'],
			opts.locales,
			opts.output
		);
		if (opts.entry || app.entry) {
			ssrOptions.entryPoints = {main: path.resolve(opts.entry || app.entry)};
		}
		await esbuild.build(ssrOptions);
	} finally {
		delete process.env.ENACT_ESBUILD_SSR;
	}

	const ssrBundlePath = path.join(ssrOptions.outdir, 'main.js');
	const ReactDOMServer = importFresh(require.resolve('react-dom/server', {paths: [app.context]}));

	// 3. Prerender each locale, deduping identical renders.
	const status = {prerender: [], attr: [], alias: []};
	for (let i = 0; i < locales.length; i++) {
		let appHtml;
		try {
			appHtml = renderLocale({ssrBundlePath, locale: locales[i], ReactDOMServer});
		} catch (e) {
			throw new Error(`Unable to prerender locale "${locales[i]}": ${e.stack || e.message || e}`);
		}

		status.attr[i] = {classes: ''};
		appHtml = appHtml.replace(
			/(<div[^>]*class="((?!enact-locale-)[^"])*)(\senact-locale-[^"]*)"/i,
			(match, before, s, classAttr) => {
				status.attr[i].classes = classAttr;
				return before + '"';
			}
		);

		const index = status.prerender.indexOf(appHtml);
		if (index === -1) {
			status.prerender[i] = appHtml;
		} else {
			status.alias[i] = locales[index];
		}
	}
	simplifyAliases(locales, status);

	// 4. HTML assembly: strip the client's own <script> tag from index.html
	// (the startup script loads it asynchronously instead, so the browser
	// paints the prerendered markup first), then inject prerendered markup
	// per locale.
	const indexHtmlPath = path.join(output, 'index.html');
	const baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
	const jsAssets = Object.keys(clientResult.metafile.outputs)
		.filter(f => f.endsWith('.js') && !f.endsWith('.map'))
		.map(f => `${clientOptions.publicPath}/${path.relative(output, path.resolve(f))}`.replace(/\\/g, '/'));

	// `moduleType`: esbuild's *default* client-build format (no --externals,
	// no --snapshot) is a self-contained IIFE, so the dynamically-loaded
	// script is correctly classic there — unlike Vite, whose Rollup output is
	// ESM by default regardless, hence its own startup script is always
	// `type="module"` (see vite-isomorphic.js's `assemble`). Only
	// `applyEsbuildExternals` switches this build's format to ESM (bare
	// specifiers resolved via the import map above), so only that case needs
	// the dynamically-created script marked as a module too.
	const startupScript = `<script type="text/javascript">${templates.startup(app.screenTypes, jsAssets, Boolean(opts.externals))}</script>`;
	let shellHtml = baseHtml.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
	shellHtml = shellHtml.includes('</head>') ? shellHtml.replace('</head>', `${startupScript}</head>`) : shellHtml + startupScript;

	const applyToRoot = rootInjection(shellHtml);

	for (let i = 0; i < locales.length; i++) {
		if (!status.prerender[i] || status.alias[i]) continue;

		const linked = status.alias.reduce((acc, a, idx) => {
			if (a === locales[i]) acc.push(idx);
			return acc;
		}, []);

		if (linked.length === 0) {
			// Single locale, re-inject root classes.
			status.prerender[i] = status.prerender[i].replace(
				/(<div[^>]*class="[^"]*)"/i,
				'$1' + status.attr[i].classes + '"'
			);
		}

		const mapping = linked.length ?
			linked.reduce((m, c) => Object.assign(m, {[locales[c].toLowerCase()]: status.attr[c]}), {}) :
			undefined;

		const parsed = parsePrerender(status.prerender[i]);
		const updater = templates.update(mapping, false, parsed.prerender);

		let html = applyToRoot(parsed.prerender);
		if (parsed.head.length) {
			const headStr = parsed.head.map(headTagToString).join('');
			html = html.includes('</head>') ? html.replace('</head>', `${headStr}</head>`) : html;
		}
		if (updater) {
			const updaterTag = `<script type="text/javascript">${updater}</script>`;
			html = html.includes('</body>') ? html.replace('</body>', `${updaterTag}</body>`) : html + updaterTag;
		}

		if (locales.length === 1) {
			fs.writeFileSync(indexHtmlPath, html);
		} else {
			fs.writeFileSync(path.join(output, `index.${locales[i]}.html`), html);
		}
	}

	// With multiple locales, index.html is always the bare (unprerendered)
	// fallback shell; a single locale writes its prerender straight to it above.
	if (locales.length > 1) {
		fs.writeFileSync(indexHtmlPath, shellHtml);

		const mapper = (m, c, i) =>
			status.alias.includes(c) ? m : Object.assign(m, {[c]: `index.${status.alias[i] || c}.html`});
		const mapping = {fallback: 'index.html', locales: locales.reduce(mapper, {})};
		fs.writeFileSync(path.join(output, 'locale-map.json'), JSON.stringify(mapping, null, '\t'));
	}

	// 5. webOS meta coupling: patch the root appinfo.json + per-locale
	// appinfo.json files EsbuildWebOSMetaPlugin already emitted from the
	// client build (see the file-level comment for what's not ported).
	const rootAppInfoPath = path.join(output, 'appinfo.json');
	if (fs.existsSync(rootAppInfoPath)) {
		const info = JSON.parse(fs.readFileSync(rootAppInfoPath, 'utf8'));
		if (typeof info.usePrerendering === 'undefined') info.usePrerendering = true;
		fs.writeFileSync(rootAppInfoPath, JSON.stringify(info, null, '\t'));
	}
	for (let i = 0; i < locales.length; i++) {
		const loc = status.alias[i] || locales[i];
		if (String(loc).indexOf('multi') === 0) continue;
		const localizedAppInfoPath = path.join(output, 'resources', locales[i].replace(/-/g, path.sep), 'appinfo.json');
		if (fs.existsSync(localizedAppInfoPath)) {
			const info = JSON.parse(fs.readFileSync(localizedAppInfoPath, 'utf8'));
			info.main = `index.${loc}.html`;
			fs.writeFileSync(localizedAppInfoPath, JSON.stringify(info, null, '\t'));
		}
	}

	// Clean up the throwaway SSR build directory.
	await fs.promises.rm(ssrOptions.outdir, {recursive: true, force: true});

	// 6. V8 snapshot: run mksnapshot against the self-contained client bundle
	// and record the blob in appinfo.json. Requires the webOS `V8_MKSNAPSHOT`
	// toolchain; without it the build still succeeds and the startup script
	// falls back to loading main.js (classic <script>) at runtime.
	if (opts.snapshot && !opts.externals) {
		const snapshotResult = runMkSnapshot({outDir: output});
		if (snapshotResult.ok) {
			writeSnapshotAppinfo({outDir: output, blob: snapshotResult.blob});
			console.log(chalk.green(`Generated V8 snapshot blob (${snapshotResult.blob}) and tagged appinfo.json.`));
		} else {
			console.log(
				chalk.yellow(`V8 snapshot blob not generated: ${snapshotResult.error.message.split('\n')[0]}`)
			);
			console.log(
				chalk.yellow('Set V8_MKSNAPSHOT to the webOS mksnapshot binary to emit the blob; the app runs without it.')
			);
		}
	}

	console.log(chalk.green(`Compiled successfully. Prerendered ${locales.length} locale${locales.length === 1 ? '' : 's'}.`));
	console.log();

	if (opts.stats) {
		// Only the client bundle is meaningful to report on — the SSR build
		// is a throwaway Node-only bundle used solely for rendering.
		const reportPath = writeEsbuildStatsReport(clientResult.metafile, output, app.context);
		if (reportPath) {
			console.log(chalk.dim(`Bundle stats written to ${path.relative(app.context, reportPath)}`));
			console.log();
		}
	}
}

module.exports = {esbuildIsomorphicBuild};