var
	path = require('path'),
	fs = require('fs');

function exists(item) {
	try {
		return !!(fs.statSync(item));
	} catch(e) {
		return false;
	}
}

function findAppInfo() {
	var dirs = ['.', 'webos-meta'];
	for(var i=0; i<dirs.length; i++) {
		var ai = path.join(dirs[i], 'appinfo.json');
		if(exists(ai)) {
			if(ai.indexOf('.')!==0) {
				ai = './' + ai;
			}
			return ai;
		}
	}
}

module.exports = function(entry, additionalDeps) {
	additionalDeps = additionalDeps || [];
	var ai = findAppInfo();
	if(ai) {
		additionalDeps.push(ai);
	}
	if(typeof entry === 'string') {
		entry = additionalDeps.concat(entry);
	} else {
		for(var x in entry) {
			entry[x] = additionalDeps.concat(entry[x]);
		}
	}
	return entry;
};
