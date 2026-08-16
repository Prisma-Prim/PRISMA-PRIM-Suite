const reviewedCommitPattern = /\*\*Reviewed commit:\*\*\s*`([0-9a-f]{7,40})`/iu;
const noFindingsPattern = /Codex Review:\s*Didn't find any major issues\./iu;

function identifiesHead(candidate, headSha) {
  return (
    typeof candidate === 'string' &&
    candidate.length >= 7 &&
    headSha.startsWith(candidate.toLowerCase())
  );
}

function commentTargetsHead(comment, headSha) {
  const reviewedCommit = comment.body?.match(reviewedCommitPattern)?.[1];
  return (
    noFindingsPattern.test(comment.body ?? '') &&
    identifiesHead(reviewedCommit, headSha)
  );
}

export function evaluateCodexReviewGate(snapshot) {
  const headSha = snapshot.headSha.toLowerCase();
  const hasCurrentHeadReview = snapshot.codexReviews.some(
    (review) =>
      ['APPROVED', 'COMMENTED'].includes(review.state) &&
      identifiesHead(review.commitId, headSha),
  );
  const hasCurrentHeadComment = snapshot.codexComments.some((comment) =>
    commentTargetsHead(comment, headSha),
  );

  if (!hasCurrentHeadReview && !hasCurrentHeadComment) {
    return {
      state: 'pending',
      summary: 'Codex has not completed a review for the current PR head.',
    };
  }

  const blockingThreadCount = snapshot.codexThreads.filter(
    (thread) => !thread.isResolved && !thread.isOutdated,
  ).length;

  if (blockingThreadCount > 0) {
    const noun =
      blockingThreadCount === 1 ? 'thread remains' : 'threads remain';
    return {
      state: 'blocked',
      summary: `${blockingThreadCount} current Codex review ${noun} unresolved.`,
    };
  }

  return {
    state: 'ready',
    summary:
      'Codex completed the current-head review and no blocking threads remain.',
  };
}
