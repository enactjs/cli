var fs = require('fs');

module.exports = {
	exists: function(item) {
		try {
			return !!(fs.statSync(item));
		} catch(e) {
			return false;
		}
	}
};
