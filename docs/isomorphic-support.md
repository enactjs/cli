---
title: Isomorphic Support
order: 5
---
Isomorphic code layout is a special feature which builds projects in a JavaScript layout that can be potentially processed by any environment, such as [NodeJS](https://nodejs.org) or the browser. One main benefit is that this code can be evaluated at build-time and prerendered into the HTML document ahead of time. When the isomorphic option is used, prerendering will be attempted.

## What is "Prerendering"?
Prerendering, with regards to Enact apps, means that we render out the initial state at build time.  The app's initial state is rendered via React into an HTML string and embedded statically into the **index.html** file.

## Why Prerender?
Having the initial app state as HTML allows the app to be visible as soon as the HTML is rendered. We don't have to wait for the JavaScript to be fetched, parsed, and executed to see the general app layout.  Furthermore, once the JavaScript does load, the underlying React core will recognize the HTML and just add event listeners; no extra rendering needs to be done. The end result is the appearance of significantly faster app load time.

## How to Create an Isomorphic Build
Within your **package.json** file, add an `isomorphic` property to the `enact` object:
```
{
    ...
    "enact": {
        ...
        "isomorphic":true
    }
    ...
} 
```
If the value is a string filepath instead, it will use that file as the main app entry point instead of the default. Whatever the entry point, ensure it exports the `ReactElement` in non-browser environments. Additionally, ensure the entry point also conditionally renders to to the DOM if the `window` is available.  An example **index.js** entry point can be see [here](https://github.com/enactjs/templates/blob/master/packages/moonstone/template/src/index.js) and is the default included in the Enact app template.

Then, you can choose to build with isomorphic code layout by adding the `--isomorphic` flag to the pack command:
```
enact pack --isomorphic
npm pack -- --isomorphic
npm pack-p -- --isomorphic
```

### When to Build Isomorphically
By default, the Enact CLI will not use isomorphic code layout, and it should not be considered part of the regular development workflow. It is advisable to only build in isomorphic format when you want to test isomorphic features or in production mode builds.

### How to Debug When Prerendering Fails
If prerendering fails, there will be a stack trace printed to the console and the build will continue without prerendering.  It's useful to build in development mode so that you can use the stack trace to determine where in the code the issue lies without any minification getting in the way.

Generally, when a prerender fails, it's due to `window` or `document` being used during initial state creation (prior to mounting). Leave all access of those globals until after mount or wrap in an if-statement to check global variable existence.

> **Important Note**:
> Prerendering requires an app to be coded such that it does not require access to `window` or `document` to create its initial state. The act of prerendering take place in a Node-based environment, so neither `window` nor `document` are available. 
> If your app must use `document` or `window` in creation of its initial state, be sure to wrap those in if-statements to avoid prerender failure. For example:
> ``` 
>    if(typeof window !== 'undefined') {
>        // able to access window
>    } 
>```

## Prerendering in Specific Locales
While the app content built with Enact is designed to run for all locales, the prerendered **index.html** content is based on the `en-US` locale. While the page should load correctly on other locales, the `en-US`-based content will be visible to the user until the app is fully loaded/executed. Enact CLI provides command line options to alter and customize the locales that should be prerendered.  The `-l`/`--locales` option accepts a comma-separated list of locales, path to a file containing a JSON array of desired locales, or a preset name (e.g. `tv`, `signage`, `none`, etc.). For example:
```
enact pack -i --locales=en-US,ko-KR
enact pack -i --locales=my-locales.json
enact pack -i --locales=tv
```
When multiple locales are specified for prerendering, each locale is evaluated into its own HTML file (**index.en-US.html**, **index.ko-KR.html**, etc.) with a non-prerendered **index.html** file as a fallback. Deduping is applied to simplify and minify the number of HTML files output, simplifying by root language and across languages themselves. Additionally, with full webOS support, locale-specific **appinfo.json** files will be generated to correctly target locale-specific app entry points.

## How It Works
With an isomorphic build, the app is built in a special pseudo-library layout, in a universal module definition ([UMD](https://github.com/umdjs/umd)) format. In a Node environment, the top-level export is the `ReactElement` export of the 'isomorphic' file. In a browser environment, the app executes normally.

During the build process, a custom webpack plugin, `PrerenderPlugin`, will access the build within its Node environment and use React's [`ReactDOMServer`](https://facebook.github.io/react/docs/top-level-api.html#reactdomserver.rendertostring) to render the initial state of the app into an HTML string and inject that into the **index.html** file, within the `root` ID `div` element.  This is the same API used in server-side rendering.

When the webpage loads up in a browser environment, the built JavaScript is loaded normally (and is expected to render itself into the HTML), except React will detect the DOM tree and will simply attach event listeners and go through the React lifecycle methods.
