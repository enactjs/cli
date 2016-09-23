var	rimraf = require('rimraf');


module.exports = function() {
	rimraf('./build', function(bErr) {
		if(bErr) throw bErr;
		rimraf('./dist', function(dErr) {
			if(dErr) throw dErr;
		});
	});
};
