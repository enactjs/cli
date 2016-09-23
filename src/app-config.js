var
	path = require('path'),
	fs = require('fs'),
	HtmlWebpackPlugin = require('html-webpack-plugin'),
	PrerenderPlugin = require('./PrerenderPlugin'),
	config = require('./common-config'),
	mixin = require('./mixin');

function readScreenTypes(f) {
	try {
		return JSON.parse(fs.readFileSync('./node_modules/' + f, {encoding:'utf8'}));
	} catch(e) {
		return undefined;
	}
}

module.exports = function(opts) {
	var common = config.common({ri: opts.ri});
	var shouldPrerender = (opts.prerender && (!config.isDev || opts.alwaysPrerender));
	var plugins = [
		new HtmlWebpackPlugin({
			title: opts.title || '',
			inject: (shouldPrerender && !opts.htmlTemplate) ? false : 'body',
			template: opts.htmlTemplate || path.join(__dirname, (shouldPrerender ? 'html-prerender-template.ejs' : 'html-standard-template.ejs')),
			xhtml: true,
			minify: config.isDev ? undefined : {
				removeComments: true,
				collapseWhitespace:false,
				removeRedundantAttributes: true,
				useShortDoctype: true,
				removeEmptyAttributes: true,
				removeStyleLinkTypeAttributes: true,
				keepClosingSlash: true,
				minifyJS: true,
				minifyCSS: true,
				minifyURLs: true
			},
			screenTypes: opts.screenTypes
					|| readScreenTypes('enact-moonstone/MoonstoneDecorator/screenTypes.json')
					|| readScreenTypes('enact/packages/moonstone/MoonstoneDecorator/screenTypes.json')
		})
	]; 
	if(shouldPrerender) {
		plugins.push(new PrerenderPlugin());
	}

	return mixin(common, {
		plugins: plugins
	});
};
