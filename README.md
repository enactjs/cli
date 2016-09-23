# enyo-config
A standalone dev environment for Enyo apps using Webpack, Babel, and a collection of other tools.

## Installation
All that's needed to install is to use npm and save enyo-config as a devDependency.
```
npm install enyojs/enyo-config --save-dev
```
If you want the dev environment plus a full test suite (a considerable extra amount of overhead), then you can:
```
npm install enyojs/enyo-config#test-suite --save-dev
```

## Included Binaries
To help simplify certain aspects of development, enyo-config includes these helper binaries:
* `enyo-transpile` - Transpiles the code from ES6 to ES6 into a ./build directory
* `enyo-clean` - Deletes any applicable ./build or ./dist directories

As a result of enyo-config encapsulating the full dev environment, some situations like linking, global-style installation, and Node 4.x require particular dependency binaries to be exposed for use by apps/libraries. The following binaries are exposed with an 'enyo-' prefix to avoid any collision:
* `enyo-webpack`
* `enyo-webpack-dev-server`
* `enyo-karma` (only on test-suite)

## Webpack Config
There are 3 preset configuration options built-in to enyo-config. Each of them will deeply mix in passed parameters and support standard webpack layouts.

#### App Config
This is the standard app config and the one you'll probably want to use. It features support for React, Babel, LESS/CSS modules, asset handling, optional resolution independence, generated html, built-in babel-polyfill, etc.. It has extra support for the following special properties used in the building of the final configuration:
* `title` - Title to be inserted into the html file's header `<title>/<title>`
* `ri` - resolution independence options to be passed to the [LESS plugin](https://github.com/enyojs/less-plugin-resolution-independence). When undefined, the plugins will no be used. An empty object will use default values for the plugin (baseSize=16).

Usage example webpack.config.js:
```
var config = require('enyo-config');
module.exports = config.app({
	title: 'My Application',
	ri: {
		baseSize: 24
	}
});
```

#### Container Config
This is a specialized variation on the regular app config. The main difference is that specified libraries, built from the library config below, are implicitly expected in the browser page memory as external libraries. No html is generated, purely the js/css/assets. This allows apps to use Enyo libraries in a modular fashion and still be fully compatable with both app config and container config without any sourcecode changes.

The container config can be explicitly envoked:
```
var config = require('enyo-config');
module.exports = config.container({
	namedLibs: [
		'enyo-core',
		'enyo-ui',
		'enyo-ui-moonstone'
		// ... etc.
	],
	ri: {
		baseSize: 24
	}
});
```
More conveniently, however is to simply code for the regular app config then when you can automatically switch to a container build by setting the enironment variable ENYO_CONTAINER, a comma-separated list of which libraries can be maked for external use.

#### Library Config
The library configuration will allow webpack to build a standalone library script the container apps can interpret and access correctly. Enyo libraries are intended to support modular calls, so this uses a custom Webpack plugin to create a library that retains its modular structure internally. It has extra support for the following special properties used in the building of the final configuration:
* `name` - global variable name for the library`<title>/<title>`
* `ri` - resolution independence options to be passed to the [LESS plugin](http://github.com/enyojs/less-plugin-resolution-independence). When undefined, the plugins will no be used. An empty object will use default values for the plugin (baseSize=16).

Usage example webpack.config.js:
```
var config = require('enyo-config');
module.exports = config.library({
	name: 'my_lib',
	ri: {
		baseSize: 24
	}
});
```

## Babel Config
Within enyo-config is a customize babelrc setup. If, for some reason, you need access to it, you can access its path via:
```
var config = require('enyo-config');
var babelrc = config.babelrc;

// use babelrc path for something
// for example, could use it with the 'extends' option in Babel
// see http://babeljs.io/docs/usage/options/
```

## ESlint Config
Similarly, there is an eslint ruleset within enyo-config that can be harnessed by apps or libraries. Just create a project level `.eslintrc.js` file containing:
```
module.exports = require('enyo-config').eslint;
```
The eslint rules can be be modified if desired however they've been set to current in-house standards for Enyo and are most useful as is.

To test with eslint, be sure to global install:
```
npm install -g eslint eslint-plugin-react eslint-plugin-babel babel-eslint
```
Then you can run eslint from any project root anytime. For more information on the Enyo ruleset used, see [enyojs/eslint-config-enyo](http://github.com/enyojs/eslint-config-enyo).

## Test-Suite
The test-suite edition of enyo-config includes a collection of tools for software testing: enzyme, mocha, sinon, phantomjs, chai, karma, etc.. In addition, development builds of apps will include a [window.ReactPerf object](https://facebook.github.io/react/docs/perf.html) which can be used from the Chrome inspector console.

A Karma configuration is built-in to simplify the usage and setup. Similar to the webpack app config, it supports overrides passed in and has special support for an `ri` resolution independence object.

Usage example karma.conf.js:
```
var config = require('enyo-config');
module.exports = config.karma({
	ri: {
		baseSize: 24
	}
});
```
