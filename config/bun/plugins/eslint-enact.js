const path = require('path');
const {ESLint} = require('eslint');

const LINT_GLOBS = [
	'**/*.{js,mjs,jsx,ts,tsx}',
	// Framework packages are often linked under node_modules/@enact; include them
	// explicitly because ESLint skips node_modules for the broad glob.
	'node_modules/@enact/**/*.{js,mjs,jsx,ts,tsx}'
];

function createEslintEnactPlugin (options = {}) {
	if (options.linting === false) {
		return null;
	}

	const context = path.resolve(options.context || process.cwd());
	const configFile = path.join(__dirname, '..', '..', 'eslintWebpackPluginConfig.js');
	const formatterPath = require.resolve('react-dev-utils/eslintFormatter');
	const eslint = new ESLint({
		overrideConfigFile: configFile,
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

	return {
		name: 'enact-eslint',
		setup (build) {
			// One lint pass per Bun.build (including watch rebuilds), not per module.
			build.onStart(async () => {
				const results = await eslint.lintFiles(LINT_GLOBS);
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
