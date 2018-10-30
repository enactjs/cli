// @remove-file-on-eject
/**
 * Copyright (c) 2014-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const path = require('path');
const babelJest = require('babel-jest');

module.exports = babelJest.createTransformer({
	extends: path.join(__dirname, '..', '.babelrc.js'),
	babelrc: false,
	configFile: false
});
