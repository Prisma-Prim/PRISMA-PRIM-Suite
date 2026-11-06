import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  evaluateGrid,
  formatReport,
  lookupIssueStatesWithGh,
  main,
  parseGrid,
} from './mvp-progress.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const gridPath = 'docs/product/mvp-capability-grid.csv';
const header = 'id,module,group,capability,delivery_issues,status_rule';

const states = (entries) =>
  new Map(
    Object.entries(entries).map(([issue, [state, stateReason]]) => [
      Number(issue),
      { state, stateReason },
    ]),
  );
const closed = ['CLOSED', 'COMPLETED'];

function miniGrid(rows) {
  return parseGrid([header, ...rows].join('\n'));
}

test('the committed grid keeps the official 71-capability shape', async () => {
  const text = await readFile(resolve(repositoryRoot, gridPath), 'utf8');
  const rows = parseGrid(text);

  assert.equal(rows.length, 71);
  assert.equal(new Set(rows.map((row) => row.id)).size, 71);
  assert.equal(new Set(rows.map((row) => row.module)).size, 19);

  const perGroup = Object.groupBy(rows, (row) => row.group);
  assert.deepEqual(
    {
      'operational base': perGroup['operational base'].length,
      commerce: perGroup.commerce.length,
      finalization: perGroup.finalization.length,
    },
    { 'operational base': 38, commerce: 24, finalization: 9 },
  );
});

test('parseGrid reads quoted fields, issue lists and the unmapped rule', () => {
  const rows = miniGrid([
    'A-1,Module one,commerce,"Quoted, with comma",12;34,closed-completed',
    'A-2,Module one,commerce,No evidence yet,,unmapped',
  ]);

  assert.deepEqual(rows, [
    {
      id: 'A-1',
      module: 'Module one',
      group: 'commerce',
      capability: 'Quoted, with comma',
      issues: [12, 34],
      statusRule: 'closed-completed',
    },
    {
      id: 'A-2',
      module: 'Module one',
      group: 'commerce',
      capability: 'No evidence yet',
      issues: [],
      statusRule: 'unmapped',
    },
  ]);
});

test('parseGrid reports every malformed row with its line number', () => {
  const malformed = [
    header,
    'A-1,Module,commerce,Fine,1,closed-completed',
    'A-1,Module,commerce,Duplicate id,2,closed-completed',
    'A-3,Module,elsewhere,Unknown group,3,closed-completed',
    'A-4,Module,commerce,Rule without issues,,closed-completed',
    'A-5,Module,commerce,Issues on an unmapped row,5,unmapped',
    'A-6,Module,commerce,Bad issue list,5;x,closed-completed',
    'A-7,Module,commerce,Repeated issue,5;5,closed-completed',
    'A-8,Module,commerce,Unknown rule,5,maybe',
    'A-9,Module,commerce,Too few columns',
  ].join('\n');

  assert.throws(
    () => parseGrid(malformed),
    (error) => {
      assert.match(error.message, /line 3: duplicate id A-1/u);
      assert.match(error.message, /line 4: unknown group "elsewhere"/u);
      assert.match(error.message, /line 5: .*closed-completed.*issue/u);
      assert.match(error.message, /line 6: .*unmapped.*no issue/u);
      assert.match(error.message, /line 7: invalid delivery issues "5;x"/u);
      assert.match(error.message, /line 8: invalid delivery issues "5;5"/u);
      assert.match(error.message, /line 9: unknown status rule "maybe"/u);
      assert.match(error.message, /line 10: expected 6 columns, found 4/u);
      return true;
    },
  );
  assert.throws(() => parseGrid('id,module\nA,B'), /header/u);
});

