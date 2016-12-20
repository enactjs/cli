---
title: Starting a New App
---
## Generating the Base App Template
With the enact-dev tool installed, you can quickly create a new project with the following command:

```
enact init [directory]
```
Where `[directory]` is the directory for the new project (or the working directory if omitted). This will generate a basic Moonstone template, complete with Enact, its libraries, React, and a fully configured **package.json**.

## Enact Build Settings
The enact-dev tool will check the project's **package.json** looking for an optional `enact` object for a few customization options:

* `template` _[string]_ - Filepath to an alternate HTML template to use with the [Webpack html-webpack-plugin](https://github.com/ampedandwired/html-webpack-plugin).
* `isomorphic` _[boolean|string]_ - If `true`, it indicates the default entrypoint is isomorphic-compatible (and can be built via the `--isomorphic` enact-dev flag). If the value is a string, then it will use that value as a filepath to a custom isomorphic-compatible entrypoint.
* `title` _[string]_ - Title text that should be put within the HTML's `<title></title>` tags. Note: if this is a webOS-project, the title, by default, will be auto-detected from the **appinfo.json** content.
* `ri` _[object]_ - Resolution independence options to be forwarded to the [LESS plugin](https://github.com/enyojs/less-plugin-resolution-independence).
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
The `ri` value here (`baseSize=24`) is designed for 1080p TVs and similar resolutions.

## Available NPM Tasks
Included within the app template are a number of NPM tasks available to build/run the app:

* `npm run serve` - Packages and hosts the app on a local http server using [webpack-dev-server](https://webpack.github.io/docs/webpack-dev-server.html). Supports hot module replacement and inline updates as the source code changes.
* `npm run pack` - Packages the app into **./dist** in development mode (unminified code, with any applicable development code).
* `npm run pack-p` - Packages the app into **./dist** in production mode (minified code, with development code dropped).
* `npm run watch` - Packages in development mode and sets up a watcher that will rebuild the app whenever the source code changes.
* `npm run test` - Builds and executes any test spec files within the project.
* `npm run lint `- Lints the project's JavaScript files according to the Enact ESLint configuration settings.
* `npm run clean` - Deletes the **./dist** directory

That's it! Now you have a fully functioning app environment.
