import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  closingIssueNumber,
  governanceRevisionToken,
  stripHtmlComments,
  validatePullRequestBody,
  validatePullRequestGovernance,
} from './validate-pr-description.mjs';

async function readMarkdownTree(directoryUrl) {
  const contents = [];

  for (const entry of await readdir(directoryUrl, { withFileTypes: true })) {
    const entryUrl = new URL(
      `${entry.name}${entry.isDirectory() ? '/' : ''}`,
      directoryUrl,
    );

    if (entry.isDirectory()) {
      contents.push(...(await readMarkdownTree(entryUrl)));
    } else if (entry.name.endsWith('.md')) {
      contents.push(
        `${entryUrl.pathname}\n${await readFile(entryUrl, 'utf8')}`,
      );
    }
  }

  return contents;
}

const minimalMechanicalBody = `
## Outcome

Delivered the requested governance.

Closes #24

## Change classification

- Class: mechanical
- Product contract changed: no
- Preflight: exempt-low-risk
- Exemption reason: isolated wording correction with no contract change.

## Verification

All required checks passed.

## Review

Standards and Spec reviews completed.

## Agent environment retrospective

- Harness: Codex
- Environment: Linux
- OS/runtime: Linux, Node 24
- Avoidable environment or repository friction: none observed.
`;

function productContractBody() {
  return minimalMechanicalBody
    .replace('- Class: mechanical', '- Class: product-contract')
    .replace(
      '- Product contract changed: no',
      '- Product contract changed: yes',
    )
    .replace(
      '- Exemption reason:',
      '- Normative owner: docs/product/example-prd.md\n- Pre-code Spec review: approved\n- Exemption reason:',
    );
}

function highRiskImplementationBody() {
  return minimalMechanicalBody
    .replace('- Class: mechanical', '- Class: implementation')
    .replace('- Preflight: exempt-low-risk', '- Preflight: required')
    .replace(
      '- Exemption reason: isolated wording correction with no contract change.\n',
      '',
    )
    .replace(
      '- Product contract changed: no',
      '- Product contract changed: no\n- High-risk boundaries: privacy\n- Pre-code Spec review: approved',
    );
}

function lowRiskImplementationBody() {
  return minimalMechanicalBody.replace(
    '- Class: mechanical',
    '- Class: implementation',
  );
}

const defaultPullRequestStats = Object.freeze({
  baseSha: '1'.repeat(40),
  additions: 10,
  deletions: 2,
  commits: 1,
});

function validateGovernanceFixture(input) {
  return validatePullRequestGovernance({
    pullRequestStats: defaultPullRequestStats,
    ...input,
  });
}

test('accepts the minimal mechanical classification', () => {
  assert.deepEqual(validatePullRequestBody(minimalMechanicalBody), []);
});

test('does not accept declarations inside HTML code blocks', () => {
  for (const tag of ['pre', 'code']) {
    const body = `<${tag}>\n${minimalMechanicalBody}</${tag}>`;
    const errors = validatePullRequestBody(body).join('\n');
    assert.match(errors, /missing required heading/i);
    assert.equal(closingIssueNumber(body), null);
  }
});

test('does not accept declarations inside multiline Markdown code spans', () => {
  const body = `\`\n${minimalMechanicalBody}\``;
  assert.match(
    validatePullRequestBody(body).join('\n'),
    /missing required heading/i,
  );
  assert.equal(closingIssueNumber(body), null);
});

