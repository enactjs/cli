'use strict';
const {spawn} = require('child_process');
const path = require('path');
const {WebpackError} = require('webpack');

const pluginName = 'EnactTypeScriptCheckPlugin';

// Diagnostics are not reported for test and setup files, matching the fork-ts-checker issue filters.
const excludeFile = /(^|[\\/])__tests__[\\/]|\.(spec|test)\.[^\\/]+$|[\\/]src[\\/]setup(Proxy|Tests)\.[^\\/]+$/;

// Parses `tsc --pretty false` output. Each diagnostic starts with `file(line,col): error TSxxxx: message`
// (or `error TSxxxx: message` for global ones) and any following indented lines elaborate on it.
function parseDiagnostics (output) {
	const diagnostics = [];
	output.split(/\r?\n/).forEach(line => {
		const located = /^(.+)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/.exec(line);
		const unlocated = !located && /^(error|warning) (TS\d+): (.*)$/.exec(line);
		if (located) {
			const [, file, row, column, category, code, text] = located;
			diagnostics.push({file, row, column, category, code, text});
		} else if (unlocated) {
			const [, category, code, text] = unlocated;
			diagnostics.push({category, code, text});
		} else if (line.trim() && diagnostics.length) {
			diagnostics[diagnostics.length - 1].text += '\n' + line;
		}
	});
	return diagnostics;
}

function formatDiagnostic ({file, row, column, code, text}) {
	return (file ? `${file}(${row},${column})\n` : '') + `${code}: ${text}`;
}

// Type checks the app with the `tsc` binary for TypeScript versions that do not expose the compiler API
// required by fork-ts-checker (TypeScript 7+). `tsc` runs alongside each webpack compilation and its
// diagnostics are added to the compilation once it finishes.
class TypeScriptCheckPlugin {
	constructor ({tscPath, context, compileOnError = false}) {
		this.tscPath = tscPath;
		this.context = context;
		this.compileOnError = compileOnError;
		this.child = null;
		this.check = null;
	}

	runTsc () {
		this.cancel();
		const args = [
			this.tscPath,
			'--project',
			path.join(this.context, 'tsconfig.json'),
			'--noEmit',
			'--skipLibCheck',
			'--incremental',
			'--tsBuildInfoFile',
			path.join(this.context, 'node_modules', '.cache', 'tsconfig.tsbuildinfo'),
			'--pretty',
			'false'
		];

		return new Promise(resolve => {
			let output = '';
			const child = spawn(process.execPath, args, {cwd: this.context, windowsHide: true});
			this.child = child;
			child.stdout.on('data', data => (output += data));
			child.stderr.on('data', data => (output += data));
			child.on('error', err => {
				resolve({failure: err.message});
			});
			child.on('close', (exitCode, signal) => {
				if (this.child === child) this.child = null;
				if (signal) {
					resolve({cancelled: true});
				} else if (exitCode === 0) {
					resolve({diagnostics: []});
				} else {
					const diagnostics = parseDiagnostics(output);
					// A non-zero exit without any parsable diagnostics means tsc itself failed
					resolve(
						diagnostics.length ?
							{diagnostics} :
							{failure: output.trim() || `tsc exited with code ${exitCode}`}
					);
				}
			});
		});
	}

	cancel () {
		if (this.child) {
			this.child.kill();
			this.child = null;
		}
	}

	apply (compiler) {
		const start = () => {
			this.check = this.runTsc();
		};
		compiler.hooks.run.tap(pluginName, start);
		compiler.hooks.watchRun.tap(pluginName, start);
		compiler.hooks.watchClose.tap(pluginName, () => this.cancel());
		compiler.hooks.shutdown.tap(pluginName, () => this.cancel());

		compiler.hooks.afterCompile.tapPromise(pluginName, compilation => {
			// Child compilers inherit this hook; only report on the main compilation
			if (compilation.compiler !== compiler || !this.check) return Promise.resolve();

			return this.check.then(({cancelled, failure, diagnostics}) => {
				if (cancelled) return;
				if (failure) {
					compilation.warnings.push(new WebpackError(`TypeScript type checking could not run:\n${failure}`));
					return;
				}
				const errors = [];
				const warnings = [];
				diagnostics
					.filter(({file}) => !file || !excludeFile.test(file))
					.forEach(diagnostic => {
						const isError = diagnostic.category === 'error' && !this.compileOnError;
						(isError ? errors : warnings).push(formatDiagnostic(diagnostic));
					});

				// All diagnostics are reported as a single issue, since react-dev-utils only
				// prints the first error of a compilation in `enact serve`
				const report = (list, issues) => {
					if (!list.length) return;
					const issue = new WebpackError(list.join('\n\n'));
					issue.hideStack = true;
					issues.push(issue);
				};
				report(errors, compilation.errors);
				report(warnings, compilation.warnings);
			});
		});
	}
}

module.exports = TypeScriptCheckPlugin;
