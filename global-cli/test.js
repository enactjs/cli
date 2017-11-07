const jest = require('jest');

module.exports = function(args) {
	process.env.BABEL_ENV = 'test';
	process.env.NODE_ENV = 'test';

	args.unshift('--config', require.resolve('../config/jest/config'));

	jest.run(args);
};
