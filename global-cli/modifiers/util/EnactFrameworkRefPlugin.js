const
	path = require('path'),
	ExternalsPlugin = require('webpack/lib/ExternalsPlugin'),
	DelegatedSourceDependency = require('webpack/lib/dependencies/DelegatedSourceDependency'),
	DelegatedModule = require('webpack/lib/DelegatedModule');

// Custom DelegateFactoryPlugin designed to redirect Enact framework require() calls
// to the external framework
function DelegatedEnactFactoryPlugin(options) {
	this.options = options || {};
}
DelegatedEnactFactoryPlugin.prototype.apply = function(normalModuleFactory) {
	const name = this.options.name;
	const libReg = new RegExp('^(' + this.options.libraries.join('|') + ')(?=[\\\\\\/]|$)');
	normalModuleFactory.plugin('factory', (factory) => {
		return function(data, callback) {
			const request = data.request;
			if(request && libReg.test(request)) {
				return callback(null, new DelegatedModule(name, {id:request}, 'require', request));
			}
			return factory(data, callback);
		};
	});
};

// Form a correct filepath that can be used within the build's output directory
function normalizePath(dir, file, compiler) {
	if(path.isAbsolute(dir)) {
		return path.join(dir, file);
	} else {
		return path.relative(path.resolve(compiler.options.output.path), path.join(process.cwd(), dir, file));
	}
}

// Determine if it's a NodeJS output filesystem or if it's a foreign/virtual one.
function isNodeOutputFS(compiler) {
	return (compiler.outputFileSystem
			&& compiler.outputFileSystem.constructor
			&& compiler.outputFileSystem.constructor.name === 'NodeOutputFileSystem');
}

// Reference plugin to handle rewiring the external Enact framework requests
function EnactFrameworkRefPlugin(opts) {
	this.options = opts || {};
	this.options.name = this.options.name || 'enact_framework';
	this.options.libraries = this.options.libraries || ['@enact', 'react', 'react-dom'];
	this.options.external = this.options.external || {};
	this.options.external.inject = this.options.external.inject || this.options.external.path;

	if(!process.env.ILIB_BASE_PATH) {
		process.env.ILIB_BASE_PATH = path.join(this.options.external.inject, 'node_module',
				'@enact', 'i18n', 'ilib');
	}
}
module.exports = EnactFrameworkRefPlugin;
EnactFrameworkRefPlugin.prototype.apply = function(compiler) {
	const name = this.options.name;
	const libs = this.options.libraries;
	const external = this.options.external;

	// Declare enact_framework as an external dependency
	const externals = {};
	externals[name] = name;
	compiler.apply(new ExternalsPlugin(compiler.options.output.libraryTarget || 'var', externals));

	compiler.plugin('compilation', (compilation, params) => {
		const normalModuleFactory = params.normalModuleFactory;
		compilation.dependencyFactories.set(DelegatedSourceDependency, normalModuleFactory);

		compilation.plugin('html-webpack-plugin-alter-chunks', (chunks) => {
			const chunkFiles = [normalizePath(external.inject, 'enact.css', compiler)];
			if(!external.snapshot) {
				chunkFiles.unshift(normalizePath(external.inject, 'enact.js', compiler));
			}
			// Add the framework files as a pseudo-chunk so they get injected into the HTML
			chunks.unshift({
				names: ['enact_framework'],
				files: chunkFiles
			});
			return chunks;
		});

		if(external.snapshot && isNodeOutputFS(compiler)) {
			compilation.plugin('webos-meta-root-appinfo', (meta) => {
				meta.v8SnapshotFile = normalizePath(external.inject, 'snapshot_blob.bin', compiler);
				return meta;
			});
		}
	});

	// Apply the Enact factory plugin to handle the require() delagation/rerouting
	compiler.plugin('compile', (params) => {
		params.normalModuleFactory.apply(new DelegatedEnactFactoryPlugin({
			name: name,
			libraries: libs
		}));
	});
};
