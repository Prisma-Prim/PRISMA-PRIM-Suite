import assert from 'node:assert/strict';
import test from 'node:test';

import { publishHandoff } from './codex-cloud-publication.mjs';
import {
  addedContent,
  boundMain,
  createFakeConnector,
  expectedPullRequestIdentity,
  expectedPullRequestOwnership,
  identities,
  manifest,
  messageSha256,
  movedMain,
  mutationError,
  rejectBranchCreation,
  rejectPullRequestCreation,
  returnPullRequestLookup,
  target,
} from './codex-cloud-publication.test-fixtures.mjs';

test('publishes only after repeated bound-main reads and verifies all identities', async () => {
  const connector = createFakeConnector();
  const result = await publishHandoff({ manifest, connector, target });

  assert.equal(
    connector.calls.join('|'),
    'readMain:initial validation|createBlob:added.txt|createTree|readMain:pre-commit validation|createCommit|readCommit|readMain:pre-reference validation|readBranch|createBranch|createPullRequest|readCommit|readBranch|readPullRequest|readMain:post-create validation',
  );
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
    pullRequestIdentity: expectedPullRequestIdentity,
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

test('never deletes a same-SHA branch after an ambiguous create failure', async () => {
  const connector = createFakeConnector({
    branchReads: [{ exists: false }, { headSha: identities.publishedCommit }],
  });
  rejectBranchCreation(connector);

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Publication cleanup also failed .*ambiguous branch exists without attempt-specific ownership proof/u,
  );
  assert.deepEqual(connector.calls.slice(-3), [
    'createBranch',
    'readBranch',
    'abandonBranch',
  ]);
  assert.deepEqual(connector.cleanupRequests.abandonments, [
    {
      name: target.branchName,
      expectedHeadSha: identities.publishedCommit,
      observedHeadSha: identities.publishedCommit,
      reason: 'create branch response timed out',
    },
  ]);
  assert.deepEqual(connector.cleanupRequests.deletions, []);
});

test('abandons a mismatched branch after an ambiguous create failure', async () => {
  const connector = createFakeConnector({
    branchReads: [{ exists: false }, { headSha: identities.movedCommit }],
  });
  rejectBranchCreation(connector);

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Publication cleanup also failed .*ambiguous branch exists without attempt-specific ownership proof/u,
  );
  assert.ok(!connector.calls.includes('deleteBranch'));
  assert.deepEqual(connector.cleanupRequests.abandonments, [
    {
      name: target.branchName,
      expectedHeadSha: identities.publishedCommit,
      observedHeadSha: identities.movedCommit,
      reason: 'create branch response timed out',
    },
  ]);
});

test('accepts only an explicit absent-branch result after an ambiguous create failure', async () => {
  const connector = createFakeConnector({
    branchReads: [{ exists: false }, { exists: false }],
  });
  rejectBranchCreation(connector);

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /create branch response timed out/u,
  );
  assert.deepEqual(connector.calls.slice(-3), [
    'readBranch',
    'createBranch',
    'readBranch',
  ]);
  assert.deepEqual(connector.cleanupRequests.abandonments, []);
});

test('blocks when an ambiguous branch creation cannot be reconciled', async () => {
  const connector = createFakeConnector();
  rejectBranchCreation(connector);
  let branchReads = 0;
  connector.readBranch = async () => {
    connector.calls.push('readBranch');
    branchReads += 1;
    if (branchReads === 1) return { exists: false };
    throw new Error('branch probe unavailable');
  };

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Publication cleanup also failed \(reconcile ambiguous branch creation: branch probe unavailable\); do not merge/u,
  );
});

test('rejects a pre-existing same-SHA branch before create without deleting it', async () => {
  const connector = createFakeConnector({
    branchReads: [{ headSha: identities.publishedCommit }],
  });

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Publication branch already exists before create/u,
  );
  assert.ok(!connector.calls.includes('createBranch'));
  assert.ok(!connector.calls.includes('deleteBranch'));
});

