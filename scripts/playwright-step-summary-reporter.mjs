import path from 'node:path';

import { appendFailureSummary } from './ci-failure-summary.mjs';

/**
 * Playwright reporter that names the failing tests in the GitHub job summary.
 * Playwright's built-in `github` reporter only creates annotations, and no
 * built-in reporter writes a job summary. It prints nothing itself, so the
 * stdio reporters configured next to it stay in charge of the log, and it
 * never changes the outcome of the run.
 */
export default class PlaywrightStepSummaryReporter {
  #baseDirectory = '';
  #suite;
  #fatalErrors = [];

  printsToStdio() {
    return false;
  }

  onBegin(config, suite) {
    this.#baseDirectory = config.configFile
      ? path.dirname(config.configFile)
      : config.rootDir;
    this.#suite = suite;
  }

  onError(error) {
    this.#fatalErrors.push(error);
  }

  async onEnd() {
    try {
      const failures = [];
      for (const test of this.#suite?.allTests() ?? []) {
        if (test.outcome() !== 'unexpected') continue;
        const [, project, , ...titles] = test.titlePath();
        const file = path
          .relative(this.#baseDirectory, test.location.file)
          .split(path.sep)
          .join('/');
        failures.push({
          location: `${project ? `[${project}] ` : ''}${file}:${test.location.line}`,
          title: titles.join(' > '),
          message: test.results.at(-1)?.error?.message,
        });
      }
      for (const error of this.#fatalErrors)
        failures.push({
          title: 'Error outside any test',
          message: error.message,
        });
      appendFailureSummary({
        runner: 'Playwright',
        failures,
        note: 'Traces and screenshots of the failed tests are kept in the browser evidence artifacts of this run.',
      });
    } catch (error) {
      console.warn(
        `Could not build the failing-test summary: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
