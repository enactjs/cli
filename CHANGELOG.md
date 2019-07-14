## 2.4.1 (July 14, 2019)

* Fixed alias prioritization for iLib to correctly locate/index iLib when build framework builds.

## 2.4.0 (July 12, 2019)

* Added support for `ilib` external NPM package (with backward compatibility for `@enact/i18n/ilib`).

## 2.3.1 (July 2, 2019)

Fixed "Unexpected identifier" error on Node 6.x by using a compatible release of `find-cache-dir` subdependency.

## 2.3.0 (June 10, 2019)

### pack

* Added React hook linting to help with adhering to the [rules of hooks](https://reactjs.org/docs/hooks-rules.html).
* Updated polyfills to the `core-js/stable` stable featureset rather than all stable+draft polyfills.
* Updated default browserslist config from `last 2` stable versions of Chrome and Firefox to `last 5`.
* Fixed build failing when prerendering for multiple locales.

### serve

Added `./__mocks__` project directory as an optional allback directory for server asset contents (secondary to `./public`).

## 2.2.0 (April 28, 2019)

Updated all dependencies to latest releases.

### pack

* Switched from `@babel/polyfill` to `core-js@3` for dynamic polyfill support.
* Switched to `.babelrc` Babel config to isolated `babel.config.js`.

### serve

* Fixed serve failing on TypeScript projects.
* Projects no longer use external CSS and now will use inline `<style>` tags (similar to `create-react-app`).
* Disable stylesheet sourcemaps to avoid async blob-based style loading in `style-loader`.

### link

* Fixed linking when custom NPM prefixes are used via `.npmrc` files.

### eject

* Fixed ejected apps not correctly using Babel configuration and failing to transpile JSX during pack/serve.

## 2.1.0 (March 26, 2019)

Updated all Babel dependencies up to 7.3.x to fix edge-case errors with `let` keyword usage, among other fixes.

### pack

* Added support for a `public` directory, where static assets within are copied, at buildtime, to `./dist`.
* Added support for `process.env.PUBLIC_URL` which is hardcode to `'.'`, for consistency with 3rd party standards.

### serve

* Added support for serving/watching file contents within `./public`.

### transpiled

* Fixed `--commonjs` option not being respected in transpiling process.

## 2.0.2 (February 19, 2019)

### lint

* Added support for `eslint-plugin-jest`, with the `no-focused-tests` rule set to error for the strict ruleset (`--strict`).

## 2.0.1 (February 13, 2019)

### test

* Fixed tests being ignored when out-of-project parent directories are named `coverage`, `dist`, or `build`. Such is the case on TravisCI.

## 2.0.0 (February 11, 2019)

Updated all dependencies to latest releases and added support for TypeScript. In keeping with community standards, CSS/LESS is now processed in the global scope, while modular CSS can be retained by using the `.module.css`/`.module.less` extension or setting the `forceCSSModules` Enact project setting in `package.json`.

### create

* Updated default included moonstone template for latest Enact with `.module.less` modular LESS naming format.

### link

* Improved handling and errors when linking into a non-Enact project.

### pack

* Refactored build procedure for latest Webpack 4 and Babel 7.
* Added support for stage-3 CSS via `postcss-preset-env`, with `custom-properties` temporarily disabled while a bug is being resolved.
* Added support for `.env` fileformat to declare environment variables for parsing/app-embedding.
* Added support for TypeScript compilation.
* Added opt-in support for TypeScript typechecking at buildtime (via `typescript` app-side dependency).
* Additional CSS optimization applied via `optimize-css-assets-webpack-plugin`.
* Modified Babel configuration to use built-in APIs rather than transpiling mini re-implementations.
* Modified CSS file handling to only process modular CSS on the `.module.css` extension.
* Modified LESS file handling to be independence (only running LESS files through the LESS compiler), with `.module.lesas` file extension enabled modular context.
* Switched from `less-plugin-resolution-independence` to `postcss-plugin-resolution-independence` to apply to both LESS and CSS build chains.
* Switched from `uglifyjs-webpack-plugin` to `terser-webpack-plugin` as Uglify is no longer actively developed.
* Switched from `extract-text-webpack-plugin` to `mini-css-extract-plugin` for CSS content output.
* Removed direct autoprefixer usage as `postcss-preset-env` contains embedded support.
* Removed support for `.__DEV__` CSS class and replaced it with `@__DEV__` LESS variable for usage as a CSS guard.
* Removed legacy custom browser targetting format and now following `browserslist` standard for desclaring supporting browsers.

### lint

* Added support for TSLint, when linting a TypeScript project and `tslint` is globally or locally installed.

### test

* Replaced Karma/PhantomJS/Mocha/DirtyChai testing stack with a Jest-based alternative implementation.
  * Supports Jest options like `--watch` and `--coverage` as a result.
* Removed custom Enzyme webpack plugin since we can pre-setup Enyme directly for Jest usage.
* Removed Sinon in favour of Jest built-in mocking/spy functionality.

### transpile

* Added `--commonjs` option, enabled by default, which will convert all ES6 import/export statements into CommonJS.
* LESS files will now be transpiled into CSS. Directories named `style` will not transpile LESS and will just copy the files (useful for sharing LESS variables/mixins). Directories named `internal`  within `styles` will be ignored.

## 1.2.1 (December 7, 2018)

* Fixed test execution failures where an old copy of Enzyme was erroring out on the latest React 1.6 releases.

## 1.2.0 (September 27, 2018)

* Updated to latest `@enact/dev-utils` and `mocha-react-proptype-checker` dependency releases.

### create

* Added `core-js` as a direct dependency when creating a new project with `--local` to prevent conflicting polyfill versions.

### pack

* Added support for `-m`/`--meta` option to override the `enact` object metadata from the `package.json`.

## 1.1.1 (August 10, 2018)

### create

* Updated default included moonstone template for Enact 2.x.

### pack

* Fixed locale classes failing to be applied on a multi-locale prerender when deep-linking is used.
* Fixed font style prerendering, with added support for font overrides.

## 1.1.0 (July 16, 2018)

### pack

* Added new option `--verbose` which outputs detailed build information as the process ocurrs, for specific information on what modules are being process and when.
* Added support for dynamically injecting `REACT_APP_` prefixed environment variables into app code, when used under `process.env`.
* Added support for `@global-import "<file>";` syntax to import CSS files in a global context.
* Added support for boolean flag option `externalStartup` in the enact options in a project's `package.json`. When true, any prerender startup scripts will be external file assets, rather than embedded inline javascript.
* Fixed `@babel/polyfill` failing to be transpiled into targetted `core-js` components. Additionally now ensures polyfills aren't loaded more than once.
* Fixed v8 snapshot support for React 16.4.1.
* Relocated the old `./config/proptype-checker.js` into its own standalone [`mocha-react-proptype-checker`](https://www.npmjs.com/package/mocha-react-proptype-checker) package.
* Production mode limits the UglifyJS options to ECMA 5 optimizations only.
* Disabled CSS minifier support for calc simplification due to bugs with CSS variables that contain 'calc' string of letters. See https://github.com/postcss/postcss-calc/issues/50.

### lint

* Updated React ESLint plugin to `7.9.1` and Enact ESLint plugin to `1.2.0`.

### template

* Relocated default moonstone app template into a separate standalone [@enact/template-moonstone](https://www.npmjs.com/package/@enact/template-moonstone) package depdendency.

### eject

* Initial implementation of a `create-react-app`-style project ejection feature. A permanent process which extracts an app from the Enact CLI environment and converts it standalone, with exposed development tool config files.
* Supports the `--bare` eject operation flag which removed the Enact CLI sugar from devtool commands and uses the barebones underlying 3rd party tools.

## 1.0.4 (April 26, 2018)

Updated dependencies to support React/ReactDOM 16.3.2.
Improved CLI runtime executing via `v8-compile-cache` optimizations.

### pack

* Support `@enact/core/snapshot` window handling APIs when using v8 snapshot.
* Preserve HTML comment nodes in prerendered app HTML content (to support empty nodes in React 15).

## 1.0.3 (April 12, 2018)

### pack

* Fixed memory leak during prerendering in isomorphic builds, where babel-polyfill would be loaded and disrupt the global Node scope.

### template

* Default autodetection naming scheme will now filter out `enact-template-` and `template-` prefix.

### transpile

* Ensure development helper transpile plugins are not applied to standalone ES5 transpile operations.

## 1.0.2 (March 30, 2018)

Updated [`resolution-independence`](https://github.com/enactjs/less-plugin-resolution-independence) plugin dependency with fixed support Less 3.x.
Updated [`@enact/dev-utils`](https://github.com/enactjs/dev-utils) dependency with fixes for resolution-independence configuration autodetection and React16-based framework builds.

## 1.0.1 (March 26, 2018)

### pack

* Updated `@enact/dev-utils` fixing React 16 issues with v8 snapshot support.

### template

* Fixed automatic name detection for NPM packages when using version/tag specifiers.

### lint

* Added `--framework` temporary alias for `--strict` to fix build systems while they update to current syntax.

## 1.0.0 (March 15, 2018)

Dependency updates for most components.
Moved all plugins, mixins, and utility functions into [@enact/dev-utils](https://www.npmjs.com/package/@enact/dev-utils) package.
Refactored all commands to support Promise-based API access for potential integration with 3rd party build systems.
Enact CLI source code now updated for [`eslint-plugin-import`](https://github.com/benmosher/eslint-plugin-import) and [`prettier`](https://github.com/prettier/prettier) formatting.

### create

* Default moonstone template updated for latest Enact 1.x/React 15.x dependencies.
* Updated to support customized templates via `-t`/`--templates` option.
* Refactored creation handling to be general purpose and support dynamic templates modifying the execution.

### link

* Only link `@enact`-scoped dependencies found within the project `package.json` rather than all globally linked `@enact`-scoped packages.

### transpile

* Added support for `-i`/`--ignore` regex string to ignore filepathes when transpiling/copying.

### pack

* Added support for targeted builds. Can be set via a `target` enact `package.json` property or via [Browserslist](https://github.com/ai/browserslist) format.
* Added support for Electron build target.
* Switched to use `@babel/preset-env` and `@babel/polyfill` for on-demand transpiling/polyfilling to targetted build platforms.
* Production mode build uses `uglifyjs-webpack-plugin` to support ES6-based minification (until the upgrade to webpack 4)
* Dynamic handling of the `enact` options with `package.json`, with support for `theme` preset values that simplify setup of for given Enact GUI theme libraries.
* Allow `electron-renderer` webpack target to support `browser` as a main field.
* Isomorphic builds now build `en-US` locale by default. Switched `-l`/`--locales` as a public option, allowing specifying of locale-lists for prerendering.
* Switched `-s`/`--snapshot` as a public option. Creates a v8 snapshot blob from the app bundle (provided mksnapshot binary is provided as `V8_MKSNAPSHOT` environment variable).
* Updated to Webpack 3.x support.
* Updated to Babel 7.x beta support.

### serve

* Allows attempted serving on all webpack targets other that `node`, `async-node` and `webworker`.

### test

* Fixed testing support for Windows when using modules that accessed `@enact/i18n`.

### template

* Full template management support. See the [docs](./docs/template-management.md) for more details.
* Templates can be sourced from git URIs, npm packages, or local directories.
* Able to install, link, remove, list templates.
* Able to set templates as default when using `enact create`.
* Templates can be static or dynamic generators, optionally hooking into the `enact create` execution.

### lint

* Added a `--fix` option to automatically attempt to have eslint fix linting errors.

### license

* Updated to include `@babel/polyfill` and `@babel/core` licenses in project scanning.

## 0.9.8 (February 15, 2018)

* Updated all links for enactjs github organization and fixed a broken docs link.

### serve

* Restored usage of extract-text-webpack-plugin with updated Webpack 3.6.0.

## 0.9.7 (January 11, 2018)

Updated copyright and license information for 2018 year.
Minor updates to documentation phrasing.
Fixed root-level `-h`/`--help` overriding command-level help information.

## 0.9.6 (December 21, 2017)

Renamed from `enact-dev` to `@enact/cli` for consistency, along with updated documentation.

## 0.9.5 (December 14, 2017)

Locked down dependencies to avoid potential regressions in patch updates to dependencies (as was the case with [2.0.8 karma-webpack](https://github.com/webpack-contrib/karma-webpack/issues/284)).

## 0.9.4 (November 13, 2017)

### pack

* Improved prerender base font detection on irregular screens.
* Deep linking now injects prerendered app HTML dynamically, rather than removing prerendered HTML nodes.

## 0.9.2 (September 7, 2017)

### create

* Template updated for Enact 1.8.0.

### transpile

* Fixed ES6 module format not being transpiled to CommonJS standard.

### pack

* Improved support for `screenTypes` within the `enact` object in the `package.json`. Can now be:
	* Array of screen literal values (empty array fo no screen types to pass)
	* String filepath to a local project json file
	* String path to a dependency module json file
	* Undefined/falsey to fallback to default Moonstone
* Added support for `deep` option within the `enact` object in the `package.json`. It represents 1 or more javascript conditions that, when met, indicate the page load was originating from an external deep link, and the prerender should not be shown (as the initial state of the window will not be the prerendered content). This can be a string or a string array.

## 0.9.0 (August 21, 2017)

Dependencies updated to latestly release, including support for Webpack 3.x.
Codebased updated for ES6 syntax and the minimum version is NodeJS is now 6.4.0.

### create

* Template updated for Enact 1.7.0 and React 15.6.1

### pack

* Upgraded to Webpack 3 and associated loaders/config layout.
* Removed `url-loader` usage in favour of strictly `file-loader` only.
* Switched from implicit string loader names to explicit relative loader filepath resolving.
* Prevent removal of outdated CSS properties by `autoprefixer` in `postcss`
* Prerenders moonstone font-face declarations into HTML head to preload fonts.
* Output error messages after build and have watcher mode disable bailing to ensure webpack doesn't exit during watching.
* Properly bail on error and properly avoid bailing on `--watch` flag.
* Disable module traces when errors occur.
* Show any warnings sucessful `pack` executions (not just when there are errors).
* Uses the `react-dev-utils` eslint formatter for displaying eslint warnings and errors.
* Limited `autoprefixer` flexbox prefixing to final and IE versions of flexbox implementation.
* Added support for `postcss-flexbugs-fixes` to automatically fix known platform-specific flexbox issues with workarounds.
* Disabled webpack performance output.

### serve

* Support greater dev server functionality and UI from `react-dev-utils`.
* Integrated support for `react-error-overlay`.
* Fixed module access failure when rebuilding after editing LESS/CSS.

### test

* Activity timeout extended for larger testbases to 60 seconds.
* Removed unneeded `extract-text-webpack-plugin` usage.
* Carried over `url-loader` and `postcss` changes from `pack` configuration.

## 0.8.2 (May 31, 2017)

Updated `ilib-webpack-plugin` dependency to correctly support moonstone internal localization and associated fixes.

## 0.8.1 (May 31, 2017)

### create

* Template updated for Enact 1.2.2

### pack

* Fixed prerendering of apps that use lazy loaded chunks.
* Support for moonstone internal localization.

### serve

* Disable host checks to allow IP serving.

### test

* Added Array.from to the list of polyfills used with Phantomjs in tests.

### license

* Added license checker command to detect all licenses used by content within an app.

## 0.8.0 (April 21, 2017)

With the exception of webpack2-related packages, all dependencies have been updated to their current releases.

### create

* Template updated for Enact 1.1.0 and React 15.5.4.
* Added `prop-types` dependency.
* Fixed `--local` option to use `enact-dev` on NPM rather than git shorthand.

### serve

* Fixed `--port` option parsing along with support for `PORT` environment variable.

### pack

* Improved console output when prerendering in isomorphic code layout.
* Uses `cheap-module-source-map` instead of `source-map`. See https://github.com/webpack/webpack/issues/2145#issuecomment-294361203
* Enabled support for eslint caching to improve development mode build speed.
* Appinfo files will now correctly be ignore by the ilib-webpack-plugin (as they're already handled by webos-meta-webpack-plugin).
* Improved communication between plugins.

### test

* Updated use react-test-renderer with Enzyme with alias fallback to avoid any compatibility issues.

## 0.7.0 (March 31, 2017)

Added support for a link command (`enact link`) as a shorthand to link in Enact library dependencies.

### pack

* Added support for appinfo.json sysAssetsBasePath and $-prefix in webos-meta-webpack-plugin.
* Will now warn about performance when building in development mode.
* HTML template will now be used in all situations and can be customized as desired.
* Vastly rewritten isomorphic app prerendering support with improved reliability and mmemory management.
* Depreciated prerendering of isomorphic apps within the HTML template has been removed. Please ensure all app entrypoints are able to self-render. See [this example](https://github.com/enactjs/cli/blob/master/template/src/index.js).

### test

* Improved error handling with plugins to prevent certain scenarios that could cause tests to fail.

### lint

* Updated lint rules for disabling `no-spaced-func` and `no-undefined` warnings for non-strict ruleset.

## 0.6.0 (February 22, 2017)

All enact-dev dependencies have been updated to latest applicable revisions. If you are using editor-based linting, please update your global dependencies to match.

### create

* Template updated for Enact 1.0.0-beta.3 and React 15.4.2.

### pack

* Transitioned from the iLib-loader to a new iLibPlugin with enhanced support for compilation-unique caching in Enact 1.0.0-beta.3. This is *not* backward compatible; please update to Enact 1.0.0-beta.3 or use an earlier release of enact-dev.
* Supports code splitting/lazy-loading via ES6 `import()` syntax (limited to static string values).
* WebOSMetaPlugin updated to support dynamicalling adding `usePrerendering:true` to appinfo.json files as needed.

### test

* Added Map polyfill support
* Fixes a code interaction issue with WebOSMetaPlugin that caused tests to fail.

### lint

* Enact ESLint plugin updated to support `handlers` block in `kind(). Also adds propType validation for props used by handler and computed functions.
* Enact ESLint config updated to replace deprecated `babel/array-bracket-spacing` with `array-bracket-spacing`.
* Additional options may be passed to the lint command.

## 0.5.1 (January 27, 2017)

### create

* Template updated for Enact 1.0.0-beta.2 and React 15.4.2.
* Template's .gitignore file now correctly includes `dist`.

### pack

* Added a `node` Enact build option to support polyfilling NodeJS components. See [here](https://github.com/enactjs/cli/blob/master/README.md#enact-build-options) for more info.
* All localized appinfo.json resources and assets will now be correctly copied to the output directory.

### test

* Added a polyfill for String.prototype.repeat, as phantomjs lacks the API.
* Webpack build warnings will no longer spam the console in certain scenarios.
* Test action will now automatically fail when no test suite is found. This was done to allows tests which build incorrect or have missing modules to correctly fail. See [#38](https://github.com/enactjs/cli/pull/38) for more background information.


## 0.5.0 (December 20, 2016)

Several additional documentation files have been added to the `docs` directory, to cover common topics.

### create

* Template updated for Enact 1.0.0-beta.1
* Template has been updated to use a single isomorphic-compatible entrypoint [index.js](https://github.com/enactjs/cli/blob/master/template/src/index.js).

## serve

* Added support for `--host` option to specify a server host IP address to use.
* Added support for `--port` option to specify a server port humber to use.
* The host/port details will now correctly output when linter warnings occur.

### pack

* Added primary support for singluar entrypoints for both regular and isomorphic code layouts.
* Refactored build customization features (like `--isomorphic` and `--stats`) into separate files and cleaned up the implementations.
* Depreciated isomorphic HTML-side rendering. Isomorphic entrypoints should render to the DOM when in a browser environment.

### clean

* Fixed clean command failing due to missing internal parameters.


## 0.4.0 (December 5, 2016)

### create

* Renamed `init` command to `create` for clarity of purpose.
* Template updated for Enact 1.0.0-alpha.4

### transpile

* Fixed fs-extra depreciation warning about using a RegExp in copying.

### pack

* Added support for overriding with a custom HTML template.
* Viewport meta tags added to restrict user-scale to 1.
* Documented `package.json` Enact build options in README.md.
* Fixed app rendering in isomorphic code layout, where apps exported as ES6 default would fail to render.
* Fixed ReactPerf bundling with React 15.4.x, with backwards support for earlier versions.
* Fixed `--watch` support.

### test

* Properly ignore ./dist and ./build directories when searching for tests.
* Removed unneeded sourcemap support to greatly improved memory management and avoid js heap crashes in PhantomJS.


## 0.3.0 (November 7, 2016)

### init

* Sanitizes directory name so only valid characters are included as the package name.
* Template updated for Enact 1.0.0-alpha.3

### pack

* Added `-s`/`--stats` flag to generate a stats.html bundle analysis report.
* Fixed development build failure when generating sourcemaps.
* Refactored ESLint configuration with an optional strict mode.
* Updated `eslint` to use 3.9.1 for new rule support.
* Updated `eslint-plugin-enact` to 6.5.0 for new rule support.

### serve

* Browser no longer automatically opens. Use `-b`/`--browser` flag to re-enable the feature.
* Fixed serve failure when generating sourcemaps.


## 0.2.0 (October 21, 2016)

* Refactored entire project into a dedicated standalone global CLI with features/functionality integrated from 
[create-react-app](https://github.com/facebookincubator/create-react-app)

### init

* Added `-h`/`--help` information.
* Verifies the user has a compatible Node version.
* Verifies the destination directory is safe to create a project in.
* Template now include webOS meta files (appinfo.json, icons.png, etc.).
* Template updated for Enact 1.0.0-alpha.2
* The package.json and appinfo.json will update their respective `name`/`id` to the project directory's name.
* Added `--verbose` flag option to provide detailed logging.
* Added `--link` flag option to link any dependencies that have been `npm link` rathen than install.
* Added `--local` flag option to include enact-dev as a local devDependency (not recommended for general usage).
* Rennovated user interface with basic NPM script usage information included.

### pack

* Switched from using `babel-polyfill` to a more simplified set of polyfills covering Promise, Object.assign, 
  String.prototype.codePointAt, String.fromCodePoint, Math.sign, and Fetch APIs
* Scans files with ESLint as part of the build process, failing on errors.
* Switched from OS-level to a local ./node_modules/.cache/ location for babel caching in development mode.
* Support auto-prefixing of CSS.
* Supports development-only CSS class `.__DEV__` which will exist withing development builds but be removed in production
  builds.
* Includes CaseSensitivePathsPlugin to ensure paths meet case-sensitive requirements regardless of system.
* Converted webos-meta-loader into a standalone plugin that will autodetect the appinfo.json and ensure its webOS meta assets get
  copied over during buildtime. Additionally, if an appinfo.json is found, the `title` value will be inserted into the output
  HTML `<title></title>`.
* PrerenderPlugin now handles Node-based Fetch API to allow isomorphic fetch operations (via @enact/fetch).
* PrerenderPlugin will output a stack strace on failure and allow continue the build without prerendering.
* Isomorphic build format is no longer its own mode, but is now a `-i`/`--isomorphic` flag option, which will apply isomorphic layout
  to whatever the active build mode is (development or production). When the flag is present, the `isomorphic` package.json enact property
  will be used as the entrypoint.
* The `prerender` enact property within package.json has been renamed `isomorphic` for clarity (backward compatible)
* Simplified console output, detailing output files, filesizes, and changes in size from previous build.

### serve

* Verifies the desired port (8080) is open and allows selecting of an alternate if occupied.
* Simplified output with understandable messages.
* Optional proxy server support.
* Webpage will automatically open when a dev-server session begins.
* The dev-server client in `react-dev-utils` allows build error details to render into the browser window.

## 0.1.0 (September 29, 2016)

* Initial internal release
