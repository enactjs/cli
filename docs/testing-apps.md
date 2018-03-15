---
title: Testing Apps
---
## Running Test Specs
```
  Usage
    enact test <command>

  Commands:
    start [<configFile>] [<options>] Start the server / do single run.
    run [<options>] [ -- <clientArgs>] Trigger a test run.
```
The `enact test` command (aliased as `npm run test` for `enact test start --single-run`) will activate a [Karma](http://karma-runner.github.io/1.0/index.html) test runner on all discovered *-specs.js files. All the complicated configuration is hidden away within enact cli to avoid any confusion or additional difficulty in testing source code.

Internally enact cli supports [Mocha](https://mochajs.org), [Sinon](http://sinonjs.org), [Chai](http://chaijs.com), [Enzyme](http://airbnb.io/enzyme/), and [PhantomJS](http://phantomjs.org) to provide a framework of testing capabilities for your specs files. You will need to familiarize your self with those tools in order to write tests.

To create a test please create a `*-specs.js` file in the folder of the component you wish to test.

Run --help with particular test command to see its description and available options.
