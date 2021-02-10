#!/usr/bin/env node
const path = require('path');
const babel = require('@babel/core');
const chalk = require('chalk')
const chokidar = require('chokidar');
const fs = require('fs-extra');
const webpack = require('webpack');
const JSON5 = require('json5');
const klawSync = require('klaw-sync');

const cwd = process.cwd();

// we need support for iOS 9.3.5
const browserList = 'ios >= 9, not ie 11, not op_mini all';

function bundleNode(inputFolder, outputFolder, watch) {
  function compileOrCopy(pathname) {
    if (fs.lstatSync(pathname).isDirectory()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const inputFilename = pathname;
      const outputFilename = inputFilename.replace(inputFolder, outputFolder);
      fs.ensureFileSync(outputFilename);

      if (/(\.js|\.mjs)$/.test(inputFilename)) {
        babel.transformFile(inputFilename, {
          inputSourceMap: true,
          sourceMap: "inline",
          plugins: [
            ['@babel/plugin-transform-modules-commonjs'],
            ['@babel/plugin-transform-arrow-functions'],
            ['@babel/plugin-proposal-class-properties', { loose : true }]
          ]
        }, function (err, result) {
          if (err) {
            return console.log(err.message);
            reject();
          }

          resolve();
          fs.writeFileSync(outputFilename, result.code);
          console.log(chalk.green(`> transpiled\t ${inputFilename}`));
        });
      } else {
        fs.copyFileSync(inputFilename, outputFilename);
        console.log(chalk.green(`> copied\t ${inputFilename}`));
        resolve();
      }
    });
  }

  if (!watch) {
    const files = klawSync(inputFolder);
    const relFiles = files.map(f => path.relative(process.cwd(), f.path));
    const promises = relFiles.map(f => compileOrCopy(f));
    return Promise.all(promises);
  } else {
    const chokidarOptions = watch ? { ignoreInitial: true } : {};
    const watcher = chokidar.watch(inputFolder, chokidarOptions);

    watcher.on('add', pathname => compileOrCopy(pathname));
    watcher.on('change', pathname => compileOrCopy(pathname));
    watcher.on('unlink', pathname => {
      const outputFilename = pathname.replace(inputFolder, outputFolder);
      fs.unlinkSync(outputFilename);
    });

    return Promise.resolve();
  }
}

function bundleBrowser(inputFile, outputFile, watch, minify) {
  let mode = 'development';
  let devTools = 'eval-cheap-module-source-map';

  const babelPresets = [
    ['@babel/preset-env',
      {
        targets: browserList,
      }
    ]
  ];

  // production
  if (minify) {
    mode = 'production';
    devTools = false;

    babelPresets.push(['minify', {
      builtIns: false,
    }]);

  }

  const compiler = webpack({
    mode: mode,
    devtool: devTools,
    entry: inputFile,
    output: {
      path: path.dirname(outputFile),
      filename: path.basename(outputFile),
    },
    resolveLoader: {
      modules: ['node_modules', path.join(__dirname, '..', 'node_modules')]
    },
    module: {
      rules: [
        {
          test: /\.(js|mjs)$/,
          // 'exclude': /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: babelPresets,
              plugins: [
                // ['@babel/plugin-transform-modules-commonjs'],
                ['@babel/plugin-transform-arrow-functions'],
                ['@babel/plugin-proposal-class-properties', { loose : true }]
              ],
            }
          }
        }
      ]
    }
  });

  if (!watch) {
    return new Promise((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err || stats.hasErrors()) {
          console.log(stats.compilation.errors);
        }

        console.log(chalk.green(`> bundled\t ${outputFile.replace(cwd, '')}`));
        resolve();
      });
    });
  } else {
    // we can't ignore initial build, so let's keep everything sequencial
    return new Promise((resolve, reject) => {
      const watching = compiler.watch({
        aggregateTimeout: 300,
        poll: undefined
      }, (err, stats) => { // Stats Object
        if (err || stats.hasErrors()) {
          console.log(stats.compilation.errors);
        }

        console.log(chalk.green(`> bundled\t ${outputFile.replace(cwd, '')}`));
        resolve();
      });
    });
  }
}


module.exports = async function buildApplication(watch = false, minify = false) {
  const cmdString = watch ? 'watching' : 'building';
  // -----------------------------------------
  // server files
  // -----------------------------------------
  {
    console.log(chalk.yellow(`+ ${cmdString} server`));
    const configSrc = path.join('src', 'server');
    const configDist = path.join('.build', 'server');
    await bundleNode(configSrc, configDist, watch);
  }

  // -----------------------------------------
  // clients files
  // -----------------------------------------
  {
    // utility function
    function getClientTarget(name) {
      try {
        const data = fs.readFileSync(path.join(cwd, 'config', 'application.json'));
        const config = JSON5.parse(data);
        const clientsConfig = config.clients

        if (clientsConfig[name] && clientsConfig[name].target) {
          return clientsConfig[name].target;
        } else {
          return null;
        };
      } catch(err) {
        console.log(chalk.red('> Invalid `config/application.json` file'));
        process.exit(0);
      }
    }

    // real process
    const clientsSrc = path.join('src', 'clients');
    const filenames = fs.readdirSync(clientsSrc);
    const clients = filenames.filter(filename => {
      const relPath = path.join(clientsSrc, filename);
      const isDir = fs.lstatSync(relPath).isDirectory();
      return isDir;
    }).sort((a, b) => {
      // we want to build the browsers files last
      const aTarget = getClientTarget(a);
      return (aTarget === 'browser') ? 1 : -1;
    });

    for (let clientName of clients) {
      const target = getClientTarget(clientName);

      // IoT clients or any shared/utils file
      if (target !== 'browser') {
        if (target === 'node') {
          console.log(chalk.yellow(`+ ${cmdString} node client "${clientName}"`));
        } else {
          console.log(chalk.yellow(`+ ${cmdString} folder "${clientName}"`));
        }

        const inputFolder = path.join('src', 'clients', clientName);
        const outputFolder = path.join('.build', clientName);
        await bundleNode(inputFolder, outputFolder, watch);

      // regular browser clients
      } else {
        console.log(chalk.yellow(`+ ${cmdString} browser client "${clientName}"`));

        const inputFile = path.join(cwd, 'src', 'clients', clientName, 'index.js');
        const outputFile = path.join(cwd, '.build', 'public', `${clientName}.js`);
        await bundleBrowser(inputFile, outputFile, watch);

        if (minify) {
          console.log(chalk.yellow(`+ minifying browser client "${clientName}"`));
          const minOutputFile = path.join(cwd, '.build', 'public', `${clientName}.min.js`);
          await bundleBrowser(inputFile, minOutputFile, false, true);
        }
      }
    }
  }

  process.on('SIGINT', function() {
    console.log(chalk.cyan('\n>>> EXIT'))
    process.exit();
  });
}


