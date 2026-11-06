import { appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { changedFiles } from './ci-change-scope.mjs';

// The one owner of what counts as a repeatable test file. Vitest files run
// in fresh processes (api, web); Playwright specs run with --repeat-each
// (browser, acceptance). `filesPerJob` bounds each parallel matrix job, and
// the environment fields are what that family needs from the CI setup.
export const testFamilies = {
  api: {
    root: 'apps/api/',
    pattern: /^apps\/api\/src\/.+\.test\.ts$/u,
    filesPerJob: 20,
    postgres: 'true',
    chromium: 'false',
    doctor: 'agent:doctor:postgres',
  },
  web: {
    root: 'apps/web/',
    pattern: /^apps\/web\/src\/.+\.test\.tsx?$/u,
    filesPerJob: 40,
    postgres: 'false',
    chromium: 'false',
    doctor: 'agent:doctor',
  },
  browser: {
    root: 'apps/web/',
    pattern: /^apps\/web\/e2e\/[^/]+(?<!\.acceptance)\.spec\.ts$/u,
    filesPerJob: 20,
    postgres: 'false',
    chromium: 'true',
    doctor: 'agent:doctor:web',
  },
  acceptance: {
    root: 'apps/web/',
    pattern: /^apps\/web\/e2e\/[^/]+\.acceptance\.spec\.ts$/u,
    filesPerJob: 6,
    postgres: 'true',
    chromium: 'true',
    doctor: 'agent:doctor:web-postgres',
  },
};

// File names reach commands only as separate arguments, but a test file the
// repeat cannot name safely is refused instead of silently skipped.
const SAFE_PATH = /^[A-Za-z0-9._@/-]+$/u;
const APPLICATION_TEST = /^apps\/(?:api|web)\/[\s\S]*\.(?:test|spec)\.tsx?$/u;

/**
 * Groups added or modified test files by family, sorted and unique. Files
 * that no longer exist (deleted by the change) and every file that is not a
 * family test file (helpers, fixtures, `scripts/*.test.mjs`, docs) drop out.
 */
export function classifyTestFiles(files, exists = existsSync) {
  const grouped = Object.fromEntries(
    Object.keys(testFamilies).map((family) => [family, new Set()]),
  );
  for (const file of files) {
    if (APPLICATION_TEST.test(file) && !SAFE_PATH.test(file))
      throw new Error(`unsupported test file name ${JSON.stringify(file)}`);
    const family = Object.keys(testFamilies).find((name) =>
      testFamilies[name].pattern.test(file),
    );
    if (family !== undefined && exists(file)) grouped[family].add(file);
  }
  return Object.fromEntries(
    Object.entries(grouped).map(([family, paths]) => [
      family,
      [...paths].sort(),
    ]),
  );
}

/** One parallel matrix job per bounded slice of each family's files. */
export function repeatMatrix(grouped) {
  const include = [];
  for (const [family, definition] of Object.entries(testFamilies)) {
    const files = grouped[family] ?? [];
    const jobs = Math.ceil(files.length / definition.filesPerJob);
    for (let index = 0; index < jobs; index += 1)
      include.push({
        label: jobs === 1 ? family : `${family} ${index + 1}/${jobs}`,
        family,
        files: files.slice(
          index * definition.filesPerJob,
          (index + 1) * definition.filesPerJob,
        ),
        postgres: definition.postgres,
        chromium: definition.chromium,
        doctor: definition.doctor,
      });
  }
  return { include };
}

/**
 * Only a pull request repeats tests. An unreadable change list throws: the
 * guard must never be skipped on a doubt.
 */
export function selectRepeatTests({
  event,
  base,
  head,
  readChangedFiles = changedFiles,
  exists = existsSync,
}) {
  if (event !== 'pull_request')
    return { repeatTests: 'false', matrix: { include: [] } };
  const files = readChangedFiles(base, head);
  if (!Array.isArray(files))
    throw new Error(
      'Cannot select tests to repeat: could not read the changed files.',
    );
  const matrix = repeatMatrix(classifyTestFiles(files, exists));
  return {
    repeatTests: matrix.include.length > 0 ? 'true' : 'false',
    matrix,
  };
}

function main() {
  let selected;
  try {
    selected = selectRepeatTests({
      event: process.env.EVENT_NAME,
      base: process.env.BASE_SHA,
      head: process.env.HEAD_SHA,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const lines = `repeat_tests=${selected.repeatTests}\nrepeat_matrix=${JSON.stringify(selected.matrix)}\n`;
  process.stdout.write(lines);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, lines);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
