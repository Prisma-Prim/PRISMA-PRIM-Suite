import { createHash } from 'node:crypto';

const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

function fail(message) {
  throw new Error(message);
}

function assertSha(value, label) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) {
    fail(`${label} must be a Git object ID.`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string.`);
  }
}

function messageSha256(message) {
  return createHash('sha256').update(message, 'utf8').digest('hex');
}

function requireConnectorMethod(connector, name) {
  if (typeof connector?.[name] !== 'function') {
    fail(`Publication connector is missing ${name}().`);
  }
}

function validateInputs(manifest, connector, target) {
  if (!manifest || typeof manifest !== 'object') {
    fail('Publication manifest must be an object.');
  }
  for (const [label, identity] of [
    ['Base', manifest.base],
    ['Source', manifest.source],
  ]) {
    if (!identity || typeof identity !== 'object') {
      fail(`${label} identity must be an object.`);
    }
    assertSha(identity.commitSha, `${label} commit SHA`);
    assertSha(identity.treeSha, `${label} tree SHA`);
  }
  assertNonEmptyString(manifest.source.commitMessage, 'Source commit message');
  if (
    Buffer.byteLength(manifest.source.commitMessage, 'utf8') > 10_000 ||
    Buffer.from(manifest.source.commitMessage, 'utf8').toString('utf8') !==
      manifest.source.commitMessage ||
    manifest.source.commitMessage.includes('\0')
  ) {
    fail(
      'Source commit message must be exact UTF-8 without NUL and at most 10000 bytes.',
    );
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    fail('Publication manifest must contain changed entries.');
  }
  for (const entry of manifest.entries) {
    assertNonEmptyString(entry?.path, 'Changed path');
    if (entry.deleted !== true) assertSha(entry.blobSha, 'Changed blob SHA');
  }
  assertNonEmptyString(target?.branchName, 'Publication branch name');
  assertNonEmptyString(target?.pullRequest?.baseBranch, 'Pull request base');
  if (target.pullRequest.baseBranch !== 'main') {
    fail('Cloud handoff pull requests must target main.');
  }
  if (target.branchName === target.pullRequest.baseBranch) {
    fail('Cloud handoff head branch must differ from main.');
  }
  assertNonEmptyString(target?.pullRequest?.title, 'Pull request title');
  assertNonEmptyString(target?.pullRequest?.body, 'Pull request body');
  for (const name of [
    'readMain',
    'createBlob',
    'createTree',
    'createCommit',
    'createBranch',
    'createPullRequest',
    'findPullRequest',
    'readCommit',
    'readBranch',
    'readPullRequest',
    'closePullRequest',
    'deleteBranch',
    'abandonPullRequest',
    'abandonBranch',
  ]) {
    requireConnectorMethod(connector, name);
  }
  assertNonEmptyString(
    target.repositoryFullName,
    'Publication repository full name',
  );
}

function assertBoundMain(main, manifest, phase) {
  assertSha(main?.commitSha, `${phase} main commit SHA`);
  assertSha(main?.treeSha, `${phase} main tree SHA`);
  if (
    main.commitSha !== manifest.base.commitSha ||
    main.treeSha !== manifest.base.treeSha
  ) {
    fail(
      `Target main moved during ${phase}: expected ${manifest.base.commitSha}/${manifest.base.treeSha}, received ${main.commitSha}/${main.treeSha}.`,
    );
  }
}

async function readBoundMain(connector, manifest, phase, mainReads) {
  const main = await connector.readMain({ phase });
  mainReads.push({ phase, commitSha: main?.commitSha, treeSha: main?.treeSha });
  assertBoundMain(main, manifest, phase);
}

function assertRemoteCommit(commit, manifest, publishedCommitSha) {
  if (commit?.commitSha !== publishedCommitSha) {
    fail('Published commit lookup returned a different commit identity.');
  }
  if (commit.treeSha !== manifest.source.treeSha) {
    fail('Published commit tree differs from the Cloud source tree.');
  }
  if (
    !Array.isArray(commit.parentShas) ||
    commit.parentShas.length !== 1 ||
    commit.parentShas[0] !== manifest.base.commitSha
  ) {
    fail('Published commit parent differs from the bound current main.');
  }
  if (
    commit.rawMessageSha256 !== messageSha256(manifest.source.commitMessage)
  ) {
    fail(
      'Published commit raw-message digest differs from the Cloud source message.',
    );
  }
}

function isSha(value) {
  return typeof value === 'string' && SHA_PATTERN.test(value);
}

function pullRequestIdentity(pullRequest, label = 'Pull request') {
  const identity = {
    headSha: pullRequest?.headSha,
    headRef: pullRequest?.headRef,
    headRepositoryFullName: pullRequest?.headRepositoryFullName,
    baseSha: pullRequest?.baseSha,
    baseRef: pullRequest?.baseRef,
    baseRepositoryFullName: pullRequest?.baseRepositoryFullName,
  };
  assertSha(identity.headSha, `${label} head SHA`);
  assertNonEmptyString(identity.headRef, `${label} head ref`);
  assertNonEmptyString(
    identity.headRepositoryFullName,
    `${label} head repository`,
  );
  assertSha(identity.baseSha, `${label} base SHA`);
  assertNonEmptyString(identity.baseRef, `${label} base ref`);
  assertNonEmptyString(
    identity.baseRepositoryFullName,
    `${label} base repository`,
  );
  return identity;
}

function pullRequestIdentitiesMatch(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function pullRequestOwnership(identity) {
  return {
    headRef: identity.headRef,
    headRepositoryFullName: identity.headRepositoryFullName,
    baseRef: identity.baseRef,
    baseRepositoryFullName: identity.baseRepositoryFullName,
  };
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function classifyMutationFailure(failure) {
  if (
    failure?.mutationOutcome === 'unknown' ||
    failure?.mutationOutcome === 'not-created'
  ) {
    return failure.mutationOutcome;
  }
  return 'unclassified';
}

async function readBranchPresence(connector, name, label) {
  const branch = await connector.readBranch({ name });
  if (branch?.exists === false) return { exists: false };
  assertSha(branch?.headSha, `${label} head SHA`);
  return { exists: true, headSha: branch.headSha };
}

async function abandonPullRequest(connector, request) {
  await connector.abandonPullRequest(request);
}

async function closePullRequestConditionally(
  connector,
  { number, expectedOwnership, reason },
) {
  const closure = await connector.closePullRequest({
    number,
    expectedIdentity: expectedOwnership,
    reason,
  });
  if (closure?.closed === true) return { closed: true };
  return {
    closed: false,
    observedIdentity: pullRequestIdentity(
      closure?.observedIdentity,
      'Conditional pull request cleanup',
    ),
  };
}

async function findPullRequestByOwnership(connector, expectedOwnership) {
  const reconciliation = await connector.findPullRequest({
    expectedOwnership,
  });
  if (reconciliation?.found === false) return undefined;
  if (
    reconciliation?.found !== true ||
    !isPositiveSafeInteger(reconciliation.number)
  ) {
    fail('Ambiguous pull request reconciliation returned an invalid result.');
  }
  return {
    number: reconciliation.number,
    identity: pullRequestIdentity(
      reconciliation.identity,
      'Reconciled pull request',
    ),
  };
}

async function cleanUpPullRequestReferences(connector, state) {
  const cleanupFailures = [];
  const expectedOwnership = pullRequestOwnership(
    state.expectedPullRequestIdentity,
  );

  if (state.pullRequestCreationState === 'unclassified') {
    cleanupFailures.push(
      'classify ambiguous pull request creation: connector failure omitted mutationOutcome',
    );
    return cleanupFailures;
  }

  if (state.pullRequestCreationState === 'unknown') {
    try {
      const reconciliation = await findPullRequestByOwnership(
        connector,
        expectedOwnership,
      );
      if (reconciliation !== undefined) {
        await abandonPullRequest(connector, {
          number: reconciliation.number,
          expectedIdentity: state.expectedPullRequestIdentity,
          observedIdentity: reconciliation.identity,
          reason: state.failure.message,
        });
        cleanupFailures.push(
          'ambiguous pull request exists without attempt-specific ownership proof',
        );
      }
    } catch (error) {
      cleanupFailures.push(
        `reconcile ambiguous pull request creation: ${error.message}`,
      );
    }
    return cleanupFailures;
  }

  if (
    state.pullRequestCreationState !== 'confirmed' ||
    state.pullRequestNumber === undefined
  ) {
    return cleanupFailures;
  }

  try {
    if (
      state.observedPullRequestIdentity !== undefined &&
      !pullRequestIdentitiesMatch(
        pullRequestOwnership(state.observedPullRequestIdentity),
        expectedOwnership,
      )
    ) {
      await abandonPullRequest(connector, {
        number: state.pullRequestNumber,
        expectedIdentity: state.expectedPullRequestIdentity,
        observedIdentity: state.observedPullRequestIdentity,
        reason: state.failure.message,
      });
      fail(
        'Returned pull request immutable ownership differs; requested pull request ownership remains unproven.',
      );
    }

    const closure = await closePullRequestConditionally(connector, {
      number: state.pullRequestNumber,
      expectedOwnership,
      reason: state.failure.message,
    });
    if (!closure.closed) {
      await abandonPullRequest(connector, {
        number: state.pullRequestNumber,
        expectedIdentity: expectedOwnership,
        observedIdentity: closure.observedIdentity,
        reason: state.failure.message,
      });
      fail('Conditional pull request cleanup did not confirm closure.');
    }
  } catch (error) {
    cleanupFailures.push(`close or abandon PR: ${error.message}`);
  }

  return cleanupFailures;
}

async function observeAmbiguousBranch(connector, state, cleanupFailures) {
  let branchPresence;
  try {
    branchPresence = await readBranchPresence(
      connector,
      state.branchName,
      'Reconciled ambiguous branch',
    );
  } catch (error) {
    cleanupFailures.push(
      `reconcile ambiguous branch creation: ${error.message}`,
    );
    return;
  }

  if (branchPresence.exists) {
    try {
      await connector.abandonBranch({
        name: state.branchName,
        expectedHeadSha: state.publishedCommitSha,
        observedHeadSha: branchPresence.headSha,
        reason: state.failure.message,
      });
    } catch (error) {
      cleanupFailures.push(`abandon ambiguous branch: ${error.message}`);
    }
    cleanupFailures.push(
      'ambiguous branch exists without attempt-specific ownership proof',
    );
  }
}

function branchDeletionProvesAbsence(deletion) {
  if (
    (deletion?.deleted !== undefined &&
      typeof deletion.deleted !== 'boolean') ||
    (deletion?.exists !== undefined && typeof deletion.exists !== 'boolean')
  ) {
    fail('Conditional branch cleanup returned a malformed deletion result.');
  }
  if (deletion?.observedHeadSha !== undefined) {
    assertSha(
      deletion.observedHeadSha,
      'Conditional branch cleanup observed head SHA',
    );
  }
  const provesAbsence =
    deletion?.deleted === true || deletion?.exists === false;
  if (
    provesAbsence &&
    (deletion?.exists === true || deletion?.observedHeadSha !== undefined)
  ) {
    fail(
      'Conditional branch cleanup returned a contradictory branch deletion result.',
    );
  }
  return provesAbsence;
}

async function cleanUpBranchReference(
  connector,
  state,
  preserveBranchForPullRequestRecovery,
) {
  const cleanupFailures = [];
  let branchPresence;
  if (state.branchCreationState === 'unclassified') {
    cleanupFailures.push(
      'classify ambiguous branch creation: connector failure omitted mutationOutcome',
    );
  } else if (state.branchCreationState === 'unknown') {
    await observeAmbiguousBranch(connector, state, cleanupFailures);
    return cleanupFailures;
  } else if (state.branchCreationState === 'confirmed') {
    branchPresence =
      state.observedBranchHeadSha === undefined
        ? { exists: true, headSha: state.publishedCommitSha }
        : { exists: true, headSha: state.observedBranchHeadSha };
  }

  if (branchPresence?.exists === true) {
    try {
      if (branchPresence.headSha !== state.publishedCommitSha) {
        await connector.abandonBranch({
          name: state.branchName,
          expectedHeadSha: state.publishedCommitSha,
          observedHeadSha: branchPresence.headSha,
          reason: state.failure.message,
        });
      } else if (preserveBranchForPullRequestRecovery) {
        await connector.abandonBranch({
          name: state.branchName,
          expectedHeadSha: state.publishedCommitSha,
          observedHeadSha: branchPresence.headSha,
          reason: state.failure.message,
        });
      } else {
        const deletion = await connector.deleteBranch({
          name: state.branchName,
          expectedHeadSha: state.publishedCommitSha,
        });
        if (!branchDeletionProvesAbsence(deletion)) {
          const observedHeadSha = deletion?.observedHeadSha;
          await connector.abandonBranch({
            name: state.branchName,
            expectedHeadSha: state.publishedCommitSha,
            observedHeadSha,
            reason: state.failure.message,
          });
          if (observedHeadSha === state.publishedCommitSha) {
            fail('Conditional branch cleanup did not confirm deletion.');
          }
          if (observedHeadSha === undefined) {
            fail(
              'Conditional branch cleanup returned neither deletion, absence, nor a valid mismatched head.',
            );
          }
        }
      }
    } catch (error) {
      cleanupFailures.push(`remove or abandon branch: ${error.message}`);
    }
  }
  return cleanupFailures;
}

async function cleanUpPublishedReferences(connector, state) {
  const pullRequestFailures = await cleanUpPullRequestReferences(
    connector,
    state,
  );
  const branchFailures = await cleanUpBranchReference(
    connector,
    state,
    pullRequestFailures.length > 0,
  );
  const cleanupFailures = [...pullRequestFailures, ...branchFailures];
  if (cleanupFailures.length > 0) {
    fail(
      `${state.failure.message} Publication cleanup also failed (${cleanupFailures.join('; ')}); do not merge and complete cleanup manually.`,
    );
  }
  throw state.failure;
}

export async function publishHandoff({ manifest, connector, target }) {
  validateInputs(manifest, connector, target);
  const mainReads = [];
  await readBoundMain(connector, manifest, 'initial validation', mainReads);

  const treeEntries = [];
  for (const entry of manifest.entries) {
    if (entry.deleted === true) {
      treeEntries.push({ path: entry.path, sha: null });
      continue;
    }
    const createdBlob = await connector.createBlob({
      path: entry.path,
      contentBase64: entry.contentBase64,
      encoding: 'base64',
    });
    if (createdBlob?.sha !== entry.blobSha) {
      fail(`Connector blob identity mismatch for ${entry.path}.`);
    }
    treeEntries.push({
      path: entry.path,
      mode: entry.mode,
      type: entry.type,
      sha: entry.blobSha,
    });
  }

  const createdTree = await connector.createTree({
    baseTreeSha: manifest.base.treeSha,
    entries: treeEntries,
  });
  if (createdTree?.sha !== manifest.source.treeSha) {
    fail('Connector tree identity differs from the Cloud source tree.');
  }

  await readBoundMain(connector, manifest, 'pre-commit validation', mainReads);
  const createdCommit = await connector.createCommit({
    message: manifest.source.commitMessage,
    treeSha: manifest.source.treeSha,
    parentSha: manifest.base.commitSha,
  });
  assertSha(createdCommit?.sha, 'Published commit SHA');
  const publishedCommitSha = createdCommit.sha;
  const unreferencedCommit = await connector.readCommit({
    sha: publishedCommitSha,
  });
  assertRemoteCommit(unreferencedCommit, manifest, publishedCommitSha);

  await readBoundMain(
    connector,
    manifest,
    'pre-reference validation',
    mainReads,
  );
  let branchCreationState = 'not-attempted';
  let pullRequestCreationState = 'not-attempted';
  let pullRequestNumber;
  let observedBranchHeadSha;
  let observedPullRequestIdentity;
  let publishedRawMessageSha256;
  const expectedPullRequestIdentity = {
    headSha: publishedCommitSha,
    headRef: target.branchName,
    headRepositoryFullName: target.repositoryFullName,
    baseSha: manifest.base.commitSha,
    baseRef: target.pullRequest.baseBranch,
    baseRepositoryFullName: target.repositoryFullName,
  };
  try {
    const branchBeforeCreate = await readBranchPresence(
      connector,
      target.branchName,
      'Pre-create publication branch',
    );
    if (branchBeforeCreate.exists) {
      fail('Publication branch already exists before create.');
    }

    branchCreationState = 'unknown';
    let branch;
    try {
      branch = await connector.createBranch({
        name: target.branchName,
        sha: publishedCommitSha,
      });
    } catch (failure) {
      branchCreationState = classifyMutationFailure(failure);
      throw failure;
    }
    if (!isSha(branch?.headSha)) {
      fail('Created branch response has an invalid head.');
    }
    if (branch?.headSha !== publishedCommitSha) {
      fail('Created branch does not point to the published commit.');
    }
    branchCreationState = 'confirmed';

    pullRequestCreationState = 'unknown';
    let pullRequest;
    try {
      pullRequest = await connector.createPullRequest({
        branchName: target.branchName,
        baseBranch: target.pullRequest.baseBranch,
        title: target.pullRequest.title,
        body: target.pullRequest.body,
      });
    } catch (failure) {
      pullRequestCreationState = classifyMutationFailure(failure);
      throw failure;
    }
    if (!isPositiveSafeInteger(pullRequest?.number)) {
      fail('Connector returned an invalid pull request number.');
    }
    pullRequestNumber = pullRequest.number;
    pullRequestCreationState = 'confirmed';

    const remoteCommit = await connector.readCommit({
      sha: publishedCommitSha,
    });
    assertRemoteCommit(remoteCommit, manifest, publishedCommitSha);
    publishedRawMessageSha256 = remoteCommit.rawMessageSha256;
    const remoteBranch = await readBranchPresence(
      connector,
      target.branchName,
      'Verified publication branch',
    );
    observedBranchHeadSha = remoteBranch.headSha;
    if (!remoteBranch.exists || observedBranchHeadSha !== publishedCommitSha) {
      fail('Verified branch head differs from the published commit.');
    }
    const remotePullRequest = await connector.readPullRequest({
      number: pullRequestNumber,
    });
    observedPullRequestIdentity = pullRequestIdentity(
      remotePullRequest,
      'Verified pull request',
    );
    if (
      !pullRequestIdentitiesMatch(
        observedPullRequestIdentity,
        expectedPullRequestIdentity,
      )
    ) {
      fail('Verified pull request heads differ from the bound publication.');
    }
    await readBoundMain(
      connector,
      manifest,
      'post-create validation',
      mainReads,
    );
  } catch (failure) {
    await cleanUpPublishedReferences(connector, {
      branchCreationState,
      branchName: target.branchName,
      expectedPullRequestIdentity,
      observedBranchHeadSha,
      observedPullRequestIdentity,
      publishedCommitSha,
      pullRequestCreationState,
      pullRequestNumber,
      failure,
    });
  }

  return {
    baseCommitSha: manifest.base.commitSha,
    baseTreeSha: manifest.base.treeSha,
    cloudSourceCommitSha: manifest.source.commitSha,
    cloudSourceTreeSha: manifest.source.treeSha,
    cloudSourceMessageSha256: messageSha256(manifest.source.commitMessage),
    publishedCommitSha,
    publishedTreeSha: manifest.source.treeSha,
    publishedRawMessageSha256,
    branchHeadSha: publishedCommitSha,
    pullRequestHeadSha: publishedCommitSha,
    pullRequestNumber,
    mainReads,
  };
}
