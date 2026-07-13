const path = require('path');
const {ESLint} = require('eslint');

let eslintInstance;

function getESLint (context) {
	if (!eslintInstance) {
		const configFile = path.join(__dirname, '..', '..', 'eslintWebpackPluginConfig.js');
		eslintInstance = new ESLint({
			overrideConfigFile: configFile,
			cache: true,
			cacheLocation: path.join(context, 'node_modules', '.cache', '.eslintcache'),
			cwd: context,
			errorOnUnmatchedPattern: false
		});
	}
	return eslintInstance;
}

function shouldLint (filePath) {
	if (!/\.(js|mjs|jsx|ts|tsx)$/.test(filePath)) {
		return false;
	}
	if (/node_modules[/\\]/.test(filePath) && !/node_modules[/\\]@enact[/\\]/.test(filePath)) {
		return false;
	}
	return true;
}

function createEslintEnactPlugin (options = {}) {
	if (options.linting === false) {
		return null;
	}

	const formatterPath = require.resolve('react-dev-utils/eslintFormatter');

	return {
		name: 'enact-eslint',
		setup (build) {
			build.onLoad({filter: /\.(js|mjs|jsx|ts|tsx)$/}, async args => {
				if (!shouldLint(args.path)) {
					return undefined;
				}

				const eslint = getESLint(options.context);
				const results = await eslint.lintFiles(args.path);
				const formatter = await eslint.loadFormatter(formatterPath);
				const resultText = await formatter.format(results);

				if (resultText) {
					console.log(resultText);
				}

				const hasErrors = results.some(result => result.errorCount > 0);
				if (hasErrors) {
					throw new Error('Lint errors found.');
				}

				return undefined;
			});
		}
	};
}

module.exports = {createEslintEnactPlugin};
