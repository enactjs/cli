---
title: Prerendering Support
---
Prerendering, with regards to Enact apps, means that we render out the initial view during build.  The app's initial
state is rendered via React into an HTML string and placed into the **index.html** file.

Having the initial view as HTML allows the app to be visible as soon as the HTML is loaded. We don't have to wait
for the JavaScript to be fetched, parsed, and executed to see the general app layout.  Furthermore, once the JavaScript
does load, the underlying React core will recognize the HTML and just add event listeners; no extra rendering needs to be
done. The end result is the appearance of significantly faster app load time.

For your app to support prerendering, it should export a `ReactElement` object.  This can easily be accomplished by creating
an isomorphic build.

## How to Create an Isomorphic Build
Within your **package.json** file, add an 'isomorphic' property to the **enact** object:
```
{
    ...
    'enact': {
        ...
        'isomorphic':'./path/to/App'
    }
    ...
} 
```
Where **./path/to/App** is the relative path to the main app's module. It must be a module that exports a `ReactElement`
object. This can be an existing file or a new file created specifically for the purposes of prerendering.

Then, you can choose to isomorphically build by adding the `--isomorphic` flag to the pack command:
```
npm pack -- --isomorphic
npm pack-p -- --isomorphic
```

### When to Build Isomorphically
By default, `enact-dev` will not prerender your app and it should not be considered part of the regular development workflow.
It is advisable to only build in isomorphic format when you specifically want to test and ensure prerendering works. The
main purpose for isomorphic building is to optimize runtime when compiling in the webOS build environment.

### How to Debug When Prerendering Fails
If prerendering fails, there will be a stack trace printed to the console and the build will continue without prerendering.
It's useful to build in development mode so that you can use the stack trace to determine where in the code the issue lies
without any minification getting in the way.

Generally, when a prerender fails, it's due to `window` or `document` being used during initial state creation (prior to
mounting). Leave all access of those globals until after mount or wrap in an `if` statement to check global variable existence.

**Important Note**:
```
Prerendering requires an app to be coded such that it does not require access to the `window` or `document` to create its
initial state. The act of prerendering take place in a Node-based environment, so no `window` nor `document` are available.
If your app uses `document` or `window` in creation of its initial state, be sure to wrap those in `if` statements to avoid
prerender failure. For example:
 
    if(typeof window === 'object') {
        // able to access window
    } 
```

## How It Works
When a build starts with isomorphic enabled, the app is built in a special pseudo-library layout, in a universal
module definition ([UMD](https://github.com/umdjs/umd)) format. In a Node environment, the top-level export is the `ReactElement` export of the 'isomorphic'
file. In a browser environment, a global variable, `App`, gets created and contains the exported `ReactElement` from the
'isomorphic' file. Additionally, `ReactDOM` is stored (though not used) within the build and is exposed for use on
`window.ReactDOM`.

During the build process, a custom webpack plugin, `PrerenderPlugin`, will access the build within its Node environment and
use React's own [`ReactDOMServer`](https://facebook.github.io/react/docs/top-level-api.html#reactdomserver.rendertostring) to render the initial state of the app into an HTML string and injects that into the
**index.html** file.  This is the same API used in server-side rendering.

When the webpage loads up, the built JavaScript is loaded, and then `window.ReactDOM` renders the `App` object.
