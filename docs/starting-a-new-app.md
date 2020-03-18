---
title: Starting a New App
order: 2
---
## Generating the Base App Template
```none
  Usage
    enact create [options] [<directory>]

  Arguments
    directory         Optional project destination directory
                          (default: current working directory)

  Options
    -t, --template    Specific template to use
    -local            Include @enact/cli locally in the project
    -verbose          Verbose output logging
```
This will generate a basic app based on the Moonstone project template, complete with Enact libraries, React, and a fully configured **package.json**.

## Enact Project Settings
The @enact/cli tool will check the project's **package.json** looking for an optional `enact` object for a few customization options:

* `template` _[string]_ - Filepath to an alternate HTML template to use with the [Webpack html-webpack-plugin](https://github.com/ampedandwired/html-webpack-plugin).
* `isomorphic` _[string]_ - Alternate filepath to a custom isomorphic-compatible entry point. Not needed if main entry point is already isomorphic-compatible.
* `title` _[string]_ - Title text that should be put within the HTML's `<title></title>` tags. Note: if this is a webOS-project, the title will, by default, be auto-detected from the **appinfo.json** content.
* `theme` _[object]_ - A simplified string name to extrapolate `fontGenerator`, `ri`, and `screenTypes` preset values from. For example, `"moonstone"`
* `fontGenerator` _[string]_ - Filepath to a CommonJS fontGenerator module which will build locale-specific font CSS to inject into the HTML. By default, will use any preset for a specified theme or fallback to moonstone.
* `ri` _[object]_ - Resolution independence options to be forwarded to the [LESS plugin](https://github.com/enyojs/less-plugin-resolution-independence). By default, will use any preset for a specified theme or fallback to moonstone
* `screenTypes` _[array|string]_ - Array of 1 or more screentype definitions to be used with prerender HTML initialization. Can alternatively reference a json filepath to read for screentype definitions.  By default, will use any preset for a specified theme or fallback to moonstone.
* `nodeBuiltins` _[object]_ - Configuration settings for polyfilling NodeJS built-ins. See `node` [webpack option](https://webpack.js.org/configuration/node/).
* `externalStartup` _[boolean]_ - Flag whether to externalize the startup/update js that is normally inlined within prerendered app HTML output.
* `forceCSSModules` _[boolean]_ - Flag whether to force all LESS/CSS to be processed in a modular context (not just the `*.module.css` and `*.module.less` files).
* `deep` _[string|array]_ - 1 or more JavaScript conditions that, when met, indicate deeplinking and any prerender should be discarded.
* `target` _[string|array]_ - A build-type generic preset string (see `target` [webpack option](https://webpack.js.org/configuration/target/)) or alternatively a specific [browserslist array](https://github.com/ai/browserslist) of desired targets.
* `proxy` _[string]_ - Proxy target during project `serve` to be used within the [http-proxy-middleware](https://github.com/chimurai/http-proxy-middleware).

For example:
```js
{
	...
	"enact": {
		"theme": "moonstone",
		"nodeBuiltins": {
			fs: 'empty',
			net: 'empty',
			tls: 'empty'
		}
	}
	...
}
```

## Available npm Tasks
Included within the project template are a number of npm tasks available, with each mapped to Enact CLI commands:

* `npm run serve` - Packages and hosts the app on a local http server using [webpack-dev-server](https://github.com/webpack/webpack-dev-server). Supports hot module replacement and inline updates as the source code changes.
* `npm run pack` - Packages the app into **./dist** in development mode (unminified code, with any applicable development code).
* `npm run pack-p` - Packages the app into **./dist** in production mode (minified code, with development code dropped).
* `npm run watch` - Packages in development mode and sets up a watcher that will rebuild the app whenever the source code changes.
* `npm run test` - Builds and executes any test spec files within the project.
* `npm run lint `- Lints the project's JavaScript files according to the Enact ESLint configuration settings and optionally TSLint.
* `npm run clean` - Deletes the **./dist** directory

That's it! Now you have a fully functioning app environment.
