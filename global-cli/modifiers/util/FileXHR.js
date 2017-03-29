var
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
	if(this.method.toUpperCase() === 'GET' && this.uri && this.sync) {
		var parsedURI = this.uri.replace(/\\/g, '/').replace(/^(_\/)+/g, function(match) {
			return match.replace(/_/g, '..');
		});
		try {
			if(!exists(parsedURI)) throw new Error('File not found: ' + this.uri);

			this.response = this.responseText = fs.readFileSync(parsedURI, {encoding:'utf8'});
			this.status = 200;
			this.onload && this.onload();
		} catch(e) {
			this.status = 404;
			this.onerror && this.onerror(e.message || e);
		}
	}
};

module.exports = FileXHR;
