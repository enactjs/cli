var
	ExternalsPlugin = require('webpack/lib/ExternalsPlugin'),
	DelegatedSourceDependency = require('webpack/lib/dependencies/DelegatedSourceDependency'),
	DelegatedModule = require('webpack/lib/DelegatedModule');

function DelegatedLibFactoryPlugin(options) {
	this.options = options;
}
DelegatedLibFactoryPlugin.prototype.apply = function(normalModuleFactory) {
	normalModuleFactory.plugin('factory', function(factory) {
		return function(data, callback) {
			var dependency = data.dependency;
			var request = dependency.request;
			for(var i=0; i<this.options.libraries.length; i++) {
				var lib = this.options.libraries[0];
				if(request && request.indexOf(lib) === 0) {
					if(request.length===lib.length) {
						request += '/.';
					}
					var innerRequest = request.substring(lib.length+1);
					return callback(null, new DelegatedModule('lib-reference-' + lib, innerRequest, this.options.type, innerRequest));
				}
			}
			return factory(data, callback);
		}.bind(this);
	}.bind(this));
};


function NamedLibraryRefPlugin(libraries, sourceType, type) {
	this.libraries = libraries || [];
	this.sourceType = sourceType || 'var';
	this.type = type || 'require';
}
module.exports = NamedLibraryRefPlugin;
NamedLibraryRefPlugin.prototype.apply = function(compiler) {
	var externals = {};
	for(var i=0; i<this.libraries.length; i++) {
		var lib = this.libraries[0];
		externals['lib-reference-' + lib] = lib;
	}
	compiler.apply(new ExternalsPlugin(this.sourceType, externals));
	compiler.plugin('compilation', function(compilation, params) {
		var normalModuleFactory = params.normalModuleFactory;

		compilation.dependencyFactories.set(DelegatedSourceDependency, normalModuleFactory);
	});
	compiler.plugin('compile', function(params) {
		params.normalModuleFactory.apply(new DelegatedLibFactoryPlugin({
			libraries: this.libraries,
			type: this.type
		}));
	}.bind(this));
};
