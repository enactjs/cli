/* global console */
/* eslint no-var: off, no-console: ["error", { allow: ["error"] }] */

var spy = require('enyo-console-spy');

var watchErrorAndWarnings = spy.watchErrorAndWarnings;
var filterErrorAndWarnings = spy.filterErrorAndWarnings;
var restoreErrorAndWarnings = spy.restoreErrorAndWarnings;

beforeEach(watchErrorAndWarnings);

afterEach(function (done) {
	const actual = filterErrorAndWarnings(/(Invalid prop|Failed prop type|Unknown prop)/);
	const expected = 0;
	restoreErrorAndWarnings();
	if (actual.length > expected) {
		console.error('PropType Failure:', this.currentTest.parent.title, 'at "', this.currentTest.title, '"');
	}
	done();
	expect(actual).to.have.length(expected);
});
