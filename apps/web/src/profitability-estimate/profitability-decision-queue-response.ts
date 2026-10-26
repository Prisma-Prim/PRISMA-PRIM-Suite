type Scope = { workspaceId: string; companyId: string };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid queue response.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Invalid queue text.');
  return value;
}
function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Invalid queue Version.');
  return value;
}
export function parseDecisionQueue(value: unknown, scope: Scope) {
  const body = object(value);
  if (!Array.isArray(body.items) || body.items.length > 25)
    throw new Error('Invalid queue page.');
  const items = body.items.map((value: unknown) => {
    const item = object(value);
    if (
      item.workspaceId !== scope.workspaceId ||
      item.companyId !== scope.companyId
    )
      throw new Error('Foreign queue scope.');
    const createdAt = text(item.createdAt);
    if (
      !Number.isFinite(Date.parse(createdAt)) ||
      new Date(createdAt).toISOString() !== createdAt
    )
      throw new Error('Invalid queue instant.');
    const versionNumber = positive(item.versionNumber),
      latestVersionNumber = positive(item.latestVersionNumber);
    if (versionNumber > latestVersionNumber)
      throw new Error('Invalid queue head.');
    return {
      ...scope,
      versionId: text(item.versionId),
      estimateId: text(item.estimateId),
      opportunityId: text(item.opportunityId),
      clientRequestId: text(item.clientRequestId),
      versionNumber,
      latestVersionNumber,
      createdAt,
      opportunityTitle: text(item.opportunityTitle),
    };
  });
  if (new Set(items.map((item) => item.versionId)).size !== items.length)
    throw new Error('Repeated queue Version.');
  for (let index = 1; index < items.length; index++) {
    const a = items[index - 1],
      b = items[index];
    if (
      a &&
      b &&
      (a.createdAt > b.createdAt ||
        (a.createdAt === b.createdAt && a.versionId >= b.versionId))
    )
      throw new Error('Invalid queue order.');
  }
  const nextCursor =
    body.nextCursor === undefined ? undefined : text(body.nextCursor);
  if (
    nextCursor !== undefined &&
    (items.length !== 25 ||
      nextCursor.length > 2048 ||
      !/^[A-Za-z0-9_-]+$/u.test(nextCursor))
  )
    throw new Error('Invalid queue continuation.');
  return { items, nextCursor };
}
export type DecisionQueuePage = ReturnType<typeof parseDecisionQueue>;
export type DecisionQueueItem = DecisionQueuePage['items'][number];
