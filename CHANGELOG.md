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
* Depreciated prerendering of isomorphic apps within the HTML template has been removed. Please ensure all app entrypoints are able to self-render. See [this example](https://github.com/enyojs/enact-dev/blob/master/template/src/index.js).

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

* Added a `node` Enact build option to support polyfilling NodeJS components. See [here](https://github.com/enyojs/enact-dev/blob/master/README.md#enact-build-options) for more info.
* All localized appinfo.json resources and assets will now be correctly copied to the output directory.

### test

* Added a polyfill for String.prototype.repeat, as phantomjs lacks the API.
* Webpack build warnings will no longer spam the console in certain scenarios.
* Test action will now automatically fail when no test suite is found. This was done to allows tests which build incorrect or have missing modules to correctly fail. See [#38](https://github.com/enyojs/enact-dev/pull/38) for more background information.


## 0.5.0 (December 20, 2016)

Several additional documentation files have been added to the `docs` directory, to cover common topics.

### create

* Template updated for Enact 1.0.0-beta.1
* Template has been updated to use a single isomorphic-compatible entrypoint [index.js](https://github.com/enyojs/enact-dev/blob/master/template/src/index.js).

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