test('rejects malformed or contradictory absent-branch probes', async (t) => {
  for (const [name, branchRead, expected] of [
    [
      'contradictory head',
      { exists: false, headSha: identities.publishedCommit },
      /contradictory branch presence/u,
    ],
    ['non-boolean state', { exists: 'false' }, /malformed branch presence/u],
  ]) {
    await t.test(name, async () => {
      const connector = createFakeConnector({ branchReads: [branchRead] });
      await assert.rejects(
        publishHandoff({ manifest, connector, target }),
        expected,
      );
      assert.ok(!connector.calls.includes('createBranch'));
    });
  }
});

test('never deletes a branch after a definitive create rejection', async () => {
  const connector = createFakeConnector({
    branchReads: [{ exists: false }, { headSha: identities.publishedCommit }],
  });
  connector.createBranch = async () => {
    connector.calls.push('createBranch');
    throw mutationError('422 Reference already exists', 'not-created');
  };

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /422 Reference already exists/u,
  );
  assert.ok(!connector.calls.includes('deleteBranch'));
});

test('blocks an unclassified create failure without deleting a branch', async () => {
  const connector = createFakeConnector();
  connector.createBranch = async () => {
    connector.calls.push('createBranch');
    throw new Error('connector failed without mutation outcome');
  };

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Publication cleanup also failed \(classify ambiguous branch creation: connector failure omitted mutationOutcome\); do not merge/u,
  );
  assert.ok(!connector.calls.includes('deleteBranch'));
});

test('preserves a branch after a malformed successful create response', async () => {
  const connector = createFakeConnector({
    branchReads: [{ exists: false }, { headSha: identities.publishedCommit }],
  });
  connector.createBranch = async () => {
    connector.calls.push('createBranch');
    return {};
  };

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Publication cleanup also failed .*ambiguous branch exists without attempt-specific ownership proof/u,
  );
  assert.deepEqual(connector.calls.slice(-3), [
    'createBranch',
    'readBranch',
    'abandonBranch',
  ]);
  assert.deepEqual(connector.cleanupRequests.deletions, []);
});

test('abandons a mismatched successful branch response after reconciliation', async () => {
  const connector = createFakeConnector({
    branchReads: [{ exists: false }, { headSha: identities.movedCommit }],
  });
  connector.createBranch = async () => {
    connector.calls.push('createBranch');
    return { headSha: identities.movedCommit };
  };

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Created branch does not point to the published commit/u,
  );
  assert.ok(!connector.calls.includes('deleteBranch'));
  assert.deepEqual(connector.cleanupRequests.abandonments, [
    {
      name: target.branchName,
      expectedHeadSha: identities.publishedCommit,
      observedHeadSha: identities.movedCommit,
      reason: 'Created branch does not point to the published commit.',
    },
  ]);
});

test('blocks unconfirmed expected-head branch cleanup results', async (t) => {
  for (const [name, deletion, expected] of [
    [
      'expected head remains',
      { deleted: false, observedHeadSha: identities.publishedCommit },
      /Conditional branch cleanup did not confirm deletion/u,
    ],
    [
      'no authoritative state',
      { deleted: false },
      /neither deletion, absence, nor a valid mismatched head/u,
    ],
    [
      'deleted branch still exists',
      { deleted: true, exists: true },
      /contradictory branch deletion result/u,
    ],
    [
      'absent branch still has a head',
      { exists: false, observedHeadSha: identities.movedCommit },
      /contradictory branch deletion result/u,
    ],
  ]) {
    await t.test(name, async () => {
      const connector = createFakeConnector();
      connector.createPullRequest = async () => {
        connector.calls.push('createPullRequest');
        throw mutationError('PR rejected', 'not-created');
      };
      connector.deleteBranch = async (request) => {
        connector.calls.push('deleteBranch');
        connector.cleanupRequests.deletions.push(request);
        return deletion;
      };
      await assert.rejects(
        publishHandoff({ manifest, connector, target }),
        expected,
      );
    });
  }
});

