---
title: Adding a Sass Stylesheet
order: 6
---

> Note: this feature is available with `enactjs/cli@5.0.0` and higher.

Generally, we recommend that you don’t reuse the same CSS classes across different components. For example, instead of using a `.Button` CSS class in `<AcceptButton>` and `<RejectButton>` components, we recommend creating a `<Button>` component with its own `.Button` styles, that both `<AcceptButton>` and `<RejectButton>` can render (but [not inherit](https://facebook.github.io/react/docs/composition-vs-inheritance.html)).

Following this rule often makes CSS preprocessors less useful, as features like mixins and nesting are replaced by component composition. You can, however, integrate a CSS preprocessor if you find it valuable.

Thanks to enactjs/cli, you can use Sass without installing `sass`.
Now you can rename `src/App/App.module.less` to `src/App/App.module.scss` and update `src/App/App.js` to import `./App.module.scss`.
This file and any other file will be automatically compiled if imported with the extension `.scss` or `.sass`.

To share variables between Sass files, you can use Sass's [`@use` rule](https://sass-lang.com/documentation/at-rules/use).
