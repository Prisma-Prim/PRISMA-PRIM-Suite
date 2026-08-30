import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { publishHandoff } from './codex-cloud-publication.mjs';

function messageSha256(message) {
  return createHash('sha256').update(message, 'utf8').digest('hex');
}

function gitObjectSha(type, content) {
  return createHash('sha1')
    .update(Buffer.from(`${type} ${content.length}\0`))
    .update(content)
    .digest('hex');
}

function gitTreeSha(entries) {
  const content = Buffer.concat(
    entries.map(({ mode, path, sha }) =>
      Buffer.concat([
        Buffer.from(`${mode} ${path}\0`),
        Buffer.from(sha, 'hex'),
      ]),
    ),
  );
  return gitObjectSha('tree', content);
}

const addedContent = Buffer.from('added\n');
const deletedContent = Buffer.from('deleted\n');
const addedBlobSha = gitObjectSha('blob', addedContent);
const deletedBlobSha = gitObjectSha('blob', deletedContent);
const identities = {
  baseCommit: '1'.repeat(40),
  baseTree: gitTreeSha([
    { mode: '100644', path: 'deleted.txt', sha: deletedBlobSha },
  ]),
  sourceCommit: '3'.repeat(40),
  sourceTree: gitTreeSha([
    { mode: '100644', path: 'added.txt', sha: addedBlobSha },
  ]),
  blob: addedBlobSha,
  publishedCommit: '6'.repeat(40),
  movedCommit: '7'.repeat(40),
  movedTree: '8'.repeat(40),
};

const manifest = {
  format: 'prisma-prim-codex-handoff/v1',
  objectFormat: 'sha1',
  base: {
    commitSha: identities.baseCommit,
    treeSha: identities.baseTree,
  },
  source: {
    commitSha: identities.sourceCommit,
    treeSha: identities.sourceTree,
    commitMessage: 'feat(agent-dx): exact publication\n',
  },
  entries: [
    {
      path: 'added.txt',
      mode: '100644',
      type: 'blob',
      blobSha: identities.blob,
      contentBase64: addedContent.toString('base64'),
    },
    {
      path: 'deleted.txt',
      mode: '100644',
      type: 'blob',
      blobSha: deletedBlobSha,
      deleted: true,
    },
  ],
};

const target = {
  repositoryFullName: 'Prisma-Prim/PRISMA-PRIM-Suite',
  branchName: 'codex/issue-184',
  pullRequest: {
    baseBranch: 'main',
    title: 'Exact handoff',
    body: 'Closes #184',
  },
};
const expectedPullRequestIdentity = {
  headSha: identities.publishedCommit,
  headRef: target.branchName,
  headRepositoryFullName: target.repositoryFullName,
  baseSha: identities.baseCommit,
  baseRef: 'main',
  baseRepositoryFullName: target.repositoryFullName,
};
const expectedPullRequestOwnership = {
  headRef: target.branchName,
  headRepositoryFullName: target.repositoryFullName,
  baseRef: 'main',
  baseRepositoryFullName: target.repositoryFullName,
};

function boundMain() {
  return {
    commitSha: identities.baseCommit,
    treeSha: identities.baseTree,
  };
}

function movedMain() {
  return {
    commitSha: identities.movedCommit,
    treeSha: identities.movedTree,
  };
}

