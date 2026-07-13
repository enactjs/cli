const fs = require('fs');
const path = require('path');

let typecheckRunning = false;

function formatDiagnostics (diagnostics, host) {
	return diagnostics
		.map(diagnostic => {
			const message = host.getCategoryFormat(diagnostic.category)(diagnostic.messageText);
			if (diagnostic.file && typeof diagnostic.start === 'number') {
				const {line, character} = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
				return `${diagnostic.file.fileName}(${line + 1},${character + 1}): ${message}`;
			}
			return message;
		})
		.join('\n');
}

function runTypeCheck (context) {
	const configPath = path.join(context, 'tsconfig.json');
	if (!fs.existsSync(configPath) || typecheckRunning) {
		return Promise.resolve();
	}

	let ts;
	try {
		ts = require(require.resolve('typescript', {paths: [context, __dirname]}));
	} catch (e) {
		return Promise.resolve();
	}

	typecheckRunning = true;
	return Promise.resolve().then(() => {
		const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
		if (configFile.error) {
			throw new Error(ts.formatDiagnostic(configFile.error, {
				getCategoryFormat: () => msg => msg
			}));
		}

		const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, context);
		const program = ts.createProgram(parsed.fileNames, parsed.options);
		const diagnostics = ts.getPreEmitDiagnostics(program);
		const errors = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);

		if (errors.length > 0) {
			const host = {
				getCategoryFormat: category => {
					if (category === ts.DiagnosticCategory.Error) return msg => `error TS: ${msg}`;
					return msg => msg;
				}
			};
			throw new Error(formatDiagnostics(errors, host));
		}
	}).finally(() => {
		typecheckRunning = false;
	});
}

function createTypescriptEnactPlugin (options = {}) {
	if (options.typeCheck === false) {
		return null;
	}

	const context = options.context;

	return {
		name: 'enact-typescript',
		setup (build) {
			build.onStart(async () => {
				await runTypeCheck(context);
			});
		}
	};
}

module.exports = {createTypescriptEnactPlugin, runTypeCheck};
