
const path = require('path');

module.exports = {
  entry: './app/assets/js/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'app/assets/js'),
  },
};
