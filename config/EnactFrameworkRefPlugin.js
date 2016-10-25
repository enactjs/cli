var
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
	var name = this.options.name;
	var libs = this.options.libraries;
	normalModuleFactory.plugin('factory', function(factory) {
		return function(data, callback) {
			var request = data.dependency.request;
			for(var i=0; i<libs.length; i++) {
				if(request && request.indexOf(libs[i]) === 0) {
					return callback(null, new DelegatedModule(name, request, 'require', request));
				}
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

// Reference plugin to handle rewiring the external Enact framework requests
function EnactFrameworkRefPlugin(opts) {
	this.options = opts || {};
	this.options.name = this.options.name || 'enact_framework';
	this.options.libraries = this.options.libraries || ['@enact', 'react', 'react-dom'];
	this.options.external = this.options.external || {};
	this.options.external.inject = this.options.external.inject || this.options.external.path;

	if(!process.env.ILIB_LOCALE_PATH) {
		process.env.ILIB_LOCALE_PATH = path.join(this.options.external.inject, 'node_module',
				'@enact', 'i18n', 'ilib', 'locale');
	}
}
module.exports = EnactFrameworkRefPlugin;
EnactFrameworkRefPlugin.prototype.apply = function(compiler) {
	var name = this.options.name;
	var libs = this.options.libraries;
	var external = this.options.external;

	// Declare enact_framework as an external dependency
	var externals = {};
	externals[name] = name;
	compiler.apply(new ExternalsPlugin(compiler.options.output.libraryTarget || 'var', externals));

	compiler.plugin('compilation', function(compilation, params) {
		var normalModuleFactory = params.normalModuleFactory;
		compilation.dependencyFactories.set(DelegatedSourceDependency, normalModuleFactory);
		
		compilation.plugin('html-webpack-plugin-alter-chunks', function(chunks, params) {
			// Add the framework files as a pseudo-chunk so they get injected into the HTML
			chunks.unshift({
				names: ['enact_framework'],
				files: [
					normalizePath(external.inject, 'enact.js', compiler),
					normalizePath(external.inject, 'enact.css', compiler)
				]
			});

			// Store the absolute filepath to the external framework so the PrerenderPlugin can use it
			params.plugin.options.externalFramework = path.resolve(path.join(external.path, 'enact.js'));
			return chunks;
		});
	});

	// Apply the Enact factory plugin to handle the require() delagation/rerouting
	compiler.plugin('compile', function(params) {
		params.normalModuleFactory.apply(new DelegatedEnactFactoryPlugin({
			name: name,
			libraries: libs,
		}));
	});
};
