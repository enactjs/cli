require('babel-polyfill');
var
	React = require('react'),
	ReactDOMServer = require('react-dom/server'),
	Target = require('prerender-target');

module.exports = function(opts) {
	if(React.isValidElement(Target)) {
		return ReactDOMServer.renderToString(Target);
	} else {
		return ReactDOMServer.renderToString(React.createElement(Target, null));
	}
};