test('never closes an endpoint-matching PR after ambiguous creation', async () => {
  const connector = createFakeConnector();
  rejectPullRequestCreation(connector);
  returnPullRequestLookup(connector, {
    found: true,
    number: 187,
    identity: expectedPullRequestIdentity,
  });
  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Publication cleanup also failed .*ambiguous pull request exists without attempt-specific ownership proof/u,
  );
  assert.deepEqual(connector.calls.slice(-4), [
    'createPullRequest',
    'findPullRequest',
    'abandonPullRequest',
    'abandonBranch',
  ]);
  assert.deepEqual(connector.cleanupRequests.pullRequestAbandonments, [
    {
      number: 187,
      expectedIdentity: expectedPullRequestIdentity,
      observedIdentity: expectedPullRequestIdentity,
      reason: 'create pull request response timed out',
    },
  ]);
  assert.deepEqual(connector.cleanupRequests.pullRequestClosures, []);
  assert.deepEqual(connector.lookupRequests, [
    { expectedOwnership: expectedPullRequestOwnership },
  ]);
});

test('never closes a mismatched PR after an ambiguous create failure', async () => {
  const connector = createFakeConnector();
  rejectPullRequestCreation(connector);
  const observedIdentity = {
    ...expectedPullRequestIdentity,
    headRepositoryFullName: 'fork/PRISMA-PRIM-Suite',
  };
  returnPullRequestLookup(connector, {
    found: true,
    number: 187,
    identity: observedIdentity,
  });
  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Publication cleanup also failed .*ambiguous pull request exists without attempt-specific ownership proof/u,
  );
  assert.ok(!connector.calls.includes('closePullRequest'));
  assert.ok(!connector.calls.includes('deleteBranch'));
  assert.deepEqual(connector.cleanupRequests.pullRequestAbandonments, [
    {
      number: 187,
      expectedIdentity: expectedPullRequestIdentity,
      observedIdentity,
      reason: 'create pull request response timed out',
    },
  ]);
});

test('accepts only an explicit absent-PR result after an ambiguous create failure', async () => {
  const connector = createFakeConnector();
  rejectPullRequestCreation(connector);
  returnPullRequestLookup(connector, { found: false });
  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /create pull request response timed out/u,
  );
  assert.deepEqual(connector.calls.slice(-3), [
    'createPullRequest',
    'findPullRequest',
    'deleteBranch',
  ]);
  assert.deepEqual(connector.cleanupRequests.pullRequestClosures, []);
  assert.deepEqual(connector.cleanupRequests.pullRequestAbandonments, []);
});

test('blocks when an ambiguous PR creation cannot be reconciled', async () => {
  const connector = createFakeConnector();
  rejectPullRequestCreation(connector);
  connector.findPullRequest = async () => {
    connector.calls.push('findPullRequest');
    throw new Error('pull request lookup unavailable');
  };
  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Publication cleanup also failed \(reconcile ambiguous pull request creation: pull request lookup unavailable\); do not merge/u,
  );
});

test('preserves a looked-up PR after a non-positive create response', async () => {
  const connector = createFakeConnector();
  connector.createPullRequest = async () => {
    connector.calls.push('createPullRequest');
    return { number: 0 };
  };
  returnPullRequestLookup(connector, {
    found: true,
    number: 187,
    identity: expectedPullRequestIdentity,
  });

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Publication cleanup also failed .*ambiguous pull request exists without attempt-specific ownership proof/u,
  );
  assert.deepEqual(connector.cleanupRequests.pullRequestAbandonments, [
    {
      number: 187,
      expectedIdentity: expectedPullRequestIdentity,
      observedIdentity: expectedPullRequestIdentity,
      reason: 'Connector returned an invalid pull request number.',
    },
  ]);
  assert.deepEqual(connector.cleanupRequests.pullRequestClosures, []);
});

test('preserves references after a wrong positive create response', async () => {
  const connector = createFakeConnector();
  const unrelatedIdentity = {
    ...expectedPullRequestIdentity,
    headRef: 'codex/unrelated',
  };
  connector.createPullRequest = async () => {
    connector.calls.push('createPullRequest');
    return { number: 999 };
  };
  connector.readPullRequest = async ({ number }) => {
    connector.calls.push('readPullRequest');
    assert.equal(number, 999);
    return unrelatedIdentity;
  };
  returnPullRequestLookup(connector, {
    found: true,
    number: 187,
    identity: expectedPullRequestIdentity,
  });

  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /pull request heads differ/u,
  );
  assert.deepEqual(connector.cleanupRequests.pullRequestAbandonments, [
    {
      number: 999,
      expectedIdentity: expectedPullRequestIdentity,
      observedIdentity: unrelatedIdentity,
      reason: 'Verified pull request heads differ from the bound publication.',
    },
  ]);
  assert.deepEqual(connector.cleanupRequests.pullRequestClosures, []);
  assert.deepEqual(connector.lookupRequests, []);
  assert.deepEqual(connector.cleanupRequests.deletions, []);
});

