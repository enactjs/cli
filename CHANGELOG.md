## 0.3.0 (November 7, 2016)

### init

* Sanitizes directory name so only valid characters are included as the package name.

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