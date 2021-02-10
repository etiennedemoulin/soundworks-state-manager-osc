#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const terminate = require('terminate');
const { fork } = require('child_process');
const chalk = require('chalk')
const debounce = require('lodash.debounce');

const processes = new Map();

// run the in a forked process
const start = async function(src, inspect) {
  if (!fs.existsSync(src)) {
    console.log(chalk.red(`
Cannot start process: file "${src}" does not exists.
- try to run \`num run build\` again
`));
    return;
  }

  fs.stat(src, async (err, stats) => {
    if (err) {
      console.log(err);
      return;
    }

    if (processes.has(src)) {
      await stop(src);
    }

    const options = inspect ? { execArgv: ['--inspect'] } : {};
    const delay = inspect ? 100 : 0;

    // @important - the timeout is needed for the inspect to properly exit
    // the value has been chosen by "rule of thumb"
    setTimeout(() => {
      const proc = fork(src, [], options);
      processes.set(src, proc);
    }, delay);
  });
}

// kill the forked process hosting the proc
const stop = async function(src) {
  return new Promise((resolve, reject) => {
    const proc = processes.get(src);

    if (proc) {
      terminate(proc.pid, 'SIGINT', (err) => {
        if (err) {
          console.log(`[@soundworks/template-build] could not stop ${src}`);
          console.log(err);
          reject();
        }
      });
    }

    processes.delete(src);
    resolve();
  });
}

module.exports = function watchProcess(processName, inspect) {
  const processPath = path.join('.build', processName);

  const watcher = chokidar.watch(processPath, {
    ignoreInitial: true,
  });

  console.log(chalk.cyan(`> watching process\t ${processPath}`));
  // restart to principal target (processPath)
  watcher
    // .on('add', debounce(filename => start(processPath, inspect), 300)) // probably not really needed
    .on('change', debounce(filename => start(processPath, inspect), 500))
    // .on('unlink', filename => start(processPath));

  // as we ignore initial changes we can start the process now
  start(processPath, inspect);
}











