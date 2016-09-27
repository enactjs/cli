/* global console */
/* eslint no-console: ["error", { allow: ["error"] }] */

var watchErrorAndWarnings = require('enyo-console-spy').watchErrorAndWarnings,
	filterErrorAndWarnings = require('enyo-console-spy').filterErrorAndWarnings,
	restoreErrorAndWarnings = require('enyo-console-spy').restoreErrorAndWarnings;

beforeEach(watchErrorAndWarnings);

afterEach(function (done) {
	var actual = filterErrorAndWarnings(/(Invalid prop|Failed prop type|Unknown prop)/);
	var expected = 0;
	restoreErrorAndWarnings();
	if (actual.length > expected) {
		console.error('PropType Failure: ' + this.currentTest.parent.title + ' at "' + this.currentTest.title + '"');
	}
	done();
	expect(actual).to.have.length(expected);
});
