/* global expect, beforeEach, afterEach, window */
/* eslint no-global-assign:0  no-native-reassign:0 */

const chai = require('chai');
const dirtyChai = require('dirty-chai');
const consoleSpy = require('console-snoop');
const {restoreErrorAndWarnings, filterErrorAndWarnings, watchErrorAndWarnings} = consoleSpy;

chai.should();
chai.use(dirtyChai);

expect = chai.expect;

global.XMLHttpRequest = require('@enact/dev-utils/plugins/PrerenderPlugin/FileXHR');

window.innerWidth = 480;
window.innerHeight = 640;
window.devicePixelRatio = 1;

beforeEach(watchErrorAndWarnings);

afterEach(function(done) {
	const actual = filterErrorAndWarnings(/(Invalid prop|Failed prop type|Unknown prop)/);
	const expected = 0;
	restoreErrorAndWarnings();
	if (actual.length > expected) {
		console.error('PropType Failure:', this.currentTest.parent.title, 'at "', this.currentTest.title, '"');
	}
	done();
	expect(actual).to.have.length(expected);
});
