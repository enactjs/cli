/* global console, beforeEach, afterEach, expect */
const fs = require('fs');
const path = require('path');
const enzyme = require('enzyme');
const Adapter = require('enzyme-adapter-react-16');
const {watchErrorAndWarnings, filterErrorAndWarnings, restoreErrorAndWarnings} = require('console-snoop');
const {packageRoot} = require('@enact/dev-utils');

const filters = [
	'Invalid prop',
	'Failed prop type',
	'Unknown prop',
	'non-boolean attribute',
	'Received NaN',
	'Invalid value',
	'React does not recognize',
	'React uses onFocus and onBlur instead of onFocusIn and onFocusOut',
	'Invalid event handler property',
	'Unknown event handler property',
	'Directly setting property `innerHTML` is not permitted',
	'The `aria` attribute is reserved for future use in ',
	'for a string attribute `is`. If this is expected, cast',
	'Invalid DOM property'
];
const filterExp = new RegExp('(' + filters.join('|') + ')');

// Configure Enzyme to use React16 adapter.

enzyme.configure({adapter: new Adapter()});

// Configure proptype & react error checking on the console.

beforeEach(watchErrorAndWarnings);

afterEach(function() {
	const actual = filterErrorAndWarnings(filterExp);
	const expected = 0;
	restoreErrorAndWarnings();
	if (actual.length > expected) {
		console.error("Errors/Warnings in '" + this.currentTest.parent.title + "' at '" + this.currentTest.title + "'");
	}
	expect(actual).toHaveLength(expected);
});

// Set initial resolution to VGA, similar to PhantomJS.
// Will ideally want to use a more modern resolution later.

global.innerHeight = 640;
global.innerWidth = 480;

// Support local file sync XHR to support iLib loading.

const ilibPaths = Object.keys(global).filter(k => /ILIB_[^_]+_PATH/.test(k));
const pkg = packageRoot();
const XHR = global.XMLHttpRequest;
class ILibXHR extends XHR {
	open(method, uri) {
		if (ilibPaths.some(p => uri.startsWith(global[p]))) {
			this.send = () => {
				try {
					const file = path.join(pkg.path, uri.replace(/\//g, path.sep));
					this.fileText = fs.readFileSync(file, {encoding: 'utf8'});
					this.fileStatus = 200;
				} catch (e) {
					this.fileText = '';
					this.fileStatus = 404;
				}
				this.dispatchEvent(new global.Event('readystatechange'));
				this.dispatchEvent(new global.ProgressEvent('load'));
				this.dispatchEvent(new global.ProgressEvent('loadend'));
			};
		} else {
			return super.open(...arguments);
		}
	}
	get readyState() {
		return typeof this.fileStatus !== 'undefined' ? XHR.DONE : super.readyState;
	}
	get status() {
		return typeof this.fileStatus !== 'undefined' ? this.fileStatus : super.status;
	}
	get responseText() {
		return typeof this.fileText !== 'undefined' ? this.fileText : super.responseText;
	}
}
global.XMLHttpRequest = ILibXHR;
