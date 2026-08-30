import { createHash } from 'node:crypto';

export function messageSha256(message) {
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

export const addedContent = Buffer.from('added\n');
const deletedContent = Buffer.from('deleted\n');
const addedBlobSha = gitObjectSha('blob', addedContent);
const deletedBlobSha = gitObjectSha('blob', deletedContent);

export const identities = {
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

export const manifest = {
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

export const target = {
  repositoryFullName: 'Prisma-Prim/PRISMA-PRIM-Suite',
  branchName: 'codex/issue-184',
  pullRequest: {
    baseBranch: 'main',
    title: 'Exact handoff',
    body: 'Closes #184',
  },
};

export const expectedPullRequestIdentity = {
  headSha: identities.publishedCommit,
  headRef: target.branchName,
  headRepositoryFullName: target.repositoryFullName,
  baseSha: identities.baseCommit,
  baseRef: 'main',
  baseRepositoryFullName: target.repositoryFullName,
};

export const expectedPullRequestOwnership = {
  headRef: target.branchName,
  headRepositoryFullName: target.repositoryFullName,
  baseRef: 'main',
  baseRepositoryFullName: target.repositoryFullName,
};

export function boundMain() {
  return {
    commitSha: identities.baseCommit,
    treeSha: identities.baseTree,
  };
}

export function movedMain() {
  return {
    commitSha: identities.movedCommit,
    treeSha: identities.movedTree,
  };
}

export function mutationError(message, mutationOutcome) {
  const error = new Error(message);
  error.mutationOutcome = mutationOutcome;
  return error;
}

export function createFakeConnector({ mainReads = [], branchReads = [] } = {}) {
  const calls = [];
  const lookupRequests = [];
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
  let branchReadIndex = 0;
  const connector = {
    calls,
    cleanupRequests,
    lookupRequests,
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
    async findPullRequest(request) {
      calls.push('findPullRequest');
      lookupRequests.push(request);
      return { found: false };
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
      const result =
        branchReads[branchReadIndex] ??
        (branchReadIndex === 0
          ? { exists: false }
          : { headSha: identities.publishedCommit });
      branchReadIndex += 1;
      return result;
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
    async deleteBranch(request) {
      calls.push('deleteBranch');
      cleanupRequests.deletions.push(request);
      return { deleted: true };
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

export function rejectBranchCreation(connector) {
  connector.createBranch = async () => {
    connector.calls.push('createBranch');
    throw mutationError('create branch response timed out', 'unknown');
  };
}

export function rejectPullRequestCreation(connector) {
  connector.createPullRequest = async () => {
    connector.calls.push('createPullRequest');
    throw mutationError('create pull request response timed out', 'unknown');
  };
}

export function returnPullRequestLookup(connector, result) {
  connector.findPullRequest = async (request) => {
    connector.calls.push('findPullRequest');
    connector.lookupRequests.push(request);
    return result;
  };
}
