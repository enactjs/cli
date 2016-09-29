var
	path = require('path'),
	NamedLibraryRefPlugin = require('./NamedLibraryRefPlugin'),
	config = require('./common-config'),
	mixin = require('./mixin');

module.exports = function(opts) {
	var common = config.common({ri: opts.ri});

	return mixin(common, {
		// TODO: Put 'babel-polyfill' and others in a vendor.js and load the externals here
		plugins: [
			new NamedLibraryRefPlugin(opts.namedLibs || [])
		]
	});
};
