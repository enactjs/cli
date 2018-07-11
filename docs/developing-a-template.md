---
title: Developing a Template
order: 10
---
## Static Templates

The simplest form of template supported by the Enact CLI is a flat static directory of files to be copied. Static templates should include a root-level **package.json**, which will get `npm install` executed upon creation via `enact create`.

## Dynamic Template Generators

An enhanced form of template generators are also supported. In this form, the static template files are within a **./template** subdirectory and a root-level **index.js** is available. The **index.js** can export hooks which `enact create` can tie into.

Available optional properties that can be exported:

* `overwrite` _[boolean]_ Whether or not to overwrite existing files when copying the files from **./template**.
* `install` _[boolean]_ Whether or not to run `npm install` during `enact create`.
* `validate` _[function]_ Code run when validating the `enact create` target directory/name. Should throw or return a rejected _Promise_ when an invalid name is used.
* `prepare` _[function]_ Code run just before copying the static files within **./template** to the target directory.
* `setup` _[function]_ Code run just after copying the static files, but before running `npm install`. 
* `complete` _[function]_ Code run just after everything is finished. Useful to output instructions or a message to the user.

When omitted/`undefined`, the function/promise properties will fallback to the [default application template handler property values](https://github.com/enactjs/cli/blob/master/commands/create.js#L38). If explicitly set as `false`, those events will be disabled during `enact create`.  When defining a function property, it must be synchronous or otherwise return a _Promise_ for asynchronous evaluation.

Note: template generators can even have their own root **package.json** with dependencies that will be installed locally when the template is installed.

A selection of dynamic templates made by the Enact team can be found at https://github.com/enactjs/templates covering a wide variety of use-cases, such as Cordova and Electron.

## Distributing
For static templates, git repositories are a simple and straightforward method of sharing. Dynamic template generators have the added advantage of distribution on npm if desired.

Created a template of your own? [We'd love to hear about it!](https://gitter.im/EnactJS/Lobby)
