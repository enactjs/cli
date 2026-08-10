/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
/**
 * `--stats` for `enact pack --esbuild`. Webpack's counterpart runs
 * webpack-bundle-analyzer to produce a static `stats.html`; there's no
 * esbuild equivalent bundled with esbuild itself, and rather than guess at
 * a third-party package's exact API without being able to verify it against
 * whatever version is actually installed (see the postcss-import/postcss-url
 * lessons from earlier in this migration), this builds an equivalent report
 * directly from esbuild's own `metafile` — which already contains, per
 * output file, the exact byte contribution of every input module
 * (`outputs[file].inputs[inputPath].bytesInOutput`). No new dependency.
 */
const fs = require('fs');
const path = require('path');
const {filesize} = require('filesize');

function escapeHtml (str) {
	return String(str).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

function renderOutputSection (outputName, outputMeta, contextDir) {
	const inputs = Object.keys(outputMeta.inputs || {})
		.map(inputPath => ({
			path: path.relative(contextDir, path.resolve(inputPath)).replace(/\\/g, '/'),
			bytes: outputMeta.inputs[inputPath].bytesInOutput
		}))
		.filter(i => i.bytes > 0)
		.sort((a, b) => b.bytes - a.bytes);

	const total = inputs.reduce((sum, i) => sum + i.bytes, 0) || outputMeta.bytes;

	const rows = inputs
		.map(i => {
			const pct = total ? ((i.bytes / total) * 100).toFixed(1) : '0.0';
			return (
				'<tr>' +
				`<td class="path">${escapeHtml(i.path)}</td>` +
				`<td class="size">${escapeHtml(filesize(i.bytes))}</td>` +
				`<td class="pct"><div class="bar" style="width:${pct}%"></div>${pct}%</td>` +
				'</tr>'
			);
		})
		.join('');

	return (
		`<section><h2>${escapeHtml(outputName)} <span class="total">${escapeHtml(filesize(outputMeta.bytes))}</span></h2>` +
		'<table><thead><tr><th>Module</th><th>Size</th><th>% of file</th></tr></thead>' +
		`<tbody>${rows}</tbody></table></section>`
	);
}

// Writes a static stats.html into `outputDir`, summarizing esbuild's
// `metafile`. `contextDir` is used to render input module paths relative to
// the app root instead of as long absolute paths.
function writeEsbuildStatsReport (metafile, outputDir, contextDir) {
	if (!metafile) return null;

	const outputNames = Object.keys(metafile.outputs)
		.filter(name => /\.(js|css)$/.test(name) && !name.endsWith('.map'))
		.sort((a, b) => metafile.outputs[b].bytes - metafile.outputs[a].bytes);

	const sections = outputNames.map(name => renderOutputSection(name, metafile.outputs[name], contextDir)).join('');
	const totalBytes = outputNames.reduce((sum, name) => sum + metafile.outputs[name].bytes, 0);

	const html =
		'<!DOCTYPE html><html><head><meta charset="utf-8"><title>enact pack --esbuild bundle stats</title><style>' +
		'body{font:14px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;margin:2rem;color:#222}' +
		'h1{font-size:1.25rem}h2{font-size:1rem;margin-top:2rem}' +
		'.total{color:#888;font-weight:normal;font-size:0.85em}' +
		'table{border-collapse:collapse;width:100%;margin-top:0.5rem}' +
		'th,td{text-align:left;padding:4px 8px;border-bottom:1px solid #eee;font-size:0.85rem}' +
		'.path{font-family:Consolas,Menlo,monospace;word-break:break-all}' +
		'.size,.pct{white-space:nowrap;color:#555}' +
		'.bar{display:inline-block;height:8px;background:#4a90d9;margin-right:6px;vertical-align:middle;border-radius:2px}' +
		'</style></head><body>' +
		`<h1>enact pack --esbuild bundle stats <span class="total">${escapeHtml(filesize(totalBytes))} total</span></h1>` +
		sections +
		'</body></html>';

	const reportPath = path.join(outputDir, 'stats.html');
	fs.writeFileSync(reportPath, html);
	return reportPath;
}

module.exports = {writeEsbuildStatsReport};