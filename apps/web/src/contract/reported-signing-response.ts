import {
  exactRecord,
  modelInteger,
  text,
} from '../contract-model/contract-model-content';
import {
  modelContractRules,
  readModelContractQuality,
} from './model-contract-quality-response';

export function readReportedSignatory(value: unknown) {
  const row = exactRecord(value, ['label', 'signedOn', 'mandate']);
  const mandate = record(row.mandate);
  const result =
    mandate.kind === 'UNKNOWN'
      ? (exactRecord(mandate, ['kind']), { kind: 'UNKNOWN' as const })
      : mandate.kind === 'DECLARED_UNVERIFIED'
        ? (exactRecord(mandate, ['kind', 'basis']),
          {
            kind: 'DECLARED_UNVERIFIED' as const,
            basis: text(mandate.basis, 2000),
          })
        : invalid();
  return {
    label: text(row.label, 200),
    signedOn: row.signedOn === null ? null : date(row.signedOn),
    mandate: result,
  };
}
export function readSigningPdfReference(value: unknown) {
  const row = record(value);
  if (
    (row.status !== 'official' && row.status !== 'superseded') ||
    row.mediaType !== 'application/pdf' ||
    row.scanOutcome !== 'clean' ||
    typeof row.size !== 'number' ||
    !Number.isSafeInteger(row.size) ||
    row.size < 1 ||
    row.size > 5242880
  )
    invalid();
  return {
    documentId: uuid(row.documentId),
    documentVersionId: uuid(row.documentVersionId),
    documentVersionNumber: modelInteger(row.documentVersionNumber, 1),
    title: text(row.title, 200),
    status:
      row.status === 'official'
        ? ('official' as const)
        : ('superseded' as const),
    representationId: uuid(row.representationId),
    fileName: text(row.fileName, 120),
    mediaType: 'application/pdf' as const,
    size: row.size,
    sha256: digest(row.sha256),
    scanOutcome: 'clean' as const,
    scanEngine: text(row.scanEngine, 200),
    scannedAt: instant(row.scannedAt),
    storedByMembershipId: uuid(row.storedByMembershipId),
    storedAt: instant(row.storedAt),
  };
}
export type SigningPdfReference = ReturnType<typeof readSigningPdfReference>;
export function readSigningPdfCandidates(value: unknown) {
  const row = record(value);
  if (
    !Array.isArray(row.items) ||
    row.items.length > 20 ||
    (row.nextCursor !== null &&
      (typeof row.nextCursor !== 'string' ||
        !row.nextCursor.length ||
        row.nextCursor.length > 1000))
  )
    invalid();
  const items = row.items.map(readSigningPdfReference);
  if (new Set(items.map((r) => r.representationId)).size !== items.length)
    invalid();
  if (
    !Array.isArray(row.warningCodes) ||
    row.warningCodes.some(
      (code) =>
        typeof code !== 'string' ||
        !Object.entries(modelContractRules).some(
          ([own, severity]) => own === code && severity === 'WARNING',
        ),
    ) ||
    new Set(row.warningCodes).size !== row.warningCodes.length
  )
    invalid();
  const warningCodes: string[] = row.warningCodes.map((code) =>
    text(code, 100),
  );
  return { items, nextCursor: row.nextCursor, warningCodes };
}
export function readReportedSigning(
  value: unknown,
  expected: {
    contractId: string;
    versionId: string;
    versionNumber: number;
    createdRevision: number;
    checksum: string;
    approvalDecisionId: string;
  },
) {
  const row = record(value);
  if (
    row.evidenceKind !== 'DECLARED_RECEIVED_PDF' ||
    row.provenance !== 'COMPANY_MODEL_OFFER' ||
    row.provisional !== true ||
    row.caseAcceptance !== 'DECLARED' ||
    row.contractId !== expected.contractId ||
    row.contractVersionId !== expected.versionId ||
    row.versionNumber !== expected.versionNumber ||
    row.revision !== expected.createdRevision + 2 ||
    row.representationChecksum !== expected.checksum ||
    row.approvalDecisionId !== expected.approvalDecisionId
  )
    invalid();
  const recordedAt = instant(row.recordedAt);
  const providerSignatory = readReportedSignatory(row.providerSignatory),
    clientSignatory = readReportedSignatory(row.clientSignatory);
  if (
    [providerSignatory, clientSignatory].some(
      (r) => r.signedOn !== null && r.signedOn > recordedAt.slice(0, 10),
    )
  )
    invalid();
  const qualityRun = readModelContractQuality(
    row.qualityRun,
    expected.versionId,
  );
  const actorWorkspaceMembershipId = uuid(row.actorWorkspaceMembershipId);
  const warnings = qualityRun.results
    .filter((r) => r.status === 'WARNING')
    .map((r) => r.code)
    .sort();
  if (
    qualityRun.results.some((r) => r.status === 'ERROR') ||
    qualityRun.evaluatedAt !== recordedAt ||
    qualityRun.actorWorkspaceMembershipId !== actorWorkspaceMembershipId ||
    !Array.isArray(row.acknowledgedWarningCodes) ||
    row.acknowledgedWarningCodes.some((r) => typeof r !== 'string') ||
    JSON.stringify([...row.acknowledgedWarningCodes].sort()) !==
      JSON.stringify(warnings)
  )
    invalid();
  const pdf = record(row.pdf);
  const projection =
    pdf.access === 'denied'
      ? (exactRecord(pdf, ['access']), { access: 'denied' as const })
      : pdf.access === 'granted'
        ? {
            access: 'granted' as const,
            reference: readSigningPdfReference(pdf.reference),
          }
        : invalid();
  return {
    id: uuid(row.id),
    contractId: expected.contractId,
    contractVersionId: expected.versionId,
    versionNumber: expected.versionNumber,
    revision: expected.createdRevision + 2,
    evidenceKind: 'DECLARED_RECEIVED_PDF' as const,
    provenance: 'COMPANY_MODEL_OFFER' as const,
    provisional: true as const,
    caseAcceptance: 'DECLARED' as const,
    providerSignatory,
    clientSignatory,
    concordanceBasis: text(row.concordanceBasis, 2000),
    acceptanceBasis: text(row.acceptanceBasis, 2000),
    acknowledgedWarningCodes: warnings,
    actorWorkspaceMembershipId,
    actorInternalUserId: uuid(row.actorInternalUserId),
    recordedAt,
    approvalDecisionId: expected.approvalDecisionId,
    representationChecksum: expected.checksum,
    qualityRun,
    pdf: projection,
  };
}
export type ReportedSigningView = ReturnType<typeof readReportedSigning>;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return Object.fromEntries(Object.entries(value));
}
function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
    invalid();
  return value;
}
function instant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid();
  return value;
}
function date(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(?!0000)\d{4}-\d{2}-\d{2}$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    invalid();
  return value;
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) invalid();
  return value;
}
function invalid(): never {
  throw new Error('Invalid reported signing response.');
}
