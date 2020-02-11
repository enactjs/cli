---
title: Building Apps
order: 4
---
## Packaging Source Code
```none
  Usage
    enact pack [options]

  Options
    -p, --production  Build in production mode
    -i, --isomorphic  Use isomorphic code layout
                      (includes prerendering)
    -w, --watch       Rebuild on file changes
    -l, --locales     Locales for isomorphic mode; one of:
            <comma-separated-values> Locale list
            <JSON-filepath> - Read locales from JSON file
            "none" - Disable locale-specific handling
            "used" - Detect locales used within ./resources/
            "tv" - Locales supported on webOS TV
            "signage" - Locales supported on webOS signage
            "all" - All locales that iLib supports
    -s, --snapshot    Generate V8 snapshot blob
                      (requires V8_MKSNAPSHOT set)
    --stats           Output bundle analysis file

```
Run within an Enact project's source code, the `enact pack` command (aliased as `npm run pack` or `npm run pack-p` for production) will process and bundle the js, css, and asset files into the `./dist` directory. An **index.html** file will be dynamically generated.

## Production Mode
By default, projects will build in development mode. When you're code is ready for deployment you can build in production mode. Production mode will minify the source code and remove dead code, along with numerous other minor code optimization strategies.

## Browser Support & Polyfills
The Enact CLI is designed to be compatible with a wide array of browsers and devices. [Browserslist standard](https://github.com/browserslist/browserslist) is used to handle targeting, with Enact's defaults being:

* >1%
* last 2 versions
* last 5 Chrome versions
* last 5 Firefox versions
* Firefox ESR
* not ie < 12
* not ie_mob < 12
* not dead

For all projects built with Enact CLI, `core-js` polyfill is automatically included, so that all stable ECMAScript features are polyfilled across all target browsers. This means that only what's needed will be transpiled or polyfilled from `core-js`. The Browserslist settings can be narrowed or widened at will via [`package.json` settings or `BROWSERSLIST` environment variable](https://github.com/browserslist/browserslist#queries). This means the newer the targeted browsers, the fewer the polyfills and less required transpiling.

However keep in mind that `core-js` is solely for ECMAScript and does not polyfill any browser features. Features like this will need to be manually polyfilled in projects with app-level imports.  For example, to add web animation API, you could add the NPM dependency [`web-animations-js`](https://github.com/web-animations/web-animations-js) and import it at the top of your app's root **`index.js`** source file.

Note: Some ui libraries, like Moonstone, may have their own recommended supported browsers and may differ from the core Enact framework.

## \_\_DEV\_\_ Keyword
In order to make development and debugging simpler, the enact cli supports a special `__DEV__` keyword in both javascript and LESS.

In javascript, for example:

```js
	if (__DEV__) {
		console.log('This is a development build');
	}
```
In development mode, the code will execute correctly, whereas in production mode it will get caught and removed as unused dead code. This allows for custom development-only debug code.

Similarly, in LESS:

```css
	div when (@__DEV__ = true) {
		background: blue;
	}
```
In development mode, the LESS remains intact and used, but in production mode, the `@__DEV__` variable is false and the CSS isn't output. This allows for custom development-only styling. See LESS's [CSS Guards](http://lesscss.org/features/#css-guards-feature) for more details on usage.

## Environment Variable Injection

Some scenarios may require sensitive or dynamic data to be kept outside a project itself.  All environment variables that are prefixed with `REACT_APP_` will be supported for injection into the app output. For example, with `REACT_APP_MYVAR="Hello World"` environment variable, usage of `process.env.REACT_APP_MYVAR` will be replaced with `"Hello World"`.

Furthermore, Enact CLI supports a hierarchical `.env` format for declaring environment variables within a file.

The following `.env` files will be processed, in overriding order:

* `.env`: Default.
* `.env.local`: Local overrides. **This file is loaded for all environments except test.**
* `.env.development`, `.env.test`, `.env.production`: Environment-specific settings.
* `.env.development.local`, `.env.test.local`, `.env.production.local`: Local overrides of environment-specific settings.

Ideally `.env` files **should be** checked into source control (with the exclusion of `.env*.local`).

Each `.env` file supports internal variable expansion to allow for composing complex dynamic variables. For example:
```none
REACT_APP_NAME=foobar
REACT_APP_PATH=example/$REACT_APP_NAME
```

Note: Changing any environment variables will require you to restart the development server if it is running.

## TypeScript Support

[TypeScript](https://www.typescriptlang.org) syntax support is an optional feature.  All TypeScript-based code will be automatically transpiled like normal JavaScript and packaged by Enact CLI with no additional user setup needed. However, this does not include enforced type-checking, solely the syntax transpiling.  Type-checking will occur automatically at build time, however the `typescript` dependency must be on the project itself.  You'll also want to install type definition packages for React, ReactDOM, and Jest.

It's easiest to begin from the start with TypeScript by using the `typescript` template (`@enact/template-typescript` on NPM). To add TypeScript support to an existing project:

```bash
npm install --save typescript @types/react @types/react-dom @types/jest
```

Optionally, [TSLint](https://palantir.github.io/tslint/) can be installed globally or locally and configured within a project to enable linting support within the `enact lint` command.

## Isomorphic Support & Prerendering
By using the isomorphic code layout option, your project bundle will be outputted in a versatile universal code format allowing potential usage outside the browser. The Enact CLI takes advantage of this mode by additionally generating an HTML output of your project and embedding it directly with the resulting **index.html**. By default, isomorphic mode will attempt to prerender only `en-US`, however with the `--locales` option, a wade variety of locales can be specified and prerendered. More details on isomorphic support and its limitations can be found [here](./isomorphic-support.md).

## V8 Snapshot Generation
The v8 snapshot blob creation feature is highly experimental and temperamental depending on your code. It is considered an extension of the isomorphic code layout, bringing along all the same requirements. Given the highly-specific nature of a v8 snapshot blob being tied to particular versions of Chrome/Chromium/Electron/etc., developers must provide their own copy of the `mksnapshot` binary and have its filepath set to the `V8_MKSNAPSHOT` environment variable.

## Watcher Option
Similar to the [`enact serve`](./serving-apps.md) command, the watcher will build the project and wait for any detected source code changes. When a change is detected, it will rebuild the project. The rebuild time will be significantly faster since the process can actively cache and build only what has changed.

## Stats Analysis
The Bundle analysis file option uses the popular [webpack-bundle-analyzer](https://github.com/webpack-contrib/webpack-bundle-analyzer) to create a visual representation of the project build to **stats.html**, showing the full module hierarchy arranged by output size. This can be very useful in determining where bloat is coming from or finding dependencies that may have been included by mistake.