test('a capability is delivered only when every listed issue is closed as completed', () => {
  const rows = miniGrid([
    'A-1,M,commerce,Done,1;2,closed-completed',
    'A-2,M,commerce,One still open,1;3,closed-completed',
    'A-3,M,commerce,Not planned,4,closed-completed',
    'A-4,M,commerce,Duplicate close,7,closed-completed',
    'A-5,M,commerce,Unknown issue,5,closed-completed',
    'A-6,M,commerce,Reopened,8,closed-completed',
    'A-7,M,commerce,Unmapped,,unmapped',
  ]);
  const evaluation = evaluateGrid(
    rows,
    states({
      1: closed,
      2: closed,
      3: ['OPEN', null],
      4: ['CLOSED', 'NOT_PLANNED'],
      7: ['CLOSED', 'DUPLICATE'],
      8: ['OPEN', 'REOPENED'],
    }),
  );

  const byId = Object.fromEntries(evaluation.rows.map((row) => [row.id, row]));
  assert.equal(byId['A-1'].status, 'delivered');
  assert.equal(byId['A-2'].status, 'pending');
  assert.deepEqual(byId['A-2'].blockers, [{ issue: 3, reason: 'open' }]);
  assert.deepEqual(byId['A-3'].blockers, [
    { issue: 4, reason: 'closed as not planned' },
  ]);
  assert.deepEqual(byId['A-4'].blockers, [
    { issue: 7, reason: 'closed as duplicate' },
  ]);
  assert.deepEqual(byId['A-5'].blockers, [
    { issue: 5, reason: 'not found or not an issue' },
  ]);
  assert.deepEqual(byId['A-6'].blockers, [{ issue: 8, reason: 'open' }]);
  assert.equal(byId['A-7'].status, 'unmapped');
  assert.deepEqual(byId['A-7'].blockers, []);
  assert.equal(evaluation.delivered, 1);
  assert.equal(evaluation.total, 7);
});

test('totals are counted per group and unmapped rows never count as delivered', () => {
  const rows = miniGrid([
    'A-1,M,operational base,Done,1,closed-completed',
    'A-2,M,operational base,Open,2,closed-completed',
    'B-1,N,commerce,Done,1,closed-completed',
    'B-2,N,commerce,Unmapped,,unmapped',
    'C-1,O,finalization,Unmapped,,unmapped',
  ]);
  const evaluation = evaluateGrid(
    rows,
    states({ 1: closed, 2: ['OPEN', null] }),
  );

  assert.deepEqual(evaluation.groups, [
    { group: 'operational base', delivered: 1, total: 2 },
    { group: 'commerce', delivered: 1, total: 2 },
    { group: 'finalization', delivered: 0, total: 1 },
  ]);
  assert.equal(evaluation.delivered, 2);
  assert.equal(evaluation.total, 5);
});

