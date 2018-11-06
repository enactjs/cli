/* global console, beforeEach, afterEach, expect */
const enzyme = require('enzyme');
const Adapter = require('enzyme-adapter-react-16');
const {watchErrorAndWarnings, filterErrorAndWarnings, restoreErrorAndWarnings} = require('console-snoop');

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
