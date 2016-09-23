function QuietPlugin(options) {
	this.options = options || {};
}

var count = 0;
module.exports = QuietPlugin;
QuietPlugin.prototype.apply = function(compiler) {
	var keys = this.options.keys || [];
	compiler.plugin('done', function(stats) {
		if(stats && stats.compilation && stats.compilation.children) {
			for(var i=0; i<stats.compilation.children.length; i++) {
				var child = stats.compilation.children[i];
				if(keys.indexOf(stats.compilation.children[i].name)>-1) {
					stats.compilation.children.splice(i, 1);
					i--;
				}
			}
		}
	});
};