function createFakeConnector({ mainReads = [] } = {}) {
  const calls = [];
  const cleanupRequests = {
    abandonments: [],
    deletions: [],
    pullRequestAbandonments: [],
    pullRequestClosures: [],
  };
  const requests = {
    blobs: [],
    trees: [],
    commits: [],
    branches: [],
    pullRequests: [],
  };
  let readIndex = 0;
  const connector = {
    calls,
    cleanupRequests,
    requests,
    async readMain({ phase }) {
      calls.push(`readMain:${phase}`);
      const result = mainReads[readIndex] ?? boundMain();
      readIndex += 1;
      return result;
    },
    async createBlob(request) {
      const { path } = request;
      calls.push(`createBlob:${path}`);
      requests.blobs.push(request);
      return { sha: identities.blob };
    },
    async createTree(request) {
      calls.push('createTree');
      requests.trees.push(request);
      return { sha: identities.sourceTree };
    },
    async createCommit(request) {
      calls.push('createCommit');
      requests.commits.push(request);
      return { sha: identities.publishedCommit };
    },
    async createBranch(request) {
      calls.push('createBranch');
      requests.branches.push(request);
      return { headSha: identities.publishedCommit };
    },
    async createPullRequest(request) {
      calls.push('createPullRequest');
      requests.pullRequests.push(request);
      return { number: 187 };
    },
    async readCommit() {
      calls.push('readCommit');
      return {
        commitSha: identities.publishedCommit,
        treeSha: identities.sourceTree,
        parentShas: [identities.baseCommit],
        message: manifest.source.commitMessage.trimEnd(),
        rawMessageSha256: messageSha256(manifest.source.commitMessage),
      };
    },
    async readBranch() {
      calls.push('readBranch');
      return { headSha: identities.publishedCommit };
    },
    async readPullRequest() {
      calls.push('readPullRequest');
      return expectedPullRequestIdentity;
    },
    async closePullRequest(request) {
      calls.push('closePullRequest');
      cleanupRequests.pullRequestClosures.push(request);
      return { closed: true };
    },
    async abandonPullRequest(request) {
      calls.push('abandonPullRequest');
      cleanupRequests.pullRequestAbandonments.push(request);
    },
    async abandonBranch(request) {
      calls.push('abandonBranch');
      cleanupRequests.abandonments.push(request);
    },
  };
  return connector;
}

test('publishes only after repeated bound-main reads and verifies all identities', async () => {
  const connector = createFakeConnector();
  const result = await publishHandoff({ manifest, connector, target });

  assert.deepEqual(connector.calls, [
    'readMain:initial validation',
    'createBlob:added.txt',
    'createTree',
    'readMain:pre-commit validation',
    'createCommit',
    'readCommit',
    'readMain:pre-reference validation',
    'createBranch',
    'createPullRequest',
    'readCommit',
    'readBranch',
    'readPullRequest',
    'readMain:post-create validation',
  ]);
  assert.deepEqual(connector.requests, {
    blobs: [
      {
        path: 'added.txt',
        contentBase64: addedContent.toString('base64'),
        encoding: 'base64',
      },
    ],
    trees: [
      {
        baseTreeSha: identities.baseTree,
        entries: [
          {
            path: 'added.txt',
            mode: '100644',
            type: 'blob',
            sha: identities.blob,
          },
          { path: 'deleted.txt', sha: null },
        ],
      },
    ],
    commits: [
      {
        message: manifest.source.commitMessage,
        treeSha: identities.sourceTree,
        parentSha: identities.baseCommit,
      },
    ],
    branches: [{ name: target.branchName, sha: identities.publishedCommit }],
    pullRequests: [
      {
        branchName: target.branchName,
        baseBranch: 'main',
        title: target.pullRequest.title,
        body: target.pullRequest.body,
      },
    ],
  });
  assert.deepEqual(result, {
    baseCommitSha: identities.baseCommit,
    baseTreeSha: identities.baseTree,
    cloudSourceCommitSha: identities.sourceCommit,
    cloudSourceTreeSha: identities.sourceTree,
    cloudSourceMessageSha256: messageSha256(manifest.source.commitMessage),
    publishedCommitSha: identities.publishedCommit,
    publishedTreeSha: identities.sourceTree,
    publishedRawMessageSha256: messageSha256(manifest.source.commitMessage),
    branchHeadSha: identities.publishedCommit,
    pullRequestHeadSha: identities.publishedCommit,
    pullRequestNumber: 187,
    mainReads: [
      { phase: 'initial validation', ...boundMain() },
      { phase: 'pre-commit validation', ...boundMain() },
      { phase: 'pre-reference validation', ...boundMain() },
      { phase: 'post-create validation', ...boundMain() },
    ],
  });
});

test('aborts before commit or references when main moves after object creation', async () => {
  const connector = createFakeConnector({
    mainReads: [boundMain(), movedMain()],
  });
  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Target main moved during pre-commit validation/u,
  );
  assert.ok(connector.calls.includes('createTree'));
  assert.ok(!connector.calls.includes('createCommit'));
  assert.ok(!connector.calls.includes('createBranch'));
  assert.ok(!connector.calls.includes('createPullRequest'));
});

