const eslintConfigEnact = require('eslint-config-enact/index');
const eslintConfigEnactStrict = require('eslint-config-enact/strict');

const loadedEnactConfig = process.env.FRAMEWORK === true ? eslintConfigEnactStrict : eslintConfigEnact;

module.exports = [...loadedEnactConfig];