test('rejects additional GitHub issue-closing declarations', () => {
  for (const extra of ['Fixes #25', 'Resolved owner/repo#25', 'Closes #24']) {
    const body = `${minimalMechanicalBody}\n${extra}\n`;
    assert.equal(closingIssueNumber(body), null);
    assert.match(validatePullRequestBody(body).join('\n'), /Closes #24/);
  }
});

test('accepts conditional evidence for a product-contract change', () => {
  assert.deepEqual(validatePullRequestBody(productContractBody()), []);
});

test('requires owner and Spec approval when the product contract changes', () => {
  const body = productContractBody()
    .replace('- Normative owner: docs/product/example-prd.md\n', '')
    .replace('- Pre-code Spec review: approved\n', '');
  const errors = validatePullRequestBody(body).join('\n');

  assert.match(errors, /requires a normative owner/i);
  assert.match(errors, /requires an approved pre-code Spec review/i);
});

test('treats privacy as high risk and requires a full preflight', () => {
  assert.deepEqual(validatePullRequestBody(highRiskImplementationBody()), []);

  const errors = validatePullRequestBody(
    highRiskImplementationBody()
      .replace('- Preflight: required', '- Preflight: exempt-low-risk')
      .replace(
        '- Pre-code Spec review: approved',
        '- Pre-code Spec review: approved\n- Exemption reason: narrow privacy edit.',
      ),
  ).join('\n');
  assert.match(errors, /high-risk boundaries require.*required.*linked/i);
});

test('rejects missing, duplicate, and placeholder classification fields', () => {
  const body = minimalMechanicalBody
    .replace('- Product contract changed: no\n', '')
    .replace(
      '- Class: mechanical',
      '- Class: mechanical\n- Class: implementation',
    )
    .replace(
      '- Exemption reason: isolated wording correction with no contract change.',
      '- Exemption reason: TODO explain later',
    );
  const errors = validatePullRequestBody(body).join('\n');

  assert.match(errors, /exactly one Product contract changed field/);
  assert.match(errors, /exactly one Class field/);
  assert.match(errors, /Replace the placeholder Exemption reason/);
});

test('does not borrow a classification value from the next line', () => {
  const body = minimalMechanicalBody.replace(
    '- Exemption reason: isolated wording correction with no contract change.',
    '- Exemption reason:\n## Explanation\nText on another line.',
  );

  assert.match(
    validatePullRequestBody(body).join('\n'),
    /requires a concrete Exemption reason/i,
  );
});

test('rejects a product-contract class that denies a contract change', () => {
  const body = minimalMechanicalBody.replace(
    '- Class: mechanical',
    '- Class: product-contract',
  );
  assert.match(
    validatePullRequestBody(body).join('\n'),
    /product-contract.*Product contract changed.*yes/i,
  );
});

test('rejects conditional fields when they do not apply', () => {
  const body = minimalMechanicalBody.replace(
    '- Preflight: exempt-low-risk',
    '- Preflight: exempt-low-risk\n- High-risk boundaries: none\n- Normative owner: docs/product/example-prd.md\n- Pre-code Spec review: approved',
  );
  const errors = validatePullRequestBody(body).join('\n');

  assert.match(errors, /Remove High-risk boundaries when none apply/i);
  assert.match(
    errors,
    /Remove Normative owner when the product contract did not change/i,
  );
  assert.match(errors, /Remove Pre-code Spec review when it is not required/i);
});

test('requires the originating issue preflight to match the PR declaration', async () => {
  const issueBody = `<!-- complex-feature-preflight: exempt-low-risk -->
- Exemption reason: incorrectly exempted.
`;
  const errors = await validateGovernanceFixture({
    body: highRiskImplementationBody(),
    issueBody,
    repositoryRoot: new URL('..', import.meta.url),
  });

  assert.match(
    errors.join('\n'),
    /PR declares required.*issue declares exempt-low-risk/i,
  );
});

test('stops oversized implementations from claiming the low-risk exemption', async () => {
  const issueBody = `<!-- complex-feature-preflight: exempt-low-risk -->
- Exemption reason: isolated implementation with no high-risk boundary.
`;
  const body = lowRiskImplementationBody().replace(
    'isolated wording correction with no contract change.',
    'isolated implementation with no high-risk boundary.',
  );

  const atBudget = await validateGovernanceFixture({
    body,
    issueBody,
    pullRequestStats: {
      ...defaultPullRequestStats,
      additions: 900,
      deletions: 100,
    },
    repositoryRoot: new URL('..', import.meta.url),
  });
  const overBudget = await validateGovernanceFixture({
    body,
    issueBody,
    pullRequestStats: {
      ...defaultPullRequestStats,
      additions: 901,
      deletions: 100,
    },
    repositoryRoot: new URL('..', import.meta.url),
  });

  assert.doesNotMatch(atBudget.join('\n'), /low-risk implementation budget/i);
  assert.match(overBudget.join('\n'), /low-risk implementation budget/i);
  assert.match(overBudget.join('\n'), /reduce.*scope.*full preflight/i);
});

test('allows a large implementation only after full preflight', async () => {
  const errors = await validateGovernanceFixture({
    body: highRiskImplementationBody(),
    issueBody: `<!-- complex-feature-preflight: required -->
<!-- pre-code-spec-review: approved -->
### States and transitions
Defined.
### Actors and identities
Defined.
### Mutation contract
Defined.
### Data authority
Defined.
### Surfaces
Defined.
### Test matrix
Defined.
### Exclusions and unresolved decisions
Defined.
`,
    pullRequestStats: {
      ...defaultPullRequestStats,
      additions: 4_000,
      deletions: 500,
    },
    repositoryRoot: new URL('..', import.meta.url),
  });

  assert.doesNotMatch(errors.join('\n'), /low-risk implementation budget/i);
});

test('rejects stacked correction commits beyond the two-commit budget', async () => {
  const issueBody = `<!-- complex-feature-preflight: exempt-low-risk -->
- Exemption reason: isolated wording correction with no contract change.
`;

  const atBudget = await validateGovernanceFixture({
    body: minimalMechanicalBody,
    issueBody,
    pullRequestStats: { ...defaultPullRequestStats, commits: 2 },
    repositoryRoot: new URL('..', import.meta.url),
  });
  const overBudget = await validateGovernanceFixture({
    body: minimalMechanicalBody,
    issueBody,
    pullRequestStats: { ...defaultPullRequestStats, commits: 3 },
    repositoryRoot: new URL('..', import.meta.url),
  });

  assert.doesNotMatch(atBudget.join('\n'), /commit budget/i);
  assert.match(overBudget.join('\n'), /commit budget/i);
  assert.match(overBudget.join('\n'), /replace or squash/i);
});

test('fails closed when authoritative pull request stats are unavailable', async () => {
  const issueBody = `<!-- complex-feature-preflight: exempt-low-risk -->
- Exemption reason: isolated wording correction with no contract change.
`;

  for (const pullRequestStats of [
    undefined,
    { ...defaultPullRequestStats, baseSha: undefined },
    { ...defaultPullRequestStats, additions: '10' },
    { ...defaultPullRequestStats, deletions: -1 },
    { ...defaultPullRequestStats, commits: 0 },
  ]) {
    const errors = await validatePullRequestGovernance({
      body: minimalMechanicalBody,
      issueBody,
      pullRequestStats,
      repositoryRoot: new URL('..', import.meta.url),
    });

    assert.match(errors.join('\n'), /authoritative pull request stats/i);
  }
});

test('compares linked paths with repository case sensitivity', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pr-governance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'Docs'));
  await writeFile(
    join(root, 'Docs/Preflight.md'),
    `<!-- pre-code-spec-review: approved -->
### States and transitions
Defined.
### Actors and identities
Defined.
### Mutation contract
Defined.
### Data authority
Defined.
### Surfaces
Defined.
### Test matrix
Defined.
### Exclusions and unresolved decisions
Defined.
`,
  );
  const body = highRiskImplementationBody().replace(
    '- Preflight: required',
    '- Preflight: linked docs/preflight.md',
  );
  const issueBody =
    '<!-- complex-feature-preflight: linked Docs/Preflight.md -->\n';

  assert.match(
    (
      await validateGovernanceFixture({
        body,
        issueBody,
        repositoryRoot: root,
      })
    ).join('\n'),
    /PR declares linked docs\/preflight\.md.*issue declares linked Docs\/Preflight\.md/,
  );
});