test('creates no tree, commit, or reference on a connector blob mismatch', async () => {
  const connector = createFakeConnector();
  connector.createBlob = async (request) => {
    connector.calls.push(`createBlob:${request.path}`);
    connector.requests.blobs.push(request);
    return { sha: 'a'.repeat(40) };
  };
  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /blob identity mismatch/u,
  );
  assert.ok(!connector.calls.includes('createTree'));
  assert.ok(!connector.calls.includes('createCommit'));
  assert.ok(!connector.calls.includes('createBranch'));
});

test('creates no commit or reference on a connector tree mismatch', async () => {
  const connector = createFakeConnector();
  connector.createTree = async (request) => {
    connector.calls.push('createTree');
    connector.requests.trees.push(request);
    return { sha: 'b'.repeat(40) };
  };
  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /tree identity differs/u,
  );
  assert.ok(!connector.calls.includes('createCommit'));
  assert.ok(!connector.calls.includes('createBranch'));
});

test('rejects a non-main pull request target even when its SHA could match', async () => {
  const connector = createFakeConnector();
  await assert.rejects(
    publishHandoff({
      manifest,
      connector,
      target: {
        ...target,
        pullRequest: { ...target.pullRequest, baseBranch: 'release' },
      },
    }),
    /must target main/u,
  );
  assert.deepEqual(connector.calls, []);
});

test('rejects main as the publication head before connector access', async () => {
  const connector = createFakeConnector();
  await assert.rejects(
    publishHandoff({
      manifest,
      connector,
      target: { ...target, branchName: 'main' },
    }),
    /head branch must differ/u,
  );
  assert.deepEqual(connector.calls, []);
});

test('leaves only an unreferenced commit when main moves before ref creation', async () => {
  const connector = createFakeConnector({
    mainReads: [boundMain(), boundMain(), movedMain()],
  });
  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Target main moved during pre-reference validation/u,
  );
  assert.ok(connector.calls.includes('createCommit'));
  assert.ok(!connector.calls.includes('createBranch'));
  assert.ok(!connector.calls.includes('createPullRequest'));
});

test('closes the PR and abandons the branch on a post-create race', async () => {
  const connector = createFakeConnector({
    mainReads: [boundMain(), boundMain(), boundMain(), movedMain()],
  });
  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Target main moved during post-create validation/u,
  );
  assert.ok(connector.calls.includes('createBranch'));
  assert.ok(connector.calls.includes('createPullRequest'));
  assert.deepEqual(connector.calls.slice(-2), [
    'closePullRequest',
    'abandonBranch',
  ]);
  assert.deepEqual(connector.cleanupRequests.abandonments, [
    {
      name: target.branchName,
      expectedHeadSha: identities.publishedCommit,
      reason: `Target main moved during post-create validation: expected ${identities.baseCommit}/${identities.baseTree}, received ${identities.movedCommit}/${identities.movedTree}.`,
    },
  ]);
  assert.deepEqual(connector.cleanupRequests.pullRequestClosures, [
    {
      number: 187,
      expectedIdentity: expectedPullRequestOwnership,
      reason: `Target main moved during post-create validation: expected ${identities.baseCommit}/${identities.baseTree}, received ${identities.movedCommit}/${identities.movedTree}.`,
    },
  ]);
});

test('reports incomplete cleanup when conditional PR closure cannot be proven', async () => {
  const connector = createFakeConnector({
    mainReads: [boundMain(), boundMain(), boundMain(), movedMain()],
  });
  const observedIdentity = {
    ...expectedPullRequestIdentity,
    headSha: identities.movedCommit,
  };
  connector.closePullRequest = async (request) => {
    connector.calls.push('closePullRequest');
    connector.cleanupRequests.pullRequestClosures.push(request);
    return { closed: false, observedIdentity };
  };

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Publication cleanup also failed .*Conditional pull request cleanup did not confirm closure/u,
  );
  assert.deepEqual(connector.cleanupRequests.pullRequestAbandonments, [
    {
      number: 187,
      expectedIdentity: expectedPullRequestOwnership,
      observedIdentity,
      reason: `Target main moved during post-create validation: expected ${identities.baseCommit}/${identities.baseTree}, received ${identities.movedCommit}/${identities.movedTree}.`,
    },
  ]);
});

