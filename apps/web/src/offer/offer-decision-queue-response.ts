type Scope = { workspaceId: string; companyId: string; modelDecision: boolean };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Offer queue response.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Invalid Offer queue text.');
  return value;
}
function id(value: unknown): string {
  const result = text(value);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      result,
    )
  )
    throw new Error('Invalid Offer queue identity.');
  return result;
}
function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Invalid Offer queue number.');
  return value;
}
export function parseOfferDecisionQueue(value: unknown, scope: Scope) {
  const body = object(value);
  if (!Array.isArray(body.items) || body.items.length > 25)
    throw new Error('Invalid Offer queue page.');
  const items = body.items.map((value: unknown) => {
    const item = object(value);
    if (
      item.workspaceId !== scope.workspaceId ||
      item.companyId !== scope.companyId
    )
      throw new Error('Foreign Offer queue scope.');
    const provenance = item.provenance;
    if (
      provenance !== 'ILLUSTRATIVE' &&
      !(provenance === 'COMPANY_MODEL_ESTIMATE' && scope.modelDecision)
    )
      throw new Error('Unsupported Offer queue Version.');
    const createdAt = text(item.createdAt);
    const date = new Date(createdAt);
    if (
      createdAt.startsWith('0000-') ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(createdAt) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 23) !== createdAt.slice(0, 23)
    )
      throw new Error('Invalid Offer queue instant.');
    return {
      workspaceId: scope.workspaceId,
      companyId: scope.companyId,
      offerId: id(item.offerId),
      versionId: id(item.versionId),
      opportunityId: id(item.opportunityId),
      clientRequestId: id(item.clientRequestId),
      opportunityTitle: text(item.opportunityTitle),
      illustrativeReference: positive(item.illustrativeReference),
      versionNumber: positive(item.versionNumber),
      provenance,
      createdAt,
    };
  });
  if (
    new Set(items.map((item) => item.versionId)).size !== items.length ||
    new Set(items.map((item) => item.offerId)).size !== items.length
  )
    throw new Error('Repeated Offer queue identity.');
  for (let n = 1; n < items.length; n++) {
    const a = items[n - 1],
      b = items[n];
    if (
      a &&
      b &&
      (a.createdAt > b.createdAt ||
        (a.createdAt === b.createdAt && a.versionId >= b.versionId))
    )
      throw new Error('Invalid Offer queue order.');
  }
  const nextCursor =
    body.nextCursor === undefined ? undefined : text(body.nextCursor);
  if (
    nextCursor !== undefined &&
    (items.length !== 25 ||
      nextCursor.length > 2048 ||
      !/^[A-Za-z0-9_-]+$/u.test(nextCursor))
  )
    throw new Error('Invalid Offer queue continuation.');
  return { items, nextCursor };
}
export type OfferDecisionQueuePage = ReturnType<typeof parseOfferDecisionQueue>;
export type OfferDecisionQueueItem = OfferDecisionQueuePage['items'][number];
