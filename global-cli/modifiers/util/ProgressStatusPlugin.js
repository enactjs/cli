var
	readline = require('readline'),
	chalk = require('chalk'),
	webpack = require('webpack');

var bright = {
	black: [90, 39],
	red: [91, 39],
	green: [92, 39],
	yellow: [93, 39],
	blue: [94, 39],
	magenta: [95, 39],
	cyan: [96, 39],
	white: [97, 39],
	gray: [90, 39],
	grey: [90, 39],

	bgBlack: [100, 49],
	bgRed: [101, 49],
	bgGreen: [102, 49],
	bgYellow: [103, 49],
	bgBlue: [104, 49],
	bgMagenta: [105, 49],
	bgCyan: [106, 49],
	bgWhite: [107, 49]
};

function progressBar(percentage, width, opts) {
	var barWidth = width - (opts.padding*2) - 4;
	var progress = Math.round(percentage*barWidth);
	var back = barWidth - Math.round(percentage*barWidth);
	return ' '.repeat(opts.padding - opts.frameLeft.length) + opts.frameLeft + opts.barStyle(opts.bar.repeat(progress))
			+ opts.barBgStyle(opts.barBg.repeat(back)) + opts.frameRight + ' ' + Math.round(percentage*100) + '%';
}

function formatMessage(message, width, padding, details) {
	var end = width-padding;
	var out = ' '.repeat(padding) + message.charAt(0).toUpperCase() + message.substring(1);

	if(details) {
		out += ': ' + details;
	}

	if(out.length>end) {
		out = out.substring(0, end);
	}
	out += ' '.repeat(end-out.length);
	return out;
}

function colourTransformFn(style, useBright) {
	if(style && style !== 'none') {
		if(typeof style === 'function') {
			return style;
		} else if(useBright && bright[style]) {
			return function(text) {
				return '\u001B[' + bright[style][0] + 'm' + text + '\u001B[' + bright[style][1] + 'm';
			};
		} else if(chalk[style]) {
			return chalk[style];
		}
	}
	return function(text) { return text; };
}

function ProgressStatusPlugin(options) {
	this.options = options || {};
	this.options.throttle = this.options.throttle || 60;
	this.options.padding = this.options.padding || 8;
	this.options.frameLeft = (typeof this.options.frameLeft === 'string') ? this.options.frameLeft : '\u2595';
	this.options.frameRight = (typeof this.options.frameRight === 'string') ? this.options.frameRight : '\u258F';
	this.options.bar = this.options.bar || '\u2588';
	this.options.barBg = this.options.barBg || ' ';

	var useBright = process.platform==='win32' && (typeof this.options.brightOnWindows !== 'boolean' || this.options.brightOnWindows);
	this.options.barStyle = colourTransformFn(this.options.barStyle || 'gray', useBright);
	this.options.barBgStyle = colourTransformFn(this.options.barBgStyle || 'none', useBright);
}

ProgressStatusPlugin.prototype.apply = function(compiler) {
	var opts = this.options;
	var width = process.stdout.columns;
	var renderID, active, latest;

	if(!process.stdout.isTTY || process.env.CI) return;

	var render = function() {
		if(!active || latest.percent!==active.percent || latest.message!==active.message
				|| latest.details!==active.details) {
			var out;
			if(latest.percent<1) {
				out = progressBar(latest.percent, width, opts)
						+ '\n' + formatMessage(latest.message, width, opts.padding, latest.details) + '\n';
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
