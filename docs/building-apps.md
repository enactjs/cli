---
title: Building Apps
order: 4
---
## Packaging Source Code
```none
  Usage
    enact pack [options]

  Options
    -o, --output      Specify an output directory
    --content-hash    Add a unique hash to output file names based on the content of an asset
    -w, --watch       Rebuild on file changes
    -p, --production  Build in production mode
    -i, --isomorphic  Use isomorphic code layout
                      (includes prerendering)
    -l, --locales     Locales for isomorphic mode; one of:
            [comma-separated-values] Locale list
            [JSON-filepath] - Read locales from JSON file
            "none" - Disable locale-specific handling
            "used" - Detect locales used within ./resources/
            "tv" - Locales supported on webOS TV
            "signage" - Locales supported on webOS signage
            "all" - All locales that iLib supports
    -s, --snapshot    Generate V8 snapshot blob
                      (requires V8_MKSNAPSHOT set)
    -m, --meta        JSON to override package.json enact metadata
    -c, --custom-skin Build with a custom skin
    --no-animation    Build without effects such as animation and shadow
    --stats           Output bundle analysis file
    --verbose         Verbose log build details
    -v, --version     Display version information
    -h, --help        Display help information

```
Run within an Enact project's source code, the `enact pack` command (aliased as `npm run pack` or `npm run pack-p` for production) will process and bundle the js, css, and asset files into the `./dist` directory. An **index.html** file will be dynamically generated.

## Production Mode
By default, projects will build in development mode. When your code is ready for deployment you can build in production mode. Production mode will minify the source code and remove dead code, along with numerous other minor code optimization strategies.

