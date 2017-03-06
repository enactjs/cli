var
	path = require('path'),
	fs = require('fs'),
	exists = require('path-exists').sync;

function FileXHR() {}

FileXHR.prototype.open = function(method, uri, async) {
	this.method = method;
	this.uri = uri;
	this.sync = (async === false);
};

FileXHR.prototype.addEventListener = function(evt, fn) {
	this['on' + evt] = fn;
};

FileXHR.prototype.send = function() {
	if(global.publicPath && this.uri.indexOf(global.publicPath) === 0) {
		this.uri = this.uri.substring(global.publicPath.length);
	}
	if(this.method.toUpperCase() === 'GET' && this.uri && this.sync) {
		try {
			var outUri = path.join(FileXHR.compilation.options.output.path, this.uri);
			if(!exists(outUri)) throw new Error('File not found: ' + this.uri);

			this.response = this.responseText = fs.readFileSync(outUri, {encoding:'utf8'});
			this.status = 200;
			this.onload && this.onload();
		} catch(e) {
			this.status = 404;
			this.onerror && this.onerror(e.message || e);
		}
	}
};

module.exports = FileXHR;