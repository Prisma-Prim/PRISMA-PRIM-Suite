import { appendFailureSummary } from './ci-failure-summary.mjs';

/**
 * Vitest reporter that names the failing tests in the GitHub job summary,
 * which Vitest's built-in `github-actions` reporter does not (it only counts
 * them; the names reach the checks page as annotations). It is configured only
 * for GitHub Actions and never changes the outcome of the run.
 */
export default class VitestStepSummaryReporter {
  onTestRunEnd(testModules, unhandledErrors) {
    try {
      const failures = [];
      for (const testModule of testModules) {
        const listedBefore = failures.length;
        for (const test of testModule.children.allTests('failed'))
          failures.push({
            location: testModule.relativeModuleId,
            title: test.fullName,
            message: test.result().errors?.[0]?.message,
          });
        for (const error of testModule.errors())
          failures.push({
            location: testModule.relativeModuleId,
            title: 'File failed before its tests ran',
            message: error.message,
          });
        if (testModule.state() === 'failed' && failures.length === listedBefore)
          failures.push({
            location: testModule.relativeModuleId,
            title: 'File failed without a failing test',
          });
      }
      for (const error of unhandledErrors)
        failures.push({
          title: 'Unhandled error outside any test',
          message: error.message,
        });
      appendFailureSummary({ runner: 'Vitest', failures });
    } catch (error) {
      console.warn(
        `Could not build the failing-test summary: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