test('requires an exact issue-side Spec marker when the contract changes', async () => {
  const exemption = `<!-- complex-feature-preflight: exempt-low-risk -->
- Exemption reason: narrow contract clarification with no high-risk boundary.
`;

  assert.match(
    (
      await validateGovernanceFixture({
        body: productContractBody(),
        issueBody: `${exemption}\n## Spec review result\n- Result: approved before code\n`,
        repositoryRoot: new URL('..', import.meta.url),
      })
    ).join('\n'),
    /exactly one pre-code Spec review marker/i,
  );

  assert.deepEqual(
    await validateGovernanceFixture({
      body: productContractBody(),
      issueBody: `${exemption}\n<!-- pre-code-spec-review: approved -->\n`,
      repositoryRoot: new URL('..', import.meta.url),
    }),
    [],
  );
});

test('keeps a mechanical exemption reason-only issue valid', async () => {
  assert.deepEqual(
    await validateGovernanceFixture({
      body: minimalMechanicalBody,
      issueBody: `<!-- complex-feature-preflight: exempt-low-risk -->
- Exemption reason: isolated wording correction with no contract change.
`,
      repositoryRoot: new URL('..', import.meta.url),
    }),
    [],
  );
});

test('rejects a pull request as the originating issue', async () => {
  const errors = await validateGovernanceFixture({
    body: minimalMechanicalBody,
    issueBody: `<!-- complex-feature-preflight: exempt-low-risk -->
- Exemption reason: copied into a pull request body.
`,
    issueIsPullRequest: true,
    repositoryRoot: new URL('..', import.meta.url),
  });

  assert.match(
    errors.join('\n'),
    /must reference a GitHub issue, not a pull request/i,
  );
});