## Browser Support & Polyfills
The Enact CLI is designed to be compatible with a wide array of browsers and devices. [Browserslist standard](https://github.com/browserslist/browserslist) is used to handle targeting, with Enact's defaults being:

* \>1%
* last 2 versions
* last 5 Chrome versions
* last 5 Firefox versions
* Firefox ESR
* not ie < 12
* not ie_mob < 12
* not dead

For all projects built with Enact CLI, `core-js` polyfill is automatically included, so that all stable ECMAScript features are polyfilled across all target browsers. This means that only what's needed will be transpiled or polyfilled from `core-js`. The Browserslist settings can be narrowed or widened at will via [`package.json` settings or `BROWSERSLIST` environment variable](https://github.com/browserslist/browserslist#queries). This means the newer the targeted browsers, the fewer the polyfills and less required transpiling.

However keep in mind that `core-js` is solely for ECMAScript and does not polyfill any browser features. Features like this will need to be manually polyfilled in projects with app-level imports.  For example, to add web animation API, you could add the NPM dependency [`web-animations-js`](https://github.com/web-animations/web-animations-js) and import it at the top of your app's root **`index.js`** source file.

Note: Some ui libraries, like Limestone, may have their own recommended supported browsers and may differ from the core Enact framework.

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

Optionally, [ESLint](https://eslint.org) can be installed globally or locally and configured within a project to enable linting support within the `enact lint` command.

## Sass Support

CSS stylesheets could get larger and more complex as you develop. To help and enrich the styling of your apps, there are great CSS preprocessors
out there.  Enact CLI provides [LESS](https://lesscss.org) as the default and [Sass](https://sass-lang.com) support is an optional feature since Enact CLI 5.0.0.

To use Sass, install Sass globally:

```bash
npm install -g sass
```

Now you can rename `src/App.css` to `src/App.scss` or `src/App.sass` and for using CSS modules, `src/App.module.scss` or `src/App.module.sass`. And update `src/App.js` to import `src/App.scss`. Enact CLI will compile these files properly through webpack for you.

More information can be found [here](https://sass-lang.com/guide) to learn about Sass.

## Tailwind CSS Support

Tailwind CSS works by scanning all of your HTML files, JavaScript components, and any other templates for class names, generating the corresponding styles and then writing them to a static CSS file.
Enact CLI supports to use Tailwind CSS as an optional feature since Enact CLI 5.0.0.

To use Tailwindcss, install Tailwindcss globally:

```bash
npm install -g tailwindcss
```

And then run the init command to generate tailwind.config.js in your app:

```bash
npx tailwindcss init
```

Add the paths to all of your template files in your tailwind.config.js file.

```js
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

Create `src/tailwind.css` file and add the @tailwind directives for each of Tailwind’s layers to your file.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Import `src/tailwind.css` into your `src/index.js` file.

```js
import {createRoot} from 'react-dom/client';
import App from './App';
import './tailwind.css';

const appElement = (<App />);
...
```

Now you can start using Tailwind’s utility classes to style your content.
Here is the example.

```js
const MainPanel = kind({
    name: 'MainPanel',

    render: (props) => (
        <Panel {...props}>
            <p className="text-3xl font-bold underline">
                Edit src/views/MainPanel.js and save to reload.
            </p>
        </Panel>
    )
});
```

More information can be found [here](https://tailwindcss.com/docs) to learn about tailwindcss.

### Troubleshooting
If you receive an error when building the app that says `Cannot find module: 'typescript/sass/tailwindcss'` after installing the modules above(e.g. `typescript`, `sass`, or `tailwindcss`) globally,
try to set `NODE_PATH` to point global node_modules directory like below.

```bash
export NODE_PATH=/path/to/your/global/node_modules
```

## Custom Skin Support

Limestone supports custom skin features to let you easily override the colors of components. All you need to do is build your app with `--custom-skin` option and add a CSS file named `custom_skin.css` which includes a preset of colors, under the `customizations` folder in the build result like below.

```none
my-app/
  README.md
  .gitignore
  package.json
  dist/
    customizations/
      custom_skin.css
    main.css
    main.js
    ...
  node_modules/
  src/
  resources/
  webos-meta/
```

## Build without Effects

To accommodate devices with lower performance, the Enact CLI offers the `--no-animation` option. This option disables animations and graphical effects, including shadows. When activated, it sets the `ENACT_PACK_NO_ANIMATION` environment variable. This variable allows UI libraries like Limestone to conditionally disable effects. Additionally, you can leverage this variable in your application to achieve the same outcome. Thus, you can develop an app devoid of these effects and do so without modifying your codebase.

## Caching

For supporting better [`caching`](https://webpack.js.org/guides/caching/), Enact CLI provides `--content-hash` option to add a unique hash to each output file name based on the content of an asset.

Building With this option should produce the following output:

```none
        1.11 MB         dist/main.1983e557b9a705c83e72.js
        199.85 kB       dist/main.2088c66150ab73b27793.css
```

When the content changes, the output file name will change as well.
```none
        1.11 MB         dist/main.7544f55b64439c8d0f0e.js
        199.85 kB       dist/main.2088c66150ab73b27793.css
```

> **NOTE** The filename `main.*.js` will be changed after another building, even without making any changes. This is because webpack includes certain boilerplate, specifically the runtime and manifest, in the entry chunk.

## Isomorphic Support & Prerendering
By using the isomorphic code layout option, your project bundle will be outputted in a versatile universal code format allowing potential usage outside the browser. The Enact CLI takes advantage of this mode by additionally generating an HTML output of your project and embedding it directly with the resulting **index.html**. By default, isomorphic mode will attempt to prerender only `en-US`, however with the `--locales` option, a wide variety of locales can be specified and prerendered. More details on isomorphic support and its limitations can be found [here](./isomorphic-support.md).

## V8 Snapshot Generation
The v8 snapshot blob creation feature is highly experimental and temperamental depending on your code. It is considered an extension of the isomorphic code layout, bringing along all the same requirements. Given the highly-specific nature of a v8 snapshot blob being tied to particular versions of Chrome/Chromium/Electron/etc., developers must provide their own copy of the `mksnapshot` binary and have its filepath set to the `V8_MKSNAPSHOT` environment variable.

## Watcher Option
Similar to the [`enact serve`](./serving-apps.md) command, the watcher will build the project and wait for any detected source code changes. When a change is detected, it will rebuild the project. The rebuild time will be significantly faster since the process can actively cache and build only what has changed.

## Stats Analysis
The Bundle analysis file option uses the popular [webpack-bundle-analyzer](https://github.com/webpack-contrib/webpack-bundle-analyzer) to create a visual representation of the project build to **stats.html**, showing the full module hierarchy arranged by output size. This can be very useful in determining where bloat is coming from or finding dependencies that may have been included by mistake.

## Override Metadata
The @enact/cli tool inspects the `enact` object in the project's package.json for [customization options](./starting-a-new-app.md#enact-project-settings). 
You can use the `--meta` flag to input a JSON string that overrides the `enact` metadata in package.json.

Here's an example of how to use the `--meta` flag:

```bash
enact pack --meta='{"title":"myapp"}'
```

This command has the same effect as adding the following to your package.json:

```json
{
	...
	"enact": {
		"title": "myapp"
	}
	...
}
```