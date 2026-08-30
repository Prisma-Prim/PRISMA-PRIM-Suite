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
    'readCommit',
    'readBranch',
    'readPullRequest',
    'closePullRequest',
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

function pullRequestIdentity(pullRequest) {
  return {
    headSha: pullRequest?.headSha,
    headRef: pullRequest?.headRef,
    headRepositoryFullName: pullRequest?.headRepositoryFullName,
    baseSha: pullRequest?.baseSha,
    baseRef: pullRequest?.baseRef,
    baseRepositoryFullName: pullRequest?.baseRepositoryFullName,
  };
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

async function cleanUpPublishedReferences(connector, state) {
  const cleanupFailures = [];
  if (state.pullRequestNumber !== undefined) {
    try {
      const expectedOwnership = pullRequestOwnership(
        state.expectedPullRequestIdentity,
      );
      if (
        state.observedPullRequestIdentity !== undefined &&
        !pullRequestIdentitiesMatch(
          pullRequestOwnership(state.observedPullRequestIdentity),
          expectedOwnership,
        )
      ) {
        await connector.abandonPullRequest({
          number: state.pullRequestNumber,
          expectedIdentity: state.expectedPullRequestIdentity,
          observedIdentity: state.observedPullRequestIdentity,
          reason: state.failure.message,
        });
      } else {
        const closure = await connector.closePullRequest({
          number: state.pullRequestNumber,
          expectedIdentity: expectedOwnership,
          reason: state.failure.message,
        });
        if (closure?.closed !== true) {
          await connector.abandonPullRequest({
            number: state.pullRequestNumber,
            expectedIdentity: expectedOwnership,
            observedIdentity: closure?.observedIdentity,
            reason: state.failure.message,
          });
          fail('Conditional pull request cleanup did not confirm closure.');
        }
      }
    } catch (error) {
      cleanupFailures.push(`close or abandon PR: ${error.message}`);
    }
  }
  if (state.branchCreated) {
    try {
      if (
        state.observedBranchHeadSha !== undefined &&
        state.observedBranchHeadSha !== state.publishedCommitSha
      ) {
        await connector.abandonBranch({
          name: state.branchName,
          expectedHeadSha: state.publishedCommitSha,
          observedHeadSha: state.observedBranchHeadSha,
          reason: state.failure.message,
        });
      } else if (typeof connector.deleteBranch === 'function') {
        const deletion = await connector.deleteBranch({
          name: state.branchName,
          expectedHeadSha: state.publishedCommitSha,
        });
        if (deletion?.deleted !== true) {
          await connector.abandonBranch({
            name: state.branchName,
            expectedHeadSha: state.publishedCommitSha,
            observedHeadSha: deletion?.observedHeadSha,
            reason: state.failure.message,
          });
        }
      } else {
        await connector.abandonBranch({
          name: state.branchName,
          expectedHeadSha: state.publishedCommitSha,
          reason: state.failure.message,
        });
      }
    } catch (error) {
      cleanupFailures.push(`remove or abandon branch: ${error.message}`);
    }
  }
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
  let branchCreated = false;
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
    const branch = await connector.createBranch({
      name: target.branchName,
      sha: publishedCommitSha,
    });
    branchCreated = true;
    if (branch?.headSha !== publishedCommitSha) {
      fail('Created branch does not point to the published commit.');
    }
    const pullRequest = await connector.createPullRequest({
      branchName: target.branchName,
      baseBranch: target.pullRequest.baseBranch,
      title: target.pullRequest.title,
      body: target.pullRequest.body,
    });
    if (!Number.isSafeInteger(pullRequest?.number)) {
      fail('Connector returned an invalid pull request number.');
    }
    pullRequestNumber = pullRequest.number;

    const remoteCommit = await connector.readCommit({
      sha: publishedCommitSha,
    });
    assertRemoteCommit(remoteCommit, manifest, publishedCommitSha);
    publishedRawMessageSha256 = remoteCommit.rawMessageSha256;
    const remoteBranch = await connector.readBranch({
      name: target.branchName,
    });
    observedBranchHeadSha = remoteBranch?.headSha;
    if (observedBranchHeadSha !== publishedCommitSha) {
      fail('Verified branch head differs from the published commit.');
    }
    const remotePullRequest = await connector.readPullRequest({
      number: pullRequestNumber,
    });
    observedPullRequestIdentity = pullRequestIdentity(remotePullRequest);
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
      branchCreated,
      branchName: target.branchName,
      expectedPullRequestIdentity,
      observedBranchHeadSha,
      observedPullRequestIdentity,
      publishedCommitSha,
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
