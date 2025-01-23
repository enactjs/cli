const {existsSync, mkdirSync, readFileSync} = require('node:fs');

module.exports = {
	ensureDir: function (dir) {
		return new Promise(resolve => {
			if (!existsSync(dir)) {
				mkdirSync(dir);
			}
			resolve();
		});
	},
	ensureDirSync: function (dir) {
		if (!existsSync(dir)) {
			mkdirSync(dir);
		}
	},
	readJsonSync: function (file, options = {}) {
		if (typeof options === 'string') {
			options = {encoding: options};
		}

		const shouldThrow = 'throws' in options ? options.throws : true;

		try {
			let content = readFileSync(file, options);
			// we do this because JSON.parse would convert it to an utf8 string if encoding wasn't specified
			if (Buffer.isBuffer(content)) content = content.toString('utf8');
			content = content.replace(/^\uFEFF/, '');
			return JSON.parse(content, options.reviver);
		} catch (err) {
			if (shouldThrow) {
				err.message = `${file}: ${err.message}`;
				throw err;
			} else {
				return null;
			}
		}
	}
};
