# @enact/cli

A standalone dev environment for Enact apps using Webpack, Babel, React, and a collection of other tools.

## Installation

All that's needed to install @enact/cli is to use npm to install it globally. For Linux `sudo` may be required.
```
npm install -g @enact/cli
```

>Note: Node 6.x or greater required.

## Creating a new App

The only time you're ever want to directly use the Enact CLI is when you want to create a new project.

```sh
enact create [directory]
```

This will generate a basic App template, complete with npm scripts and dependencies setup. If no directory path is specified, it will be generated within the working directory.

>Advanced: If you've used `npm link` on separate installations of the Enact repo, you can run `enact link` afterwards to link in any available enact libraries.

## Available Commands

Enact supports several commands, each accessible through the `enact` command and through npm aliases in `package.json`. For help on individual commands, add `--help` following the command name. The commands are:

### `enact serve` (aliased as `npm run serve`)

Builds and serves the app in the development mode.<br>
Open [http://localhost:8080](http://localhost:8080) to view it in the browser.

The page will reload if you make edits.<br>

### `enact pack` (aliased as `npm run pack`, `npm run pack-p`, and `npm run watch`)

Builds the project in the working directory. Specifically, `pack` builds in development mode with code un-minified and with debug code included, whereas `pack-p` builds in production mode, with everything minified and optimized for performance. Be sure to avoid shipping or performance testing on development mode builds.

### `enact clean` (aliased as `npm run clean`)

Deletes previous build fragments from ./dist.

### `enact lint` (aliased as `npm run lint`)

Runs the Enact configuration of ESLint on the project for syntax analysis.

### `enact test` (aliased as `npm run test`, `npm run test-json`, and `npm run test-watch`)

These tasks will execute all valid tests (files that end in `-specs.js`) that are within the project directory. The `test` is a standard execution pass, `test-json` uses a json reporter for output, and `test-watch` will set up a watcher to re-execute tests when files change.

### `enact license` (aliased as `npm run license`)

Outputs a JSON representation of the licenses for modules referenced by the current project as well as any licenses of modules used by `@enact/cli` that may be included in a production build of an app.


## Enact Build Options

The @enact/cli tool will check the project's `package.json` looking for an optional `enact` object for a few customization options:

* `template` _[string]_ - Filepath to an alternate HTML template to use with the [Webpack html-webpack-plugin](https://github.com/ampedandwired/html-webpack-plugin).
* `isomorphic` _[boolean|string]_ - If `true`, it indicates the default entrypoint is isomorphic-compatible (and can be built via the `--isomorphic` @enact/cli flag). If the value is a string, then it will use that value as a filepath to a custom isomorphic-compatible entrypoint.
* `title` _[string]_ - Title text that should be put within the HTML's `<title></title>` tags. Note: if this is a webOS-project, the title by default will be auto-detected from the appinfo.json content.
* `ri` _[object]_ - Resolution independence options to be forwarded to the [LESS plugin](https://github.com/enyojs/less-plugin-resolution-independence).
* `screenTypes` _[array|string]_ - Array of 1 or more screentype definitions to be used with prerender HTML initialization. Can alternatively reference a json filepath to read for screentype definitons. Defaults to moonstone definitions.
* `deep` _[string|array]_ - 1 or more javascript conditions that, when met, indicate deeplinking and any prerender should be discarded.
* `node` _[object]_ - Configuration settings for polyfilling NodeJS built-ins. See `node` [webpack option](https://webpack.js.org/configuration/node/).
* `proxy` _[string]_ - Proxy target during project `serve` to be used within the [http-proxy-middleware](https://github.com/chimurai/http-proxy-middleware).

For example:
```js
{
	...
	"enact": {
		"isomorphic": true,
		"ri": {
			"baseSize":24
		}
	}
	...
} 
```


## Displaying Lint Output in the Editor

Some editors, including Sublime Text, Atom, and Visual Studio Code, provide plugins for ESLint.

They are not required for linting. You should see the linter output right in your terminal. However, if you prefer the lint results to appear right in your editor, there are some extra steps you can do.

You would need to install an ESLint plugin for your editor first.

>**A note for Atom `linter-eslint` users**

>If you are using the Atom `linter-eslint` plugin, make sure that **Use global ESLint installation** option is checked:

><img src="http://i.imgur.com/yVNNHJM.png" width="300">

Then, you will need to install some packages *globally*:

```sh
npm install -g eslint eslint-plugin-react eslint-plugin-babel babel-eslint eslint-plugin-enact eslint-config-enact
```

## Copyright and License Information

Unless otherwise specified, all content, including all source code files and documentation files in this repository are:

Copyright (c) 2012-2018 LG Electronics

Unless otherwise specified or set forth in the NOTICE file, all content, including all source code files and documentation files in this repository are: Licensed under the BSD License (the "License"); you may not use this content except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

Portions of this project are based upon [create-react-app](https://github.com/facebookincubator/create-react-app), Copyright (C) 2016-present Facebook, Inc.
