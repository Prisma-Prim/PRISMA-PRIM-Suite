/** The browser owns validation of each consumed public field; receipts remain closed. */
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid working evidence response');
  return Object.fromEntries(Object.entries(value));
}
function closed(row: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(row, key))
  )
    throw new Error('Invalid working evidence format');
}
export function evidenceId(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value))
    throw new Error('Invalid working evidence identity');
  return value;
}
function text(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.trim() ||
    value.includes(String.fromCharCode(0)) ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      value,
    )
  )
    throw new Error('Invalid working evidence text');
  return value;
}
function optionalText(value: unknown, maximum: number) {
  return value === null ? null : text(value, maximum);
}
function integer(value: unknown, maximum = 2147483647): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  )
    throw new Error('Invalid working evidence number');
  return value;
}
function instant(value: unknown) {
  const result = text(value, 24);
  if (new Date(result).toISOString() !== result)
    throw new Error('Invalid working evidence time');
  return result;
}
function action(value: unknown) {
  if (value !== 'RECORD' && value !== 'CORRECT')
    throw new Error('Invalid working evidence action');
  return value;
}
function cursor(value: unknown) {
  return value === null
    ? null
    : (() => {
        const result = text(value, 256);
        if (!/^[\x21-\x7e]+$/u.test(result))
          throw new Error('Invalid working evidence cursor');
        return result;
      })();
}
function pageItems(value: unknown) {
  if (!Array.isArray(value) || value.length > 25)
    throw new Error('Invalid working evidence page');
  return value;
}
export function readEvidenceReceipt(value: unknown) {
  const row = object(value);
  closed(row, [
    'format',
    'commandId',
    'caseId',
    'revisionId',
    'revisionNumber',
    'action',
    'recordedAt',
  ]);
  if (row.format !== 'WORKING_EVIDENCE_CASE_RECEIPT/1')
    throw new Error('Unknown working evidence receipt');
  return {
    format: row.format,
    commandId: evidenceId(row.commandId),
    caseId: evidenceId(row.caseId),
    revisionId: evidenceId(row.revisionId),
    revisionNumber: integer(row.revisionNumber),
    action: action(row.action),
    recordedAt: instant(row.recordedAt),
  };
}
export function readEvidenceSources(value: unknown) {
  const row = object(value);
  if (row.format !== 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1')
    throw new Error('Unknown source page');
  return {
    items: pageItems(row.items).map((value) => {
      const item = object(value);
      return {
        documentId: evidenceId(item.documentId),
        versionId: evidenceId(item.versionId),
        versionNumber: integer(item.versionNumber, 50),
        representationId: evidenceId(item.representationId),
        sourceTitle: text(item.sourceTitle, 200),
      };
    }),
    nextCursor: cursor(row.nextCursor),
  };
}
export type EvidenceSource = ReturnType<
  typeof readEvidenceSources
>['items'][number];
function actorStamp(value: unknown) {
  const row = object(value);
  return {
    membershipId: evidenceId(row.membershipId),
    displayName: text(row.displayName, 500),
  };
}
function support(value: unknown) {
  const row = object(value);
  if (
    row.mediaType !== 'application/pdf' ||
    typeof row.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(row.sha256)
  )
    throw new Error('Invalid frozen support');
  return {
    evidenceId: evidenceId(row.evidenceId),
    documentId: evidenceId(row.documentId),
    versionId: evidenceId(row.versionId),
    versionNumber: integer(row.versionNumber, 50),
    representationId: evidenceId(row.representationId),
    sourceTitle: text(row.sourceTitle, 200),
    sourcePurpose: text(row.sourcePurpose, 2000),
    filename: text(row.filename, 255),
    mediaType: row.mediaType,
    sizeBytes: integer(row.sizeBytes, 5 * 1024 * 1024),
    sha256: row.sha256,
    locator: optionalText(row.locator, 500),
    supportNote: text(row.supportNote, 2000),
  };
}
function evidence(
  value: unknown,
):
  | { state: 'visible'; supports: ReturnType<typeof support>[] }
  | { state: 'unavailable' } {
  const row = object(value);
  if (row.state === 'unavailable') return { state: 'unavailable' };
  if (
    row.state !== 'visible' ||
    !Array.isArray(row.supports) ||
    row.supports.length < 1 ||
    row.supports.length > 3
  )
    throw new Error('Invalid evidence view');
  const supports = row.supports.map(support);
  if (new Set(supports.map((item) => item.evidenceId)).size !== supports.length)
    throw new Error('Duplicate evidence');
  return { state: 'visible', supports };
}
export function readEvidenceRevision(value: unknown) {
  const row = object(value);
  if (row.format !== 'WORKING_EVIDENCE_CASE_REVISION/1')
    throw new Error('Unknown revision');
  const revisionNumber = integer(row.revisionNumber),
    revisionAction = action(row.action);
  const previousRevisionId =
    row.previousRevisionId === null ? null : evidenceId(row.previousRevisionId);
  const reason = optionalText(row.reason, 2000);
  if (
    (revisionNumber === 1) !==
      (revisionAction === 'RECORD' &&
        previousRevisionId === null &&
        reason === null) ||
    (revisionNumber > 1 &&
      (revisionAction !== 'CORRECT' ||
        previousRevisionId === null ||
        reason === null))
  )
    throw new Error('Invalid revision history');
  return {
    format: row.format,
    caseId: evidenceId(row.caseId),
    revisionId: evidenceId(row.revisionId),
    revisionNumber,
    previousRevisionId,
    action: revisionAction,
    recordedAt: instant(row.recordedAt),
    actor: actorStamp(row.actor),
    reason,
    title: text(row.title, 200),
    declaredContext: optionalText(row.declaredContext, 2000),
    process: text(row.process, 200),
    statement: text(row.statement, 2000),
    observationNote: optionalText(row.observationNote, 2000),
    evidence: evidence(row.evidence),
  };
}
export type EvidenceRevision = ReturnType<typeof readEvidenceRevision>;
export function readEvidenceCase(value: unknown) {
  const row = object(value);
  if (row.format !== 'WORKING_EVIDENCE_CASE/1') throw new Error('Unknown case');
  const caseId = evidenceId(row.caseId),
    current = readEvidenceRevision(row.current);
  if (current.caseId !== caseId) throw new Error('Invalid Case scope');
  return {
    caseId,
    projectId: evidenceId(row.projectId),
    originalClientId: evidenceId(row.originalClientId),
    current,
  };
}
export function readEvidenceCases(value: unknown) {
  const row = object(value);
  if (row.format !== 'WORKING_EVIDENCE_CASE_PAGE/1')
    throw new Error('Unknown case page');
  return {
    items: pageItems(row.items).map((value) => {
      const item = object(value);
      return {
        caseId: evidenceId(item.caseId),
        revisionId: evidenceId(item.revisionId),
        revisionNumber: integer(item.revisionNumber),
        title: text(item.title, 200),
        recordedAt: instant(item.recordedAt),
      };
    }),
    nextCursor: cursor(row.nextCursor),
  };
}
export function readEvidenceHistory(value: unknown) {
  const row = object(value);
  if (row.format !== 'WORKING_EVIDENCE_CASE_HISTORY/1')
    throw new Error('Unknown history page');
  return {
    items: pageItems(row.items).map((value) => {
      const item = object(value);
      return {
        revisionId: evidenceId(item.revisionId),
        revisionNumber: integer(item.revisionNumber),
        action: action(item.action),
        recordedAt: instant(item.recordedAt),
        actor: actorStamp(item.actor),
      };
    }),
    nextCursor: cursor(row.nextCursor),
  };
}
export type EvidenceValues = {
  title: string;
  declaredContext: string | null;
  process: string;
  statement: string;
  observationNote: string | null;
  supports: {
    documentId: string;
    versionId: string;
    representationId: string;
    locator: string | null;
    supportNote: string;
  }[];
};
export function normalizedEvidenceValues(
  values: EvidenceValues,
): EvidenceValues {
  if (values.supports.length < 1 || values.supports.length > 3)
    throw new Error('Invalid supports');
  const supports = values.supports.map((item) => ({
    documentId: evidenceId(item.documentId),
    versionId: evidenceId(item.versionId),
    representationId: evidenceId(item.representationId),
    locator:
      item.locator === null
        ? null
        : optionalText(item.locator.trim() || null, 500),
    supportNote: text(item.supportNote.trim(), 2000),
  }));
  if (
    new Set(
      supports.map((item) =>
        JSON.stringify([
          item.documentId,
          item.versionId,
          item.representationId,
        ]),
      ),
    ).size !== supports.length
  )
    throw new Error('Duplicate supports');
  return {
    title: text(values.title.trim(), 200),
    declaredContext: optionalText(values.declaredContext?.trim() || null, 2000),
    process: text(values.process.trim(), 200),
    statement: text(values.statement.trim(), 2000),
    observationNote: optionalText(values.observationNote?.trim() || null, 2000),
    supports,
  };
}
