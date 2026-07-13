const fs = require('fs');
const path = require('path');

function formatBytes (bytes) {
	if (!bytes) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function escapeHtml (value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function basename (filePath) {
	return filePath.split(/[/\\]/).pop() || filePath;
}

function buildInputRows (inputs, limit = 100) {
	const maxBytes = inputs[0]?.bytes || 1;
	return inputs.slice(0, limit).map(({file, bytes}) => {
		const width = Math.max(2, Math.round((bytes / maxBytes) * 100));
		return `<tr>
	<td class="path" title="${escapeHtml(file)}">${escapeHtml(file)}</td>
	<td class="num">${formatBytes(bytes)}</td>
	<td class="bar"><span style="width:${width}%"></span></td>
</tr>`;
	}).join('\n');
}

function buildOutputSections (outputs, metafile) {
	return outputs.map(({file, bytes}) => {
		const outputMeta = metafile.outputs[file] || {};
		const contributors = Object.entries(outputMeta.inputs || {})
			.map(([inputPath, info]) => ({
				file: inputPath,
				bytes: info.bytesInOutput || 0
			}))
			.sort((a, b) => b.bytes - a.bytes)
			.slice(0, 25);

		const rows = contributors.map(({file: inputPath, bytes: inputBytes}) =>
			`<tr><td class="path" title="${escapeHtml(inputPath)}">${escapeHtml(inputPath)}</td><td class="num">${formatBytes(inputBytes)}</td></tr>`
		).join('\n');

		return `<section>
	<h2>${escapeHtml(basename(file))} <span class="muted">${formatBytes(bytes)}</span></h2>
	<table>
		<thead><tr><th>Input module</th><th>Bytes in output</th></tr></thead>
		<tbody>${rows || '<tr><td colspan="2">No module details available.</td></tr>'}</tbody>
	</table>
</section>`;
	}).join('\n');
}

function renderStatsHtml (metafile) {
	const inputs = Object.entries(metafile.inputs || {})
		.map(([file, meta]) => ({file, bytes: meta.bytes || 0}))
		.sort((a, b) => b.bytes - a.bytes);

	const outputs = Object.entries(metafile.outputs || {})
		.map(([file, meta]) => ({file, bytes: meta.bytes || 0}))
		.sort((a, b) => b.bytes - a.bytes);

	const totalInput = inputs.reduce((sum, item) => sum + item.bytes, 0);
	const totalOutput = outputs.reduce((sum, item) => sum + item.bytes, 0);

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Enact Bundle Analysis</title>
	<style>
		:root { color-scheme: light dark; font-family: Segoe UI, system-ui, sans-serif; }
		body { margin: 0; background: #111; color: #eee; }
		main { max-width: 1200px; margin: 0 auto; padding: 24px; }
		h1, h2 { font-weight: 600; }
		.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 20px 0 32px; }
		.card { background: #1b1b1b; border: 1px solid #333; border-radius: 8px; padding: 16px; }
		.card strong { display: block; font-size: 1.4rem; margin-top: 6px; }
		.muted { color: #aaa; font-size: 0.95rem; font-weight: 400; }
		table { width: 100%; border-collapse: collapse; margin-top: 12px; }
		th, td { padding: 8px 10px; border-bottom: 1px solid #2a2a2a; text-align: left; vertical-align: middle; }
		th { color: #bbb; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }
		td.path { max-width: 720px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: Consolas, monospace; font-size: 0.9rem; }
		td.num { width: 110px; white-space: nowrap; }
		td.bar span { display: block; height: 10px; border-radius: 999px; background: linear-gradient(90deg, #4f8cff, #7b61ff); }
		section { margin-bottom: 36px; }
		.note { background: #182033; border: 1px solid #2d3f66; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px; }
		a { color: #8cb4ff; }
	</style>
</head>
<body>
	<main>
		<h1>Enact Bundle Analysis</h1>
		<p class="muted">Generated from Bun metafile data.</p>
		<div class="note">
			For an interactive treemap, open <a href="https://esbuild.github.io/analyze/" target="_blank" rel="noopener">esbuild.github.io/analyze</a>
			and upload <code>stats.json</code> from this directory.
		</div>
		<div class="summary">
			<div class="card"><span class="muted">Input modules</span><strong>${inputs.length}</strong></div>
			<div class="card"><span class="muted">Total input size</span><strong>${formatBytes(totalInput)}</strong></div>
			<div class="card"><span class="muted">Output files</span><strong>${outputs.length}</strong></div>
			<div class="card"><span class="muted">Total output size</span><strong>${formatBytes(totalOutput)}</strong></div>
		</div>
		<section>
			<h2>Largest input modules</h2>
			<table>
				<thead><tr><th>Module</th><th>Size</th><th>Relative size</th></tr></thead>
				<tbody>${buildInputRows(inputs)}</tbody>
			</table>
		</section>
		${buildOutputSections(outputs, metafile)}
	</main>
</body>
</html>`;
}

function writeStatsReport (outputDir, metafile) {
	if (!metafile) {
		throw new Error('Unable to generate bundle analysis: Bun build did not return a metafile.');
	}

	fs.mkdirSync(outputDir, {recursive: true});
	fs.writeFileSync(path.join(outputDir, 'stats.json'), JSON.stringify(metafile, null, 2), {encoding: 'utf8'});
	fs.writeFileSync(path.join(outputDir, 'stats.html'), renderStatsHtml(metafile), {encoding: 'utf8'});
}

module.exports = {writeStatsReport, formatBytes};