test('closes the owned PR when only its mutable head SHA moved', async () => {
  const connector = createFakeConnector();
  connector.readPullRequest = async () => {
    connector.calls.push('readPullRequest');
    return {
      ...expectedPullRequestIdentity,
      headSha: identities.movedCommit,
    };
  };

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /pull request heads differ/u,
  );
  assert.ok(connector.calls.includes('closePullRequest'));
  assert.deepEqual(connector.cleanupRequests.pullRequestClosures, [
    {
      number: 187,
      expectedIdentity: expectedPullRequestOwnership,
      reason: 'Verified pull request heads differ from the bound publication.',
    },
  ]);
  assert.deepEqual(connector.cleanupRequests.pullRequestAbandonments, []);
});

test('never deletes a branch whose observed head moved concurrently', async () => {
  const connector = createFakeConnector();
  connector.readBranch = async () => {
    connector.calls.push('readBranch');
    return { headSha: identities.movedCommit };
  };
  connector.deleteBranch = async (request) => {
    connector.calls.push('deleteBranch');
    connector.cleanupRequests.deletions.push(request);
    return { deleted: true };
  };

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Verified branch head differs/u,
  );
  assert.ok(!connector.calls.includes('deleteBranch'));
  assert.deepEqual(connector.cleanupRequests.deletions, []);
  assert.deepEqual(connector.cleanupRequests.abandonments, [
    {
      name: target.branchName,
      expectedHeadSha: identities.publishedCommit,
      observedHeadSha: identities.movedCommit,
      reason: 'Verified branch head differs from the published commit.',
    },
  ]);
});

test('rejects a same-SHA pull request from the wrong head identity', async (t) => {
  for (const [name, readBack] of [
    [
      'wrong branch',
      {
        headRef: 'codex/unrelated',
        headRepositoryFullName: target.repositoryFullName,
      },
    ],
    [
      'wrong repository',
      {
        headRef: target.branchName,
        headRepositoryFullName: 'fork/PRISMA-PRIM-Suite',
      },
    ],
  ]) {
    await t.test(name, async () => {
      const connector = createFakeConnector();
      const observedPullRequestIdentity = {
        headSha: identities.publishedCommit,
        ...readBack,
        baseSha: identities.baseCommit,
        baseRef: 'main',
        baseRepositoryFullName: target.repositoryFullName,
      };
      connector.readPullRequest = async () => {
        connector.calls.push('readPullRequest');
        return observedPullRequestIdentity;
      };
      connector.deleteBranch = async (request) => {
        connector.calls.push('deleteBranch');
        connector.cleanupRequests.deletions.push(request);
        return {
          deleted: false,
          observedHeadSha: identities.movedCommit,
        };
      };

      await assert.rejects(
        publishHandoff({ manifest, connector, target }),
        /pull request heads differ/u,
      );
      assert.ok(!connector.calls.includes('closePullRequest'));
      assert.deepEqual(connector.cleanupRequests.pullRequestClosures, []);
      assert.deepEqual(connector.cleanupRequests.pullRequestAbandonments, [
        {
          number: 187,
          expectedIdentity: expectedPullRequestIdentity,
          observedIdentity: observedPullRequestIdentity,
          reason:
            'Verified pull request heads differ from the bound publication.',
        },
      ]);
      assert.deepEqual(connector.cleanupRequests.deletions, [
        {
          name: target.branchName,
          expectedHeadSha: identities.publishedCommit,
        },
      ]);
      assert.deepEqual(connector.cleanupRequests.abandonments, [
        {
          name: target.branchName,
          expectedHeadSha: identities.publishedCommit,
          observedHeadSha: identities.movedCommit,
          reason:
            'Verified pull request heads differ from the bound publication.',
        },
      ]);
    });
  }
});

test('creates no reference when the unreferenced commit differs from the manifest', async () => {
  const connector = createFakeConnector();
  connector.readCommit = async () => {
    connector.calls.push('readCommit');
    return {
      commitSha: identities.publishedCommit,
      treeSha: identities.sourceTree,
      parentShas: [identities.baseCommit],
      message: 'rewritten message',
      rawMessageSha256: messageSha256('rewritten message\n'),
    };
  };
  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /raw-message digest differs/u,
  );
  assert.ok(connector.calls.includes('createCommit'));
  assert.ok(!connector.calls.includes('createBranch'));
  assert.ok(!connector.calls.includes('createPullRequest'));
});