test('binds fresh governance results to the exact PR and issue revision', () => {
  const revision = {
    pullRequestNumber: 24,
    headSha: 'abc123',
    pullRequestBody: minimalMechanicalBody,
    issueNumber: 24,
    issueBody: '<!-- complex-feature-preflight: exempt-low-risk -->',
    pullRequestStats: defaultPullRequestStats,
  };
  const token = governanceRevisionToken(revision);

  assert.equal(token, governanceRevisionToken({ ...revision }));
  for (const changed of [
    { headSha: 'def456' },
    { pullRequestBody: `${minimalMechanicalBody}\nEdited.` },
    { issueBody: `${revision.issueBody}\nEdited.` },
    {
      pullRequestStats: {
        ...defaultPullRequestStats,
        baseSha: '2'.repeat(40),
      },
    },
    {
      pullRequestStats: {
        ...defaultPullRequestStats,
        additions: defaultPullRequestStats.additions + 1,
      },
    },
    {
      pullRequestStats: {
        ...defaultPullRequestStats,
        commits: defaultPullRequestStats.commits + 1,
      },
    },
  ]) {
    assert.notEqual(
      token,
      governanceRevisionToken({ ...revision, ...changed }),
    );
  }
});

test('accepts a structured friction row', () => {
  const frictionBody = minimalMechanicalBody.replace(
    '- Avoidable environment or repository friction: none observed.',
    '| Runtime | Node 22 failed | Image drift | Confirmed | mise | Pin Node 24 | Fixed externally |',
  );
  assert.deepEqual(validatePullRequestBody(frictionBody), []);
});

test('accepts the template no-friction row', () => {
  const body = minimalMechanicalBody.replace(
    '- Avoidable environment or repository friction: none observed.',
    '| None | No avoidable environment or repository friction observed. | N/A | Confirmed | N/A | None | Fixed in PR |',
  );

  assert.deepEqual(validatePullRequestBody(body), []);
});

test('ignores headings hidden in HTML comments', () => {
  const body = minimalMechanicalBody.replace('## Review', '<!-- ## Review -->');
  assert.match(
    validatePullRequestBody(body).join('\n'),
    /Missing required heading: ## Review/,
  );
});

