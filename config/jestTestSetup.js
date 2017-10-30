var chai = require('chai');
var dirtyChai = require('dirty-chai');
var consoleSpy = require('console-snoop');

var {restoreErrorAndWarnings, filterErrorAndWarnings, watchErrorAndWarnings} = consoleSpy;

chai.should();
chai.use(dirtyChai);

expect = chai.expect;

global.__DEV__ = true;

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