test('the report prints group totals, the overall score, and lists unmapped and pending rows separately', () => {
  const rows = miniGrid([
    'A-1,M,operational base,Done,1,closed-completed',
    'A-2,M,operational base,Still open work,2,closed-completed',
    'B-1,N,commerce,Waiting for the owner,,unmapped',
  ]);
  const report = formatReport(
    evaluateGrid(rows, states({ 1: closed, 2: ['OPEN', null] })),
    { generatedAt: new Date('2026-11-06T12:00:00Z') },
  );

  assert.match(report, /operational base\s+1\s+2/u);
  assert.match(report, /commerce\s+0\s+1/u);
  assert.match(report, /finalization\s+0\s+0/u);
  assert.match(report, /Overall\s+1\s+3\s+33\.3%/u);
  assert.match(report, /2026-11-06T12:00:00Z/u);

  const [, afterUnmapped] = report.split(/^Unmapped rows/mu);
  const [unmappedSection, pendingSection] =
    afterUnmapped.split(/^Pending rows/mu);
  assert.match(unmappedSection, /B-1\s+Waiting for the owner/u);
  assert.doesNotMatch(unmappedSection, /A-2/u);
  assert.match(pendingSection, /A-2\s+Still open work.*#2 open/u);
  assert.doesNotMatch(pendingSection, /B-1/u);
  assert.doesNotMatch(report, /A-1\s+Done/u);
});

test('main reads the grid, looks each issue up once and prints delivered/total', async () => {
  const lookups = [];
  const output = [];
  const exitCode = await main({
    argv: [],
    readGrid: async () =>
      [
        header,
        'A-1,M,commerce,First,10;11,closed-completed',
        'A-2,M,commerce,Second,11;12,closed-completed',
        'A-3,M,commerce,Third,,unmapped',
      ].join('\n'),
    lookupIssueStates: async (numbers) => {
      lookups.push(numbers);
      return states({ 10: closed, 11: closed, 12: ['OPEN', null] });
    },
    stdout: { write: (text) => output.push(text) },
    stderr: { write: (text) => assert.fail(`unexpected stderr: ${text}`) },
    now: () => new Date('2026-11-06T12:00:00Z'),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(lookups, [[10, 11, 12]]);
  assert.match(output.join(''), /Overall\s+1\s+3\s+33\.3%/u);
});

test('main fails with a clear message when the grid or the issue states cannot be read', async () => {
  const run = async (overrides) => {
    const errors = [];
    const exitCode = await main({
      argv: [],
      readGrid: async () =>
        `${header}\nA-1,M,commerce,First,10,closed-completed`,
      lookupIssueStates: async () => states({ 10: closed }),
      stdout: { write: () => {} },
      stderr: { write: (text) => errors.push(text) },
      ...overrides,
    });
    return { exitCode, errors: errors.join('') };
  };

  const badGrid = await run({ readGrid: async () => 'id,module\nA,B' });
  assert.equal(badGrid.exitCode, 1);
  assert.match(badGrid.errors, /header/u);

  const noGitHub = await run({
    lookupIssueStates: async () => {
      throw new Error('GitHub CLI (gh) was not found');
    },
  });
  assert.equal(noGitHub.exitCode, 1);
  assert.match(noGitHub.errors, /gh\) was not found/u);

  const unexpectedArgument = await run({ argv: ['--nope'] });
  assert.equal(unexpectedArgument.exitCode, 2);
  assert.match(unexpectedArgument.errors, /Usage:/u);
});

test('the gh lookup sends one GraphQL query and keeps only real issues', async () => {
  const calls = [];
  const result = await lookupIssueStatesWithGh([20, 42, 99], {
    repository: 'Owner/Name',
    execFile: async (file, args) => {
      calls.push({ file, args });
      return {
        stdout: JSON.stringify({
          data: {
            repository: {
              i20: {
                __typename: 'Issue',
                state: 'CLOSED',
                stateReason: 'COMPLETED',
              },
              i42: { __typename: 'PullRequest' },
              i99: null,
            },
          },
        }),
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, 'gh');
  assert.deepEqual(calls[0].args.slice(0, 3), ['api', 'graphql', '-f']);
  const query = calls[0].args[3];
  assert.match(query, /^query=/u);
  assert.match(query, /owner:"Owner"/u);
  assert.match(query, /name:"Name"/u);
  for (const number of [20, 42, 99]) {
    assert.match(
      query,
      new RegExp(`i${number}:issueOrPullRequest\\(number:${number}\\)`, 'u'),
    );
  }
  assert.deepEqual(
    [...result],
    [[20, { state: 'CLOSED', stateReason: 'COMPLETED' }]],
  );
});

test('the gh lookup keeps partial data when gh exits non-zero for a missing number', async () => {
  const result = await lookupIssueStatesWithGh([20, 99999], {
    repository: 'Owner/Name',
    execFile: async () => {
      throw Object.assign(new Error('gh exited with code 1'), {
        stdout: JSON.stringify({
          data: {
            repository: {
              i20: {
                __typename: 'Issue',
                state: 'OPEN',
                stateReason: null,
              },
              i99999: null,
            },
          },
          errors: [
            { message: 'Could not resolve to an issue or pull request' },
          ],
        }),
        stderr: 'gh: Could not resolve',
      });
    },
  });

  assert.deepEqual([...result], [[20, { state: 'OPEN', stateReason: null }]]);
});

test('the gh lookup explains a missing gh executable and an unreadable response', async () => {
  await assert.rejects(
    lookupIssueStatesWithGh([1], {
      execFile: async () => {
        throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
      },
    }),
    /GitHub CLI \(gh\) was not found.*GH_TOKEN/u,
  );
  await assert.rejects(
    lookupIssueStatesWithGh([1], {
      execFile: async () => {
        throw Object.assign(new Error('gh exited with code 4'), {
          stdout: '',
          stderr:
            'gh: To get started with GitHub CLI, please run: gh auth login',
        });
      },
    }),
    /gh auth login/u,
  );
});
