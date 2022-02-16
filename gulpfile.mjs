import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

import { spawn } from 'child_process';
import { program } from 'commander';
import log from 'fancy-log';
import glob from 'glob';
import gulp from 'gulp';
import * as rollup from 'rollup';

/** @param {import('rollup').RollupWarning} warning */
function logRollupWarning(warning) {
  log.info(`Rollup warning: ${warning} (${warning.url})`);
}

/**
 * Build a bundle of tests and run them using Karma.
 *
 * @param {object} options
 *   @param {string} [options.bootstrapFile] - Entry point for the test bundle that initializes the environment
 *   @param {string} [options.karmaConfig] - Karma config file
 *   @param {string} [options.outputDir] - Directory in which to generate test bundle.
 *   @param {string} [options.rollupConfig] - Rollup config that generates the test bundle using
 *     `${outputDir}/test-inputs.js` as an entry point
 *   @param {string} [options.testsPattern] - Minimatch pattern that specifies which test files to
 *   load
 * @return {Promise<void>} - Promise that resolves when test run completes
 */
async function runTests({
  bootstrapFile = 'tests/bootstrap.js',
  karmaConfig = 'tests/karma.config.js',
  outputDir = 'build',
  rollupConfig = './rollup-tests.config.mjs',
  testsPattern = 'tests/**/*-test.js',
}) {
  // Parse command-line options for test execution.
  program
    .option(
      '--grep <pattern>',
      'Run only tests where filename matches a regex pattern'
    )
    .option('--watch', 'Continuously run tests (default: false)', false)
    .parse(process.argv);

  const { grep, watch } = program.opts();
  const singleRun = !watch;

  // Generate an entry file for the test bundle. This imports all the test
  // modules, filtered by the pattern specified by the `--grep` CLI option.
  const testFiles = [
    bootstrapFile,
    ...glob.sync(testsPattern).filter(path => (grep ? path.match(grep) : true)),
  ];

  const testSource = testFiles.map(path => `import "../${path}";`).join('\n');

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(`${outputDir}/test-inputs.js`, testSource);

  // Build the test bundle.
  log(`Building test bundle... (${testFiles.length} files)`);
  const { default: config } = await import(rollupConfig);
  if (singleRun) {
    const bundle = await rollup.rollup({
      ...config,
      onwarn: logRollupWarning,
    });
    await bundle.write(config.output);
  } else {
    const watcher = rollup.watch({
      ...config,
      onwarn: logRollupWarning,
    });
    await new Promise(resolve => {
      watcher.on('event', event => {
        switch (event.code) {
          case 'START':
            log.info('JS build starting...');
            break;
          case 'BUNDLE_END':
            event.result.close();
            break;
          case 'ERROR':
            log.info('JS build error', event.error);
            break;
          case 'END':
            log.info('JS build completed.');
            resolve(); // Resolve once the initial build completes.
            break;
        }
      });
    });
  }

  // Run the tests.
  log('Starting Karma...');
  const { default: karma } = await import('karma');
  const parsedConfig = await karma.config.parseConfig(
    path.resolve(karmaConfig),
    { singleRun }
  );

  return new Promise((resolve, reject) => {
    new karma.Server(parsedConfig, exitCode => {
      if (exitCode === 0) {
        resolve();
      } else {
        reject(new Error(`Karma run failed with status ${exitCode}`));
      }
    }).start();

    process.on('SIGINT', () => {
      // Give Karma a chance to handle SIGINT and cleanup, but forcibly
      // exit if it takes too long.
      setTimeout(() => {
        resolve();
        process.exit(1);
      }, 5000);
    });
  });
}

function build(cb) {
  const make = spawn('make', ['build'], { stdio: 'inherit' });
  make.on('close', code => {
    if (code !== 0) {
      cb(new Error(`make exited with status ${code}`));
    } else {
      cb(null);
    }
  });
}

function watchClient() {
  gulp.watch('node_modules/hypothesis', { events: 'all' }, build);
}

function watchSrc() {
  gulp.watch('src', { events: 'all' }, build);
}

gulp.task('watch', gulp.parallel(build, watchClient, watchSrc));
gulp.task('test', runTests);
