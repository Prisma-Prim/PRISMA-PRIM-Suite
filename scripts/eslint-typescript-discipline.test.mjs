import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryConfig = path.join(repositoryRoot, 'eslint.config.mjs');
const eslintBin = path.join(
  repositoryRoot,
  'node_modules',
  'eslint',
  'bin',
  'eslint.js',
);

const nonNullRule = '@typescript-eslint/no-non-null-assertion';
const assertionRule = '@typescript-eslint/consistent-type-assertions';

// Exit codes of the ESLint CLI: 1 reports lint errors, 2 reports a usage
// problem, including recorded suppressions that no longer occur.
const lintErrors = 1;
const staleBaseline = 2;

/**
 * Lints one TypeScript file with the repository configuration inside a
 * throwaway directory, so the result depends only on the fixture and on
 * `eslint.config.mjs`, never on the state of the real baseline.
 */
async function lintProbe({ source, suppressions }) {
  const directory = await mkdtemp(path.join(tmpdir(), 'eslint-discipline-'));
  try {
    await mkdir(path.join(directory, 'src'));
    await writeFile(
      path.join(directory, 'eslint.config.mjs'),
      `export { default } from ${JSON.stringify(pathToFileURL(repositoryConfig).href)};\n`,
    );
    await writeFile(path.join(directory, 'src', 'probe.ts'), source);
    if (suppressions) {
      await writeFile(
        path.join(directory, 'eslint-suppressions.json'),
        JSON.stringify(suppressions),
      );
    }
    const result = spawnSync(process.execPath, [eslintBin, '.'], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(result.error, undefined);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const oneOfEach = [
  'declare const maybe: string | null;',
  'export const asserted = maybe!;',
  'export const cast = maybe as string;',
  '',
].join('\n');

const oneOfEachBaseline = {
  'src/probe.ts': {
    [nonNullRule]: { count: 1 },
    [assertionRule]: { count: 1 },
  },
};

test('a new non-null assertion or type assertion fails lint', async () => {
  const result = await lintProbe({ source: oneOfEach });

  assert.equal(result.status, lintErrors, result.output);
  assert.match(result.output, new RegExp(`error.*${nonNullRule}`));
  assert.match(result.output, new RegExp(`error.*${assertionRule}`));
});

test('angle-bracket assertions and double assertions are also rejected', async () => {
  const result = await lintProbe({
    source: [
      'declare const raw: unknown;',
      'export const angle = <string>raw;',
      'export const double = raw as unknown as string;',
      '',
    ].join('\n'),
  });

  assert.equal(result.status, lintErrors, result.output);
  assert.match(result.output, new RegExp(assertionRule));
});

test('const assertions, satisfies and type annotations remain allowed', async () => {
  const result = await lintProbe({
    source: [
      "export const literal = { kind: 'a' } as const;",
      "export const checked = { kind: 'a' } satisfies { kind: string };",
      'export const typed: string[] = [];',
      '',
    ].join('\n'),
  });

  assert.equal(result.status, 0, result.output);
});

test('violations recorded in the baseline pass and the baseline never hides more', async () => {
  const recorded = await lintProbe({
    source: oneOfEach,
    suppressions: oneOfEachBaseline,
  });
  assert.equal(recorded.status, 0, recorded.output);

  const added = await lintProbe({
    source: `${oneOfEach}export const another = maybe!;\n`,
    suppressions: oneOfEachBaseline,
  });
  assert.equal(added.status, lintErrors, added.output);
  assert.match(added.output, new RegExp(`error.*${nonNullRule}`));
});

test('a baseline entry for a fixed violation fails lint until it is pruned', async () => {
  const result = await lintProbe({
    source: [
      'declare const maybe: string | null;',
      'export const cast = maybe as string;',
      '',
    ].join('\n'),
    suppressions: oneOfEachBaseline,
  });

  assert.equal(result.status, staleBaseline, result.output);
  assert.match(result.output, /--prune-suppressions/);
});

// `no-restricted-syntax` is baselined for a web AbortController (#1135) and
// for a `legacy` identifier (#1349) in API and web source; the API's
// append-only Activity Log rule is never baselined. `no-warning-comments`
// is baselined only for `legacy` comments (#1349).
const webSyntaxRule = 'no-restricted-syntax';
const legacyCommentRule = 'no-warning-comments';
const applicationSource = /^apps\/(web|api)\/src\//;

test('the committed baseline records only the discipline rules and web AbortControllers for existing files', async () => {
  const baseline = JSON.parse(
    await readFile(
      new URL('../eslint-suppressions.json', import.meta.url),
      'utf8',
    ),
  );

  for (const [file, rules] of Object.entries(baseline)) {
    assert.doesNotMatch(file, /\\|^[A-Za-z]:|^\//, `${file} must be POSIX`);
    await access(path.join(repositoryRoot, file));
    for (const [rule, { count }] of Object.entries(rules)) {
      assert.ok(
        [nonNullRule, assertionRule].includes(rule) ||
          ([webSyntaxRule, legacyCommentRule].includes(rule) &&
            applicationSource.test(file)),
        `${file} suppresses ${rule}; the baseline is reserved for the TypeScript discipline rules, web AbortControllers and legacy names`,
      );
      assert.ok(Number.isInteger(count) && count > 0, `${file} ${rule}`);
    }
  }
});
