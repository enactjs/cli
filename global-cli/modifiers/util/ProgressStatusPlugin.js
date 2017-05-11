var
	readline = require('readline'),
	chalk = require('chalk'),
	webpack = require('webpack');

// TODO: validate if Windows even needs the extra character
function maxWidth() {
	/* compute the available space (non-zero) for the bar */
	var col = process.stdout.columns;
	if(col && process.platform === 'win32'){
		col = col - 1;
	}
	return col;
}

function progressBar(percentage, width, padding, colours) {
	var barWidth = width - (padding*2) - 6;
	var bar = Math.round(percentage*barWidth);
	var back = barWidth - Math.round(percentage*barWidth);
	return ' '.repeat(padding) + '\u2595' + colourize('\u2588'.repeat(bar), colours.bar)
			+ colourize(' '.repeat(back), colours.bg, true) + '\u258F '
			+ Math.round(percentage*100) + '%';
}

function colourize(text, colour, bg) {
	if(colour!=='none') {
		if(bg) {
			colour = 'bg' + capitalize(colour);
		}
		text = chalk[colour](text);
	}
	return text;
}

function formatMessage(message, width, padding, details) {
	var end = width-padding;
	var out = ' '.repeat(padding) + capitalize(message);

	if(details) {
		out += ': ' + details;
	}

	if(out.length>end) {
		out = out.substring(0, end);
	}
	out += ' '.repeat(end-out.length);
	return out;
}

function capitalize(text) {
	return text.charAt(0).toUpperCase() + text.substring(1);
}

function ProgressStatusPlugin(options) {
	this.options = options || {};
	this.options.throttle = 60;
	this.options.bar = this.options.bar ||  'grey';
	this.options.barBg = this.options.barBg ||  'none';
}

ProgressStatusPlugin.prototype.apply = function(compiler) {
	var opts = this.options;
	var width = maxWidth();
	var renderID, active, latest;

	if(!process.stdout.isTTY) return;

	var render = function() {
		if(!active || latest.percent!==active.percent || latest.message!==active.message
				|| latest.details!==active.details) {
			var out;
			if(latest.percent<1) {
				out = progressBar(latest.percent, width, 7, {bar:opts.bar, bg:opts.barBg})
						+ '\n' + formatMessage(latest.message, width, 8, latest.details) + '\n';
			}
			if(active) {
				readline.moveCursor(process.stdout, 0, -2);
			}
			active = latest;
			if(active.percent<1) {
				process.stdout.write(out);
			} else {
				readline.clearScreenDown(process.stdout);
			}
		}
		renderID = false;
	};

	var update = function(value) {
		if(!active || active.percent<=value.percent) {
			latest = value;
			if(value.percent<1) {
				if(!renderID) {
					render();
					renderID = setTimeout(render, opts.throttle);
				}
				render()
			} else {
				render();
				clearTimeout(renderID);
			}
		}
	};

	compiler.apply(new webpack.ProgressPlugin(function(percent, message, extra1, extra2) {
		var details = extra1;
		if(extra1 && extra2) {
			details += ', ' + extra2;
		}
		update({
			percent: percent,
			message: message,
			details: details
		});
	}));

	compiler.plugin('compilation', function(compilation) {
		compilation.plugin('prerender-chunk', function() {
			update({
				percent: 0.885,
				message: 'Prerendering chunk to HTML'
			});
		});
		compilation.plugin('prerender-localized', function(prerender) {
			update({
				percent: 0.885,
				message: 'Prerendering chunk to HTML',
				details: prerender.locale + ' locale'
			});
		});
	});

	compiler.plugin('v8-snapshot', function() {
		update({
			percent: 0.97,
			message: 'Generating v8 snapshot blob'
		});
	});
};

module.exports = ProgressStatusPlugin;
