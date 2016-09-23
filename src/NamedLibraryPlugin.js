var
	path = require('path'),
	fs = require('fs'),
	DllEntryPlugin = require('webpack/lib/DllEntryPlugin');

var pkgCache = {};
var checkPkgMain = function(dir) {
	if(pkgCache[dir]) {
		return pkgCache[dir].main;
	} else {
		try {
			var text = fs.readFileSync(path.join(dir, 'package.json'), {encoding:'utf8'});
			pkgCache[dir] = JSON.parse(text);
			return pkgCache[dir].main;
		} catch(e) {
			return undefined;
		}
	}
};

function NamedLibraryPlugin(options) {
	this.options = options || {};
}
module.exports = NamedLibraryPlugin;
NamedLibraryPlugin.prototype.apply = function(compiler) {
	compiler.plugin('entry-option', function(context, entry) {
		function itemToPlugin(item, name) {
			if(Array.isArray(item))
				return new DllEntryPlugin(context, item, name);
			else
				throw new Error('NamedLibraryPlugin: supply an Array as entry');
		}
		if(typeof entry === 'object') {
			Object.keys(entry).forEach(function(name) {
				compiler.apply(itemToPlugin(entry[name], name));
			});
		} else {
			compiler.apply(itemToPlugin(entry, 'main'));
		}
		return true;
	});
	compiler.plugin('compilation', function(compilation) {
		compilation.plugin('before-module-ids', function(modules) {
			modules.forEach(function(module) {
				if(module.id === null && module.libIdent) {
					module.id = module.libIdent({
						context: this.options.context || compiler.options.context
					});
					var parent = path.dirname(module.id);
					var main = checkPkgMain(parent);
					if(main && path.resolve(module.id)===path.resolve(path.join(parent, main))) {
						module.id = parent;
					}
					module.id = module.id.replace(/\\/g, '/');
					if(module.id.indexOf('./')===0) {
						module.id = module.id.substring(2);
					}
					if(module.id.indexOf('node_modules')===-1) {
						if(module.id.indexOf('.js')===module.id.length-3) {
							module.id = module.id.substring(0, module.id.length-3);
						}
						if(module.id.indexOf('/index')===module.id.length-6 && module.id.length>6) {
							module.id = module.id.substring(0, module.id.length-6);
						}
					}
				}
			}, this);
		}.bind(this));
	}.bind(this));
};
