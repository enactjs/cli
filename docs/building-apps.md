---
title: Building Apps
---
## Packaging Source Code
```
  Usage
    enact pack [options]

  Options
    -p, --production  Build in production mode
    -i, --isomorphic  Use isomorphic code layout
                      (includes prerendering)
    -w, --watch       Rebuild on file changes
    --stats           Output bundle analysis file

```
Run within an Enact project's source code, the `enact pack` command (aliased as `npm run pack` or `npm run pack-p` for production) will process and bundle the js, css, and asset files into the `./dist` directory. An **index.html** file will be dynamically generated.

## Production Mode
By default, projects will build in development mode. When you're code is ready for deployment you can build in production mode. Production mode will minify the source code and remove dead code, along with numerous other minor code optimization strategies.

## \_\_DEV\_\_ Keyword
In order to make development and debugging simpler, the enact cli supports a special `__DEV__` keyboard in both javascript and CSS.

In javascript, for example:

```js
	if (__DEV__) {
		console.log('This is a development build');
	}
```
In development mode, the code will execute correctly, whereas in production mode it will get caught and removed as unused dead code. This allows for custom development-only debug code.

Similarly, in css/less:

```css
	div .__DEV__ {
		background: blue;
	}
}
```
In development mode, the css/less remains intact and usable, but in production mode, the `.__DEV__` css class stylings are removed. This allows for custom development-only styling.

## Isomorphic Support & Prerendering
By using the isomorphic code layout option, your project bundle will be outputted in a versatile universal code format allowing potential usage outside the browser. The enact cli takes advantage of this mode by additionally generating an HTML output of your project and embedding it directly with the resulting **index.html**

## Watcher Option
Similar to the [`enact serve`](./serving-apps.md) command, the watcher will build the project and wait for any detected source code changes. When a change is detected, it will rebuild the project. The rebuild time will be significantly faster since the process can actively cache and build only what has changed.

## Stats Analysis
The Bundle analysis file option uses the popular [webpack-bundle-analyzer](https://github.com/webpack-contrib/webpack-bundle-analyzer) to create a visual representation of the project build to **stats.html**, showing the full module hierarchy arranged by output size. This can be very useful in determining where bloat is coming from or finding dependencies that may have been included by mistake.

