import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return (await readFile(new URL(path, import.meta.url), 'utf8')).replaceAll(
    '\r\n',
    '\n',
  );
}

const readWorkflow = () => read('../.github/workflows/weekly-mutation.yml');

function jobsIn(workflow) {
  const jobs = workflow.slice(workflow.indexOf('\njobs:\n'));
  const declarations = [...jobs.matchAll(/^ {2}([a-z_]+):\n/gm)];
  return Object.fromEntries(
    declarations.map((match, index) => [
      match[1],
      jobs.slice(match.index, declarations[index + 1]?.index),
    ]),
  );
}

function stepBody(job, step) {
  const start = job.indexOf(`- name: ${step}\n`);
  assert.notEqual(start, -1, `missing step ${step}`);
  const next = job.indexOf('\n      - name:', start);
  return job.slice(start, next === -1 ? undefined : next);
}

test('the weekly mutation run starts on Mondays after the weekly report, or by hand, and never on a pull request', async () => {
  const workflow = await readWorkflow();
  assert.match(
    workflow,
    /\non:\n {2}schedule:\n {4}- cron: '35 3 \* \* 1'\n {2}workflow_dispatch:\n\n/,
  );
  // Nothing it reports can gate a pull request or a merge.
  assert.doesNotMatch(
    workflow,
    /^ {2}(?:push|pull_request|pull_request_target|merge_group|workflow_run|workflow_call):/m,
  );
  const jobs = jobsIn(workflow);
  assert.deepEqual(Object.keys(jobs), ['select', 'mutate', 'report']);
  for (const [name, job] of Object.entries(jobs))
    assert.deepEqual(
      [...job.matchAll(/^ {4}runs-on: (.+)$/gm)].map((match) => match[1]),
      ['ubuntu-24.04'],
      name,
    );
  // Nothing cancels a run.
  assert.doesNotMatch(workflow, /^concurrency:/m);
  assert.doesNotMatch(workflow, /cancel-in-progress: true/);
});

test('selection reads the full main history and feeds the module matrix', async () => {
  const { select, mutate } = jobsIn(await readWorkflow());
  assert.match(select, /\n {8}with:\n {10}fetch-depth: 0\n/);
  const step = stepBody(
    select,
    'Select the allowlisted modules changed on main this week',
  );
  assert.match(step, /\n {8}id: select\n/);
  assert.match(
    step.trimEnd(),
    /\n {8}run: node scripts\/weekly-mutation\.mjs select$/,
  );
  assert.match(
    select,
    /\n {4}outputs:\n {6}modules: \$\{\{ steps\.select\.outputs\.modules \}\}\n {6}since: \$\{\{ steps\.select\.outputs\.since \}\}\n/,
  );
  assert.match(mutate, /^ {4}needs: select$/m);
  // With no changed module nothing runs.
  assert.match(
    mutate,
    /^ {4}if: \$\{\{ needs\.select\.outputs\.modules != '\[\]' \}\}$/m,
  );
  assert.match(
    mutate,
    /\n {4}strategy:\n {6}fail-fast: false\n {6}matrix:\n {8}include: \$\{\{ fromJSON\(needs\.select\.outputs\.modules\) \}\}\n/,
  );
  assert.match(mutate, /^ {4}timeout-minutes: 60$/m);
});

test('StrykerJS is pinned and installed outside the workspace, never as a repository dependency', async () => {
  const { mutate } = jobsIn(await readWorkflow());
  assert.match(mutate, /^ {6}STRYKER_VERSION: 10\.1\.1$/m);
  const install = stepBody(mutate, 'Install StrykerJS outside the workspace');
  assert.match(install, /npm install --prefix "\$RUNNER_TEMP\/stryker"/);
  assert.match(install, /--no-save/);
  assert.match(install, /--ignore-scripts/);
  assert.match(install, /"@stryker-mutator\/core@\$STRYKER_VERSION"/);
  // Stryker rewrites the copied tsconfig with the repository's TypeScript.
  assert.match(install, /typescript@/);
  for (const manifest of [
    '../package.json',
    '../apps/api/package.json',
    '../apps/web/package.json',
    '../pnpm-lock.yaml',
  ])
    assert.doesNotMatch(await read(manifest), /stryker/i, manifest);

  const run = stepBody(mutate, 'Mutate the module');
  assert.match(run, /\n {8}working-directory: \$\{\{ matrix\.project \}\}\n/);
  assert.match(run, /\n {10}MUTATION_MODULE: \$\{\{ matrix\.id \}\}\n/);
  assert.match(
    run.trimEnd(),
    /\n {8}run: node "\$RUNNER_TEMP\/stryker\/node_modules\/@stryker-mutator\/core\/bin\/stryker\.js" run "\$GITHUB_WORKSPACE\/scripts\/mutation\/stryker\.config\.mjs"$/,
  );

  const upload = stepBody(mutate, 'Upload the mutation report');
  assert.match(upload, /^ {8}if: \$\{\{ !cancelled\(\) \}\}$/m);
  assert.match(upload, /uses: actions\/upload-artifact@v4/);
  assert.match(upload, /name: weekly-mutation-\$\{\{ matrix\.id \}\}\n/);
  assert.match(upload, /path: \$\{\{ matrix\.report \}\}\n/);
});

test('only the report job writes issues, and it posts after every finished run', async () => {
  const workflow = await readWorkflow();
  assert.match(workflow, /\npermissions:\n {2}contents: read\n\n/);
  const { select, mutate, report } = jobsIn(workflow);
  for (const job of [select, mutate]) assert.doesNotMatch(job, /permissions:/);
  assert.match(
    report,
    /\n {4}permissions:\n {6}contents: read\n {6}actions: read\n {6}issues: write\n/,
  );
  assert.equal([...workflow.matchAll(/: write\b/g)].length, 1);
  assert.match(report, /^ {4}needs: \[select, mutate\]$/m);
  // A failed or timed-out module still gets its line in the comment.
  assert.match(report, /^ {4}if: \$\{\{ !cancelled\(\) \}\}$/m);
  assert.match(
    report,
    /\n {4}concurrency:\n {6}group: weekly-inspection-issue\n {6}cancel-in-progress: false\n/,
  );
  const download = stepBody(report, 'Download the mutation reports');
  assert.match(download, /uses: actions\/download-artifact@v4/);
  assert.match(download, /pattern: weekly-mutation-\*\n/);
  assert.match(download, /merge-multiple: true\n/);
  const post = stepBody(report, 'Post the weekly mutation comment');
  assert.match(post, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(
    post,
    /MUTATION_MODULES: \$\{\{ needs\.select\.outputs\.modules \}\}/,
  );
  assert.match(
    post,
    /MUTATION_SINCE: \$\{\{ needs\.select\.outputs\.since \}\}/,
  );
  assert.match(
    post.trimEnd(),
    /\n {8}run: node scripts\/weekly-mutation\.mjs report$/,
  );
  for (const line of workflow.split('\n'))
    if (/^\s*(?:- )?run:/.test(line))
      assert.doesNotMatch(line, /\$\{\{/, 'no expression inside a command');
});
