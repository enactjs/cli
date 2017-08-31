/* eslint no-var: off */
/*
 *  mock-window.js
 *
 *  A helper utility meant to simulate a basic window object for ReactDOM usage during snapshot execution.
 */

var orig = {}, nop = function() {};
var mock = {
	CompositionEvent: nop,
	TextEvent: nop,
	document: {
		addEventListener: nop,
		createElement: function() {
			return {style:{}};
		},
		documentElement: {
			textContent: '',
			style: {
				cssFloat: ''
			}
		},
		onchange: null,
		oninput: null,
		onwheel: null,
		onmousewheel: null,
		onscroll: null,
		onfocus: null,
		removeEventListener: nop
	},
	implementation: {
		hasFeature: function() {
			return true;
		}
	},
	location: {
		protocol:'http:'
	},
	navigator: {
		userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.116 Safari/537.36'
	},
	console: {
		log: nop,
		warn: nop,
		error: nop,
		debug: nop,
		time: nop,
		timeEnd: nop
	}
};
mock.window = mock.self = mock;

module.exports = {
	activate: function() {
		for(var x in mock) {
			orig[x] = global[x];
			global[x] = mock[x];
		}
	},
	deactivate: function() {
		for(var x in mock) {
			if(orig[x]) {
				global[x] = orig[x];
			} else {
				delete global[x];
			}
		}
	}
};
