import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyTestFiles, testFamilies } from './ci-changed-tests.mjs';

/** How many times each changed test file runs before a pull request can merge. */
export const repeatCount = 3;

const vitestPackages = { api: '@prisma-prim/api', web: '@prisma-prim/web' };

/**
 * The commands that repeat one family's changed files.
 * - Vitest has no repeat option for a run, so each repetition is a fresh
 *   `vitest run` process.
 * - Browser specs intercept their API calls, so Playwright repeats them
 *   natively with --repeat-each.
 * - Acceptance specs write fixed synthetic records to PostgreSQL, and the
 *   database is created once per Playwright run by its global setup: a repeat
 *   inside one run hits those records (HTTP 409) and fails every spec. Each
 *   repetition is therefore a whole Playwright run with a fresh database.
 */
export function repeatInvocations({
  family,
  files,
  project,
  repeats = repeatCount,
}) {
  if (!Object.hasOwn(testFamilies, family))
    throw new Error(`unknown test family ${JSON.stringify(family)}`);
  if (family === 'acceptance') {
    if (!testFamilies.acceptance.projects.includes(project))
      throw new Error('Expected a canonical acceptance project to repeat');
  } else if (project !== undefined)
    throw new Error('A project partition is only supported for acceptance');
  if (
    !Array.isArray(files) ||
    files.length === 0 ||
    files.some((file) => typeof file !== 'string')
  )
    throw new Error(`no test files to repeat for the ${family} family`);
  const grouped = classifyTestFiles(files, () => true);
  for (const file of files)
    if (!grouped[family].includes(file))
      throw new Error(`${file} is not in the ${family} test family`);
  const relative = files.map((file) =>
    file.slice(testFamilies[family].root.length),
  );
  // Playwright reads positional arguments as regular expressions. A safe
  // path (letters, digits, `._@-/`) under `e2e/` selects only that spec and
  // needs no quoting through pnpm.
  if (family === 'browser')
    return [
      {
        command: 'pnpm',
        args: [
          '--filter',
          '@prisma-prim/web',
          'test:browser',
          `--repeat-each=${repeats}`,
          ...relative,
        ],
      },
    ];
  if (family === 'acceptance')
    return Array.from({ length: repeats }, () => ({
      command: 'pnpm',
      args: [
        '--filter',
        '@prisma-prim/web',
        'test:browser:acceptance',
        `--project=${project}`,
        ...relative,
      ],
    }));
  // Shared-database API files must not interleave, as in the serial suite.
  const isolation = family === 'api' ? ['--no-file-parallelism'] : [];
  return Array.from({ length: repeats }, () => ({
    command: 'pnpm',
    args: [
      '--filter',
      vitestPackages[family],
      'exec',
      'vitest',
      'run',
      ...isolation,
      ...relative,
    ],
  }));
}

/** Runs the repetitions in order and stops at the first one that is not green. */
export function runRepeats({
  family,
  files,
  project,
  repeats = repeatCount,
  run,
}) {
  const invocations = repeatInvocations({ family, files, project, repeats });
  for (const [index, { command, args }] of invocations.entries()) {
    if (run(command, args) !== 0)
      return {
        ok: false,
        // --repeat-each repeats inside one run and cannot name the repeat.
        failedRepetition: invocations.length === 1 ? undefined : index + 1,
        repetitions: repeats,
      };
  }
  return { ok: true, failedRepetition: undefined, repetitions: repeats };
}

function main() {
  let family;
  let files;
  let outcome;
  const started = Date.now();
  try {
    family = process.env.REPEAT_FAMILY;
    files = JSON.parse(process.env.REPEAT_FILES ?? '');
    outcome = runRepeats({
      family,
      files,
      project: process.env.REPEAT_PROJECT || undefined,
      run: (command, args) => {
        console.log(`\n> ${command} ${args.join(' ')}`);
        const child = spawnSync(command, args, {
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });
        return child.status;
      },
    });
  } catch (error) {
    console.error(
      `Cannot repeat changed tests: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  const subject = `${files.length} changed ${family} test file(s), ${repeatCount} repetitions`;
  if (outcome.ok) {
    console.log(`\nStable: ${subject}, ${seconds}s.`);
    return;
  }
  const where =
    outcome.failedRepetition === undefined
      ? 'during the repeated run'
      : `on repetition ${outcome.failedRepetition} of ${outcome.repetitions}`;
  console.error(
    `::error title=Changed test is not stable::A changed ${family} test failed ${where}. ` +
      `Fix the test or its race; a failing repetition blocks the merge. Files: ${files.join(', ')}`,
  );
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
