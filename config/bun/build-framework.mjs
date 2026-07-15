import path from 'path';
import {fileURLToPath} from 'url';
import {createRequire} from 'module';
import {createBuildOptions} from './build-options.js';
import {createEnactPlugins} from './plugins/index.js';

const nodeRequire = createRequire(import.meta.url);
const {applyFramework} = nodeRequire('./framework.js');

function parseArgs (argv) {
	const opts = {production: false, output: null, context: null, snapshot: false, externalsPolyfill: false, linting: true};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--production' || arg === '-p') opts.production = true;
		else if (arg === '--output' || arg === '-o') opts.output = argv[++i];
		else if (arg === '--context') opts.context = argv[++i];
		else if (arg === '--snapshot' || arg === '-s') opts.snapshot = true;
		else if (arg === '--externals-polyfill') opts.externalsPolyfill = true;
		else if (arg === '--no-linting') opts.linting = false;
	}
	return opts;
}

async function run () {
	const opts = parseArgs(process.argv.slice(2));
	const context = opts.context || process.cwd();
	process.chdir(context);

	const options = createBuildOptions({
		context,
		production: opts.production,
		output: opts.output || path.join(context, 'dist'),
		linting: opts.linting
	});
	const polyfillPath = opts.externalsPolyfill
		? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'polyfills.js')
		: null;
	const plugins = createEnactPlugins({
		production: opts.production,
		sourcemap: options.sourcemap,
		context: options.context,
		accent: options.accent,
		forceCSSModules: options.forceCSSModules,
		useTailwind: options.useTailwind,
		ri: options.ri,
		aliases: options.aliases,
		linting: options.linting,
		framework: true
	});

	const output = await applyFramework({
		context,
		output: options.outputPath,
		production: opts.production,
		plugins,
		polyfill: polyfillPath,
		includeCoreJs: opts.externalsPolyfill && !polyfillPath,
		snapshot: opts.snapshot
	});

	console.log(JSON.stringify({success: true, output}));
}

run().catch(err => {
	console.error(err);
	process.exit(1);
});
