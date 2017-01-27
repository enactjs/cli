var
	path = require('path'),
	fs = require('fs'),
	DllEntryPlugin = require('webpack/lib/DllEntryPlugin'),
	DllModule = require('webpack/lib/DllModule'),
	RawSource = require("webpack/lib/RawSource"),
	exists = require('path-exists').sync;

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

var parentCache = {};
var findParent = function(dir) {
	if(parentCache[dir]) {
		return parentCache[dir];
	} else {
		var currPkg = path.join(dir, 'package.json');
		if(exists(currPkg)) {
			return dir;
		} else {
			if(dir === '/' || dir === '' || dir === '.') {
				return null;
			} else {
				return findParent(path.dirname(dir));
			}
		}
	}
};

function normalizeModuleID(id) {
	var dir = exists(id) && fs.statSync(id).isDirectory() ? id : path.dirname(id);
	parentCache[dir] = findParent(dir);
	if(parentCache[dir]) {
		var main = checkPkgMain(parentCache[dir]);
		if(main && path.resolve(id)===path.resolve(path.join(parentCache[dir], main))) {
			id = parentCache[dir];
		}
	}
	id = id.replace(/\\/g, '/');

	// Remove any leading ./node_modules prefix
	var nodeModulesPrefix = './node_modules/';
	if(id.indexOf(nodeModulesPrefix)===0) {
		id = id.substring(nodeModulesPrefix.length);
	}
	if(id.indexOf('node_modules')===-1) {
		// Remove any js file extension
		if(id.indexOf('.js')===id.length-3) {
			id = id.substring(0, id.length-3);
		}
		// Remove any /index suffix as we want the user-accessible ID
		if(id.indexOf('/index')===id.length-6 && id.length>6) {
			id = id.substring(0, id.length-6);
		}
	}
	return id;
}

DllModule.prototype.source = function() {
	var header = '';
	if(DllModule.entries[this.name]) {
		header += '__webpack_require__.load = function(loader) {\n';
		header += '\tloader = loader || __webpack_require__;'
		for(var i=0; i<DllModule.entries[this.name].length; i++) {
			header += '\tloader(\'' + DllModule.entries[this.name][i] + '\');\n';
		}
		header += '};\n';
	}
	return new RawSource(header + 'module.exports = __webpack_require__;');
};

function EnactFrameworkPlugin(options) {
	this.options = options || {};
}
module.exports = EnactFrameworkPlugin;
EnactFrameworkPlugin.prototype.apply = function(compiler) {
	// Map entries to the DLLEntryPlugin
	DllModule.entries = {};
	compiler.plugin('entry-option', function(context, entry) {
		function itemToPlugin(item, name) {
			if(Array.isArray(item)) {
				DllModule.entries[name] = [];
				for(var i=0; i<item.length; i++) {
					DllModule.entries[name].push(normalizeModuleID('./node_modules/' + item[i]));
				}
				return new DllEntryPlugin(context, item, name);
			} else {
				throw new Error('EnactFrameworkPlugin: supply an Array as entry');
			}
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

	// Format the internal module ID to a usable named descriptor
	compiler.plugin('compilation', function(compilation) {
		compilation.plugin('before-module-ids', function(modules) {
			modules.forEach(function(module) {
				if(module.id === null && module.libIdent) {
					module.id = module.libIdent({
						context: this.options.context || compiler.options.context
					});
					module.id = normalizeModuleID(module.id)
				}
			}, this);
		}.bind(this));
	}.bind(this));
};
