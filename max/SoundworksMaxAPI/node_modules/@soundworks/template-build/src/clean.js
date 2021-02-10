const chalk = require('chalk');
const rimraf = require('rimraf');

module.exports = function clean() {
  rimraf('.build', () => console.log(chalk.yellow(`+ deleted build folder`)));
}
