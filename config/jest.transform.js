var	babelJest = require('babel-jest');

// TODO: extract from our config.
module.exports = babelJest.createTransformer({
  presets: [{presets: [
	  require.resolve('babel-preset-es2015'),
	  require.resolve('babel-preset-stage-0'),
	  require.resolve('babel-preset-react')
  ]}],
  babelrc: false
});