test('treats an unterminated PR HTML comment as hidden through EOF', () => {
  const body = minimalMechanicalBody.replace(
    'Delivered the requested governance.',
    'Delivered the requested governance.\n<!--',
  );
  const errors = validatePullRequestBody(body).join('\n');

  assert.match(errors, /exactly one Class field/);
  assert.match(errors, /Closes #24/);
  assert.equal(closingIssueNumber(body), null);
});

test('ignores fenced code examples when parsing PR declarations', () => {
  const body = `${minimalMechanicalBody}
\`\`\`markdown
Closes #999
- Class: implementation
- Product contract changed: yes
- Preflight: required
\`\`\`
`;

  assert.deepEqual(validatePullRequestBody(body), []);
  assert.equal(closingIssueNumber(body), 24);
});

test('does not accept declarations that exist only in fenced code examples', () => {
  const body = minimalMechanicalBody
    .replace('Closes #24', '')
    .replace('- Class: mechanical\n', '')
    .replace('- Product contract changed: no\n', '')
    .replace('- Preflight: exempt-low-risk\n', '').concat(`
\`\`\`markdown
Closes #999
- Class: mechanical
- Product contract changed: no
- Preflight: exempt-low-risk
\`\`\`
`);
  const errors = validatePullRequestBody(body).join('\n');

  assert.match(errors, /exactly one Class field/);
  assert.match(errors, /exactly one Product contract changed field/);
  assert.match(errors, /exactly one Preflight field/);
  assert.match(errors, /Closes #24/);
  assert.equal(closingIssueNumber(body), null);
});

test('ignores indented code examples when parsing PR declarations', () => {
  const body = `${minimalMechanicalBody}
    Closes #999
    - Class: implementation
    - Product contract changed: yes
    - Preflight: required
`;

  assert.deepEqual(validatePullRequestBody(body), []);
  assert.equal(closingIssueNumber(body), 24);
});

test('rejects empty issue and retrospective placeholders', () => {
  const body = minimalMechanicalBody
    .replace('Closes #24', 'Closes #')
    .replace('- Harness: Codex', '- Harness:');
  const errors = validatePullRequestBody(body).join('\n');

  assert.match(errors, /Closes #24/);
  assert.match(errors, /Harness/);
});

test('strips multiline HTML comments', () => {
  assert.equal(
    stripHtmlComments('before<!-- hidden\ntext -->after'),
    'beforeafter',
  );
});

test('makes PR governance blocking and validates the originating issue', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/agent-governance.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /issues: read/);
  assert.match(workflow, /validatePullRequestGovernance/);
  assert.doesNotMatch(workflow, /--advisory/);
});

test('revalidates affected PR heads when an issue body changes', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/agent-governance.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /issues:\s*\n\s*types: \[edited\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(
    workflow,
    /pull_request_target:\s*\n\s*types: \[opened, edited, synchronize, reopened, closed\]/,
  );
  assert.doesNotMatch(workflow, /^ {2}pull_request:/m);
  assert.match(workflow, /refresh-after-shared-head-change:/);
  assert.match(workflow, /context\.payload\.before/);
  assert.match(workflow, /mark-pr-governance-pending:/);
  assert.match(workflow, /needs: mark-pr-governance-pending/);
  assert.match(workflow, /Validating pull request governance declarations\./);
  assert.match(workflow, /Ignored a stale pull request event\./);
  assert.match(workflow, /createWorkflowDispatch/);
  assert.match(workflow, /createCommitStatus/);
  assert.match(workflow, /revision_token:/);
  assert.match(workflow, /governanceRevisionToken/);
  assert.match(workflow, /path: trusted/);
  assert.match(workflow, /path: candidate/);
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/,
  );
  assert.match(workflow, /repositoryRoot: candidateRoot/);
  assert.match(workflow, /pullRequestStats:/);
  assert.match(workflow, /pullRequestGovernanceStats/);
  assert.ok(
    [
      ...workflow.matchAll(
        /pullRequestStats:\s*pullRequestGovernanceStats\(pullRequest\)/gu,
      ),
    ].length >= 4,
  );
  assert.doesNotMatch(workflow, /Test candidate governance validators/);
  assert.match(workflow, /!process\.env\.VALIDATED_REVISION_TOKEN/);
  assert.match(workflow, /const requestedHeadSha =/);
  assert.match(workflow, /before\.pullRequest\.head\.sha !== requestedHeadSha/);
  assert.match(workflow, /requestedPullRequestBody/);
  assert.match(workflow, /Ignored a stale reporter for an edited PR body\./);
  assert.match(workflow, /<closing-issue-unavailable>/);
  assert.match(
    workflow,
    /context\.payload\.inputs\?\.revision_token[\s\S]*core\.setOutput\('revision-token'/,
  );
  assert.match(workflow, /issueLookupFailed/);
  assert.match(workflow, /Closing issue could not be loaded\./);
  assert.match(workflow, /sharedHeadPullRequests/);
  assert.match(workflow, /must not share one head commit/i);
  assert.match(
    workflow,
    /sharedHeadPullRequests\.length === 0[\s\S]*Skipped a stale open-PR snapshot[\s\S]*continue;/,
  );
  assert.match(workflow, /refs\/pull\/\{0\}\/head/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /reRunWorkflow/);
  assert.match(workflow, /pull-requests: read/);

  const globalPermissions = workflow.split('jobs:')[0];
  const refreshJob = workflow
    .split('refresh-after-issue-edit:')[1]
    .split('  pr-description:')[0];
  const prJob = workflow
    .split('  pr-description:')[1]
    .split('  report-governance-result:')[0];
  const reportJob = workflow.split('  report-governance-result:')[1];
  assert.doesNotMatch(globalPermissions, /actions: write/);
  assert.match(refreshJob, /actions: write/);
  assert.match(refreshJob, /statuses: write/);
  assert.doesNotMatch(prJob, /actions: write/);
  assert.doesNotMatch(prJob, /statuses: write/);
  assert.match(prJob, /trustedRoot = path\.join/);
  assert.doesNotMatch(prJob, /trustedRoot = dispatched/);
  assert.match(reportJob, /statuses: write/);
  assert.match(reportJob, /Check out trusted default branch/);
  assert.match(reportJob, /revision_token/);
});

test('keeps only common mandatory fields visible in the PR template', async () => {
  const template = await readFile(
    new URL('../.github/pull_request_template.md', import.meta.url),
    'utf8',
  );

  assert.match(template, /- Class:/);
  assert.match(template, /- Product contract changed:/);
  assert.match(template, /- Preflight:/);
  assert.doesNotMatch(template, /Review iterations after first publication/);
  assert.doesNotMatch(template, /not-applicable/);
});

test('makes the low-risk fast path the default PR process', async () => {
  const [
    agents,
    execution,
    preflight,
    retrospective,
    terminalGate,
    knowledge,
    ticketing,
    template,
  ] = await Promise.all([
    readFile(new URL('../AGENTS.md', import.meta.url), 'utf8'),
    readFile(
      new URL('../docs/agents/issue-execution.md', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../docs/agents/complex-feature-preflight.md', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL(
        '../docs/agents/agent-environment-retrospective.md',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL('../docs/agents/codex-terminal-review-gate.md', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../docs/agents/repository-knowledge-system.md', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL(
        '../docs/product/specification-and-ticketing-standard.md',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL('../.github/pull_request_template.md', import.meta.url),
      'utf8',
    ),
  ]);

  assert.match(agents, /low-risk fast path/i);
  assert.match(agents, /docs\/agents\/issue-execution\.md/);
  assert.match(agents, /candidate and review circuit breakers/i);
  assert.doesNotMatch(agents, /1,000 base-to-head changed lines/i);
  assert.doesNotMatch(agents, /second distinct Codex-reviewed head exhaust/i);

  assert.match(execution, /low-risk fast path/i);
  assert.match(execution, /P0 and P1.*blocking/is);
  assert.match(
    execution,
    /P2 blocks only.*acceptance criteria.*security.*correctness/is,
  );
  assert.match(execution, /one final review pass/i);
  assert.match(execution, /one focused commit/i);
  assert.match(execution, /15-minute execution target/i);
  assert.match(execution, /1,000 base-to-head additions plus deletions/i);
  assert.match(execution, /retry it at most once against the identical head/i);
  assert.match(execution, /Expected skips.*reported.*not promoted/is);
  assert.match(
    execution,
    /every nonblocking finding.*record the deferred disposition.*resolve.*review thread.*terminal-gate re-evaluation/is,
  );
  assert.match(execution, /do not request another Codex review/i);
  assert.match(execution, /exact-head terminal review once/i);
  assert.match(
    execution,
    /Merge immediately.*CI.*governance.*terminal review.*green/is,
  );
  assert.match(
    execution,
    /Every PR that is not eligible.*full verification.*This includes product-contract changes.*every implementation change/is,
  );

  assert.match(
    preflight,
    /low-risk fast path.*blocking findings.*defers all nonblocking feedback/is,
  );
  assert.match(preflight, /full path.*all material findings/is);
  assert.match(preflight, /candidate and review circuit breakers/i);
  assert.doesNotMatch(
    preflight,
    /over 1,000 base-to-head additions plus deletions/i,
  );
  assert.match(retrospective, /compact block is the complete required format/i);
  assert.match(
    retrospective,
    /required check that could not run is reportable friction/i,
  );
  assert.match(retrospective, /do not add a `none` placeholder/i);
  assert.match(
    terminalGate,
    /every nonblocking finding.*deferred and resolved.*without\s+requesting another Codex review/is,
  );
  assert.match(
    terminalGate,
    /Two distinct finding heads trip the circuit breaker/i,
  );
  assert.match(template, /candidate and review circuit breakers/i);
  assert.doesNotMatch(template, /1,000 changed lines/i);
  assert.doesNotMatch(template, /one grouped correction/i);
  assert.match(
    knowledge,
    /one combined Standards.*originating-issue pass.*low-risk documentation.*separate full-path reviews/is,
  );
  assert.match(
    ticketing,
    /one combined final pass.*low-risk work.*separate Standards and Spec reviews.*full path/is,
  );

  const processMarkdown = [
    agents,
    ...(await readMarkdownTree(new URL('../docs/', import.meta.url))),
  ].join('\n');

  assert.doesNotMatch(processMarkdown, /defer other P2 feedback/i);
  assert.doesNotMatch(
    processMarkdown,
    /Review the actual finished diff twice/i,
  );
  assert.doesNotMatch(
    processMarkdown,
    /reviews? the final diff first against repository Standards and then against its originating issue/i,
  );
  assert.doesNotMatch(
    processMarkdown,
    /Standards review followed by Spec review/i,
  );
  assert.doesNotMatch(processMarkdown, /Review Standards, then Product/i);
  assert.doesNotMatch(
    processMarkdown,
    /First review the document against this standard.*Then review it against the business problem/is,
  );
  assert.doesNotMatch(processMarkdown, /revizuire Standards,\s*apoi Spec/i);
  assert.match(
    processMarkdown,
    /Fiecare issue.*traseul de revizuire selectat.*issue-execution/is,
  );

  assert.doesNotMatch(template, /## Scope and decisions/);
  assert.doesNotMatch(template, /## Browser evidence/);
  assert.doesNotMatch(template, /\| Check\s+\| Result/);
  assert.doesNotMatch(template, /### Checks not run/);
  assert.match(template, /- Evidence:/);
  assert.match(template, /- Blocking feedback:/);
  assert.match(template, /Full path: record both conclusions/);
  assert.match(
    template,
    /full friction-case format in docs\/agents\/agent-environment-retrospective\.md/i,
  );
  assert.match(template, /none observed/i);
});
