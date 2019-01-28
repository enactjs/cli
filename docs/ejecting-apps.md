---
title: Ejecting Apps
order: 8
---
## Converting to a Standalone App Package

```
  Usage
    enact eject [options]

  Options
    -b, --bare        Abandon Enact CLI command enhancements
                      and eject into a a barebones setup (using
                      webpack, eslint, jest, etc. directly)
    -v, --version     Display version information
    -h, --help        Display help information
```
The `enact eject` command will permanently eject an app from within the Enact CLI environment into a free-standing package with all development tools embedded. Ejection will expose all development tool config files and move all required npm dependencies into the app's local **package.json** file. It is intended to be a permanent conversion, exiting from the Enact CLI usage in favor of local alternatives. All npm run-scripts that use the Enact CLI tool will be updated accordingly.

## Should I Eject My App?

A question that may come up during the course of development is whether to eject an app for customization purposes. The default configuration of the Enact CLI tool is designed to meet the majority of use cases and keep the development environment abstracted. In rare circumstances where a webpack or Babel config customization is absolutely required, it may be necessary to eject. It is very important to leave ejection as a last resort since it will greatly increase the complexity of the app's dependencies and will remove the ability to take advantage of Enact CLI updates and improvements; the entirety of the app development cycle will now be up to you to maintain.

## Post-Eject Development Environment

Once an app is ejected, its structure will be changed fairly noticeable. All the polyfills and development tools (babel, webpack, less, jest, eslint, etc.) will be added to the **package.json** and the run-scripts will be updated to use them.  Afterwards, your project should look like this:
```
my-app/
  README.md
  .gitignore
  package.json
  node_modules/
  config/
    polyfills.js
    babel-proxy.js
    .babelrc.js
    dotenv.js
    html-template.ejs
    webpack.config.js
    jest/
      babelTransform.js
      fileTransform.js
      jest.config.js
      setupTests.js
  scripts/
    serve.js
    pack.js
    test.js
    lint.js
    license.js
    clean.js
  src/
  resources/
  webos-meta/
```

The **config** directory will contain all the main development configuration files: babel, webpack, and jest, along with polyfill setup files. Additionally, a **scripts** directory will be generated, containing shorthand wrapper scripts that replicate the Enact CLI output styling/usage. These scripts will keep a consistent developer experience between ejected and non-ejected apps. However, if `-b`/`--bare` flag is used during ejection, no scripts will be generated and the npm run-scripts will harness the raw tools (webpack/jest/eslint/etc) directly.
