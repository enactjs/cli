module.exports = {
	findLoader: function(config, name) {
		let index = -1;
		if(config && config.module && config.module.rules && name) {
			for(let i=0; i<config.module.rules.length; i++) {
				if(config.module.rules[i].loader) {
					if(config.module.rules[i].loader === name + '-loader') {
						index = i;
						break;
					}
				}
			}
		}
		return index;
	},
	getLoaderByName: function(config, name) {
		if(config && config.module && config.module.rules && name) {
			return config.module.rules[this.findLoader(config, name)];
		}
	},
	findPlugin: function(config, name) {
		let index = -1;
		if(config && config.plugins && name) {
			for(let i=0; i<config.plugins.length; i++) {
				if(config.plugins[i] && config.plugins[i].constructor
						&& config.plugins[i].constructor.name && config.plugins[i].constructor.name===name) {
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
		const i = this.findPlugin(config, name);
		if(i>=0) {
			config.plugins.splice(i, 1);
		}
	}
};
