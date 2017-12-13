/* global TEST_WORKSPACE_CONTEXT */
/* eslint no-var: off */

var Enzyme = require('enzyme');
var Adapter = require('enzyme-adapter-react-15');

Enzyme.configure({adapter: new Adapter()});

const context = require.context(TEST_WORKSPACE_CONTEXT, true, /.*(?!node_modules|dist|build).*-specs.js$/);
context.keys().forEach(context);
