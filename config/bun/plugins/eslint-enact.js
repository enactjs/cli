const path = require('path');
const {ESLint} = require('eslint');

// App sources only — eslint-webpack-plugin excluded node_modules (including
// linked @enact packages), and linting the framework tree costs minutes.
const LINT_GLOBS = ['**/*.{js,mjs,jsx,ts,tsx}'];

// Webpack's eslint plugin only linted the module graph; Bun scans the filesystem.
// Skip pack outputs (dist, dist2 from pack.sh -o=, custom --output, cache, etc.).
const DEFAULT_IGNORES = [
	'**/dist/**',
	'**/dist*/**',
	'**/build/**',
	'**/coverage/**',
	'**/node_modules/.cache/**'
];

function toPosix (filePath) {
	return filePath.replace(/\\/g, '/');
}

function getIgnorePatterns (context, options = {}) {
	const ignores = [...DEFAULT_IGNORES];
	const outputPath = options.outputPath && path.resolve(options.outputPath);
	if (outputPath) {
		const relative = toPosix(path.relative(context, outputPath));
		if (relative && relative !== '.' && !relative.startsWith('..')) {
			ignores.push(`${relative}/**`);
		}
	}
	return ignores;
}

function createEslintEnactPlugin (options = {}) {
	if (options.linting === false) {
		return null;
	}

	const context = path.resolve(options.context || process.cwd());
	const configFile = path.join(__dirname, '..', '..', 'eslintWebpackPluginConfig.js');
	const formatterPath = require.resolve('react-dev-utils/eslintFormatter');
	const eslint = new ESLint({
		overrideConfigFile: configFile,
		overrideConfig: {
			ignores: getIgnorePatterns(context, options)
		},
		cache: true,
		cacheLocation: path.join(context, 'node_modules', '.cache', '.eslintcache'),
		cwd: context,
		errorOnUnmatchedPattern: false
	});

	let formatterPromise;

	const getFormatter = () => {
		if (!formatterPromise) {
			formatterPromise = eslint.loadFormatter(formatterPath);
		}
		return formatterPromise;
	};

	let lintRun = null;

	return {
		name: 'enact-eslint',
		setup (build) {
			// One lint pass per Bun.build (including watch rebuilds), not per module.
			// Kicked off at build start but awaited at build end, so linting runs
			// concurrently with bundling (matches eslint-webpack-plugin timing).
			build.onStart(() => {
				lintRun = eslint.lintFiles(LINT_GLOBS);
			});

			build.onEnd(async () => {
				if (!lintRun) return;
				const results = await lintRun;
				lintRun = null;
				const formatter = await getFormatter();
				const resultText = await formatter.format(results);

				if (resultText) {
					console.log(resultText);
				}

				if (results.some(result => result.errorCount > 0)) {
					throw new Error('Lint errors found.');
				}
			});
		}
	};
}

module.exports = {createEslintEnactPlugin};
