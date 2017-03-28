module.exports = {
	findLoader: function(config, name) {
		var index = -1;
		if(config && config.module && config.module.loaders && name) {
			for(var i=0; i<config.module.loaders.length; i++) {
				if(config.module.loaders[i].loader) {
					if(config.module.loaders[i].loader.split(/[?!]/)[0].replace(/-loader$/, '')==name.replace(/-loader$/, '')) {
						index = i;
						break;
					}
				}
			}
		}
		return index;
	},
	getLoaderByName: function(config, name) {
		if(config && config.module && config.module.loaders && name) {
			return config.module.loaders[this.findLoader(config, name)];
		}
	},
	findPlugin: function(config, name) {
		var index = -1;
		if(config && config.plugins && name) {
			for(var i=0; i<config.plugins.length; i++) {
				if(config.plugins[i] && config.plugins[i].constructor &&
						config.plugins[i].constructor.name && config.plugins[i].constructor.name==name) {
					index = i;
					break;
				}
			}
		}
		return index;
	},
	getPluginByName: function(config, name) {
		if(config && config.plugins && name) {
			return config.plugins[this.findPlugin(config, name)];
		}
	},
	removePlugin: function(config, name) {
		var i = this.findPlugin(config, name);
		if(i>=0) {
			config.plugins.splice(i, 1);
		}
	}
}