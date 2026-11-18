import { citation } from '../dossier-analysis/analysis-response';
import { uuid } from '../knowledge-evidence/knowledge-response';
import { CERTIFICATION_LIMITS } from './certification-response';
import type { ApplicationDraft } from './certification-draft';

export const PREPARABLE_FIELDS = [
  'declaredLegalName',
  'declaredAddress',
  'requestedScope',
] as const;
export type PreparableDraft = Pick<
  ApplicationDraft,
  (typeof PREPARABLE_FIELDS)[number]
>;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid preparation.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown, limit: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    throw new Error('Invalid preparation text.');
  return value;
}
function insertableString(value: unknown, limit: number) {
  const literal = string(value, limit);
  if (literal.trim() !== literal || /[\p{Cc}\p{Cf}]/u.test(literal))
    throw new Error('Invalid preparation text.');
  return literal;
}
type ExpectedPreparation = {
  projectId: string;
  caseId: string;
  revision: number;
  runId: string;
};
export type StageDraftStep =
  'stage_1_plan' | 'stage_2_plan' | 'stage_1_report' | 'stage_2_report';
const SOURCE_FIELDS = [
  'legalName',
  'taxId',
  'address',
  'standard',
  'auditType',
  'auditDate',
  'decisionDate',
  'validFrom',
  'validUntil',
  'auditorDays',
  'reference',
  'scope',
] as const;
export function draftPreparation(
  value: unknown,
  expected: ExpectedPreparation,
) {
  return preparation(
    value,
    expected,
    PREPARABLE_FIELDS,
    'CERTIFICATION_APPLICATION_DRAFT/1',
    (field) => CERTIFICATION_LIMITS[field],
  );
}
export function stageDraftPreparation(
  value: unknown,
  expected: ExpectedPreparation & { step: StageDraftStep },
) {
  const allowed =
    expected.step === 'stage_1_plan' || expected.step === 'stage_2_plan'
      ? (['scope'] as const)
      : SOURCE_FIELDS;
  return preparation(
    value,
    expected,
    allowed,
    'CERTIFICATION_STAGE_DRAFT/1',
    () => 2000,
    expected.step,
  );
}
function preparation<Field extends string>(
  value: unknown,
  expected: ExpectedPreparation,
  fields: readonly Field[],
  format: string,
  limit: (field: Field) => number,
  step?: StageDraftStep,
) {
  const x = object(value),
    target = object(x.target),
    run = object(x.run);
  if (
    x.format !== format ||
    target.step !== step ||
    target.caseId !== expected.caseId ||
    target.projectId !== expected.projectId ||
    target.revision !== expected.revision ||
    run.id !== expected.runId ||
    typeof run.snapshotHash !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(run.snapshotHash) ||
    !Array.isArray(x.candidates) ||
    x.candidates.length > 100
  )
    throw new Error('Preparation is not bound to this draft.');
  const rows: unknown[] = x.candidates;
  const candidates = rows.map((value) => {
    const row = object(value);
    const field = fields.find((f) => f === row.field);
    if (
      !field ||
      !uuid(row.suggestionId) ||
      typeof row.reviewRevision !== 'number' ||
      !Number.isSafeInteger(row.reviewRevision) ||
      row.reviewRevision < 1 ||
      !Array.isArray(row.citations) ||
      row.citations.length < 1 ||
      row.citations.length > 20
    )
      throw new Error('Invalid preparation candidate.');
    const quoted: unknown[] = row.citations;
    const reviewedAt = string(row.reviewedAt, 40);
    if (!Number.isFinite(Date.parse(reviewedAt)))
      throw new Error('Invalid review instant.');
    return {
      field,
      value: insertableString(row.value, limit(field)),
      proposalValue: string(row.proposalValue, 2000),
      suggestionId: row.suggestionId,
      reviewRevision: row.reviewRevision,
      reviewer: string(row.reviewer, 500),
      reviewedAt,
      citations: quoted.map((value) => {
        const reference = citation(value),
          metadata = object(value);
        if (
          typeof metadata.versionNumber !== 'number' ||
          !Number.isSafeInteger(metadata.versionNumber) ||
          metadata.versionNumber < 1
        )
          throw new Error('Invalid cited version.');
        return {
          ...reference,
          documentTitle: string(metadata.documentTitle, 1000),
          fileName: string(metadata.fileName, 255),
          versionNumber: metadata.versionNumber,
        };
      }),
    };
  });
  if (new Set(candidates.map((c) => c.suggestionId)).size !== candidates.length)
    throw new Error('Duplicate preparation candidate.');
  return {
    format: x.format,
    target: {
      caseId: expected.caseId,
      projectId: expected.projectId,
      revision: expected.revision,
      ...(step ? { step } : {}),
    },
    run: { id: expected.runId, snapshotHash: run.snapshotHash },
    candidates,
  };
}
export type DraftPreparation = ReturnType<typeof draftPreparation>;

export function unchangedDraft(
  current: PreparableDraft,
  expected: Partial<PreparableDraft>,
) {
  return PREPARABLE_FIELDS.every(
    (field) =>
      expected[field] === undefined || current[field] === expected[field],
  );
}
