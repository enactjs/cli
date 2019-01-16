---
title: Loading an Existing App
order: 3
---
## Acquire the Source

Download the app's source code, usually, from a git repository. Make sure you have correct SSH access rights for the repo.  For example:

```
git clone git@github.com:user/myapp.git
```

## Install the Dependencies

Enact apps are just like any other npm package. Navigate to the app's root directory (the base directory with the **package.json**). From there, you can install the dependencies the standard way:

```
npm install
```

## Available npm Tasks
npm tasks vary by package and are defined within a `scripts` object in the **package.json** file. If the app was created via the Enact CLI, then it will support the following npm task aliases:

* `npm run serve` - Packages and hosts the app on a local http server using [webpack-dev-server](https://github.com/webpack/webpack-dev-server). Supports hot module replacement and inline updates as the source code changes.
* `npm run pack` - Packages the app into **./dist** in development mode (unminified code, with any applicable development code).
* `npm run pack-p` - Packages the app into **./dist** in production mode (minified code, with development code dropped).
* `npm run watch` - Packages in development mode and sets up a watcher that will rebuild the app whenever the source code changes.
* `npm run test` - Builds and executes any test spec files within the project.
* `npm run lint `- Lints the project's JavaScript files according to the Enact ESLint configuration settings and optionally TSLint.
* `npm run clean` - Deletes the **./dist** directory
* `npm run license` - Outputs a list of licenses used by modules required by the project
