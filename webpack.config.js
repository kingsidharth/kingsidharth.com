var ExtractTextPlugin = require('extract-text-webpack-plugin');


module.exports = {

  // webpack folder’s entry js — excluded from jekll’s build process.
  entry: "./app/assets/js/index.js",

  output: {
    // we’re going to put the generated file in the assets folder so jekyll will grab it.
    // if using GitHub Pages, use the following:
    // path: "assets/javascripts"
    path: __dirname + "/app/assets/js",
    filename: "bundle.js"
  },

  module: {
    loaders: [
      {
        test: /\.jsx?$/,
        exclude: /(node_modules)/,
        loader: "babel-loader",
        query: {
          presets: ["es2015"]
        }
      },
    ]
  },

};
