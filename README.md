# enact-dev
A standalone dev environment for Enact apps using Webpack, Babel, React, and a collection of other tools.

## Installation
All that's needed to install enact-dev is to use npm to install it globally. For Linux `sudo` may be required.
```
npm install -g enyojs/enact-dev
```

>Note: Node 6.x+ is highly recommended for optimum speed and efficiency, however anything since Node 4.x is compatible.

## Creating a new App
The only time you're ever want to directly use the Enact CLI is when you want to create a new project.

```sh
enact init [directory]
```

This will generate a basic App template, complete with npm scripts and dependencies setup. If no directory path is specified, it will be generated within the working directory.

>Advanced: If you've used `npm link` on separate installations of the Enact repo, you can include `--link` to the `init` command and NPM will symlink your Enact repo, rather than reinstall.

## Available App Scripts

Within the project directory, you can run:

### `npm run serve`

Builds and serves the app in the development mode.<br>
Open [http://localhost:8080](http://localhost:8080) to view it in the browser.

The page will reload if you make edits.<br>

### `npm run pack` and `npm run pack-p`

Builds the project in the working directory. Specifically, `pack` builds in development mode with code un-minified and with debug code include, whereas `pack-p` builds in production mode, with everything minified and optimized for performance.

### `npm run watch`

Builds the project in development mode and keeps watch over the project directory. Whenever files are changed, added, or deleted, the project will automatically get rebuilt using an active shared cache to speed up the process. This is similar to the `serve` task, but without the http server.

### `npm run clean`

Deletes previous build fragments from ./dist.

### `npm run lint`

Runs the Enact configuration of Eslint on the project for syntax analysis.

### `npm run test`, `npm run test-json`, and `npm run test-watch`

These tasks will execute all valid tests (files that end in `-specs.js`) that are within the project directory. The `test` is a standard execution pass, `test-json` uses a json reporter for output, and `test-watch` will set up a watcher to re-execute tests when files change.


## Displaying Lint Output in the Editor

Some editors, including Sublime Text, Atom, and Visual Studio Code, provide plugins for ESLint.

They are not required for linting. You should see the linter output right in your terminal. However, if you prefer the lint results to appear right in your editor, there are some extra steps you can do.

You would need to install an ESLint plugin for your editor first.

>**A note for Atom `linter-eslint` users**

>If you are using the Atom `linter-eslint` plugin, make sure that **Use global ESLint installation** option is checked:

><img src="http://i.imgur.com/yVNNHJM.png" width="300">

Then, you will need to install some packages *globally*:

```sh
npm install -g enyojs/eslint-config-enact eslint-plugin-react eslint-plugin-babel babel-eslint

```

We recognize that this is suboptimal, but it is currently required due to the way we hide the ESLint dependency. The ESLint team is already [working on a solution to this](https://github.com/eslint/eslint/issues/3458) so this may become unnecessary in a couple of months.
