var ExtractTextPlugin = require("../../../");
module.exports = {
	entry: "./index",
	module: {
		loaders: [
			{ test: /\.css$/, use: ExtractTextPlugin.extract({
				fallback: { loader: "style-loader" },
				use: { loader: "css-loader", options: {
					sourceMap: true
				} }
			}) }
		]
	},
	devtool: "source-map",
	plugins: [
		new ExtractTextPlugin("file.css")
	]
};
