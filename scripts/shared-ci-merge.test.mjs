import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const executionPath = 'docs/agents/issue-execution.md';
const procedurePath = 'docs/agents/shared-ci-merge.md';

test('the canonical merge rules route shared changes and preserve ordinary PR merges', async () => {
  const execution = await read(executionPath);
  const merge = execution.match(
    /^## CI and merge\r?\n([\s\S]+?)(?=^## )/mu,
  )?.[1];

  assert.ok(merge, 'issue execution must own the merge procedure');
  assert.match(merge, /\]\(shared-ci-merge\.md\)/u);
  assert.match(merge, /An advancing base needs no refresh for ordinary PRs/u);
  assert.match(merge, /No merge queue/u);
  assert.match(merge, /gh pr merge <n> --squash --match-head-commit <sha>/u);
  const procedure = await read(procedurePath);
  assert.match(procedure, /global strict status checks stay off/u);
});

test('shared workflow changes hold affected PRs before merge and resume only after tested-base proof', async () => {
  const procedure = await read(procedurePath);
  assert.match(procedure, /workflow, lint rule, or test contract/u);
  const steps = procedure
    .split(/^## Example\r?$/mu)[0]
    .split(/^\d+\. /mu)
    .slice(1);
  assert.equal(steps.length, 3, 'coordinate in order: hold, merge, verify');
  const [hold, merge, verify] = steps;
  assert.match(hold, /open PRs/u);
  assert.match(hold, /hold manual merges/u);
  assert.match(hold, /gh pr merge <pr> --disable-auto/u);
  assert.match(hold, /autoMergeRequest/u);
  assert.match(hold, /competing PR merged first/u);
  assert.match(merge, /shared squash SHA/u);
  assert.match(
    merge,
    /If an affected PR slips through after the shared merge/u,
  );
  assert.match(verify, /conflicts/u);
  assert.match(verify, /fresh PR CI/u);
  assert.match(verify, /successful `quality`/u);
  assert.match(verify, /CI_CHECKOUT/u);
  assert.match(verify, /first parent is the tested base/u);
  assert.match(verify, /contains the shared squash SHA/u);
  assert.match(verify, /second parent equals the current PR head/u);
  assert.match(verify, /Resume .* only after/u);
});

test('the #1400 replay puts the #1396 hold before #1395 and detects the lint failure before merge', async () => {
  const procedure = await read(procedurePath);
  const example = procedure.match(/^## Example\r?\n([\s\S]+)$/mu)?.[1];

  assert.ok(example, 'the #1400 incident must have a prevention example');
  assert.match(
    example,
    /issues\/1400[^\n]+#1396 passed CI on a base that preceded #1395/u,
  );
  assert.match(
    example,
    /hold #1396 before merging #1395, then verify #1396 on a base containing #1395/u,
  );
  assert.match(example, /lint failure while #1396 is still open/u);
});
