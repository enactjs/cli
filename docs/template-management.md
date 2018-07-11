---
title: Template Management
order: 9
---
## Enact CLI Template Support 
```
  Usage
    enact pack [options]

    enact template <action> ...');

  Actions
    enact template install [source] [name]
    Install a template from a local or remote source

        source            Git URI, npm package or local directory
                          (default: cwd)
        name              Specific name for the template

    enact template link [directory] [name]
    Symlink a directory into template management'

        directory         Local directory path to link
                          (default: cwd)
        name              Specific name for the template

    enact template remove <name>
    Remove a template by name

        name              Name of template to remove

    enact template default [name]
    Choose a default template for "enact create"

        name              Specific template to set default

    enact template list
    List all templates installed/linked
```
Included within the Enact CLI is a default Enact moonstone template, however the tools are provide to install and manipulate templates avauilable for usage.

## `install` vs `link`
Due to the similar nature in these actions, it's worth some clarification. The `install` action pulls from a local or remote source, copying the template files to a user-storage location (`%APPDATA%\.enact` on Windows, `$HOME/.enact` on all other systems).  The `link` action, on the other hand, will create a symlink from a local source directory into the user-storage location.  No files are physically copied, only linked. As such, the local linked source directory should not be deleted and any changes made within will reflected when using the Enact CLI. It is generally only advisable to use the `link` action when actively developing templates.

## Developing Templates
If you're intested in creating your own template for use with the Enact CLI, information can be found [here](./developing-a-template.md).
