---
title: Installation
order: 1
---
## Requirements

Node 6.4 or later.

## Installation via npm

Standard global installation of `@enact/cli` via npm.
```sh
npm install -g @enact/cli
```

All releases are published, with the default (and `latest` tag) being the current stable release. Unreleased and development builds can be installed by installing from the git repository directly (for example, `enactjs/cli#develop`).

### Linux Notes

When installing under Linux, it may be necessary to prefix the install command with `sudo`.
Additionally, if you receive an error when the install process attempts to install PhantomJS, try
the following:

```sh
sudo npm install -g --unsafe-perm @enact/cli
```