test('blocks malformed PR reconciliation results', async (t) => {
  for (const [name, reconciliation, expected] of [
    [
      'partial identity',
      { found: true, number: 187, identity: expectedPullRequestOwnership },
      /Reconciled pull request head SHA must be a Git object ID/u,
    ],
    [
      'non-positive number',
      { found: true, number: -1, identity: expectedPullRequestIdentity },
      /reconciliation returned an invalid result/u,
    ],
    [
      'negative result with positive evidence',
      { found: false, number: 187 },
      /contradictory negative pull request/u,
    ],
    [
      'negative result with identity evidence',
      { found: false, identity: expectedPullRequestIdentity },
      /contradictory negative pull request/u,
    ],
  ]) {
    await t.test(name, async () => {
      const connector = createFakeConnector();
      rejectPullRequestCreation(connector);
      returnPullRequestLookup(connector, reconciliation);
      await assert.rejects(
        publishHandoff({ manifest, connector, target }),
        expected,
      );
      assert.ok(!connector.calls.includes('closePullRequest'));
      assert.ok(!connector.calls.includes('deleteBranch'));
    });
  }
});

test('closes the PR and conditionally deletes the branch on a post-create race', async () => {
  const connector = createFakeConnector({
    mainReads: [boundMain(), boundMain(), boundMain(), movedMain()],
  });
  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Target main moved during post-create validation/u,
  );
  assert.deepEqual(connector.calls.slice(-2), [
    'closePullRequest',
    'deleteBranch',
  ]);
  assert.deepEqual(connector.cleanupRequests.deletions, [
    {
      name: target.branchName,
      expectedHeadSha: identities.publishedCommit,
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

test('preserves the branch after an invalid PR closure response', async (t) => {
  for (const [name, closure, expected] of [
    [
      'contradictory success',
      {
        closed: true,
        observedIdentity: {
          ...expectedPullRequestIdentity,
          headRef: 'codex/unrelated',
        },
      },
      /contradictory successful pull request closure/u,
    ],
    ['non-boolean state', { closed: 'true' }, /malformed result/u],
  ]) {
    await t.test(name, async () => {
      const connector = createFakeConnector({
        mainReads: [boundMain(), boundMain(), boundMain(), movedMain()],
      });
      connector.closePullRequest = async (request) => {
        connector.calls.push('closePullRequest');
        connector.cleanupRequests.pullRequestClosures.push(request);
        return closure;
      };
      await assert.rejects(
        publishHandoff({ manifest, connector, target }),
        expected,
      );
      assert.ok(!connector.calls.includes('deleteBranch'));
    });
  }
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
  const connector = createFakeConnector({
    branchReads: [{ exists: false }, { headSha: identities.movedCommit }],
  });
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

test('skips branch cleanup after an authoritative post-create absence', async () => {
  const connector = createFakeConnector({
    branchReads: [{ exists: false }, { exists: false }],
  });
  await assert.rejects(
    publishHandoff({ manifest, connector, target }),
    /Verified branch head differs/u,
  );
  assert.ok(connector.calls.includes('closePullRequest'));
  assert.ok(!connector.calls.includes('deleteBranch'));
  assert.deepEqual(connector.cleanupRequests.deletions, []);
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
      await assert.rejects(
        publishHandoff({ manifest, connector, target }),
        /Publication cleanup also failed .*ownership remains unproven/u,
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
      assert.deepEqual(connector.cleanupRequests.deletions, []);
      assert.deepEqual(connector.cleanupRequests.abandonments, [
        {
          name: target.branchName,
          expectedHeadSha: identities.publishedCommit,
          observedHeadSha: identities.publishedCommit,
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
