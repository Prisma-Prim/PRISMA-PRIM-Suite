import { requireUuid } from '../access/access-command-validation.js';
import {
  exactRecord,
  modelInteger,
  CONTRACT_MODEL_CODE,
  CONTRACT_MODEL_LANGUAGE,
  readContractModelContent,
  text,
} from './contract-model.content.js';
import {
  invalidStoredModel,
  type ContractModelResult,
  type ContractModelVersionView,
} from './contract-model.view.js';

/** Strict/lossless receipt format, deliberately separate from any HTTP decoder. */
export function readContractModelReceipt(value: unknown): ContractModelResult {
  try {
    const result = exactRecord(value, ['model']);
    const model = exactRecord(result.model, [
      'id',
      'workspaceId',
      'companyId',
      'code',
      'kind',
      'language',
      'revision',
      'head',
      'activeVersion',
    ]);
    if (
      model.code !== CONTRACT_MODEL_CODE ||
      model.kind !== 'CONTRACT' ||
      model.language !== CONTRACT_MODEL_LANGUAGE
    )
      throw invalidStoredModel();
    return {
      model: {
        id: uuid(model.id),
        workspaceId: uuid(model.workspaceId),
        companyId: uuid(model.companyId),
        code: CONTRACT_MODEL_CODE,
        kind: 'CONTRACT',
        language: CONTRACT_MODEL_LANGUAGE,
        revision: modelInteger(model.revision, 1),
        head: version(model.head),
        activeVersion:
          model.activeVersion === null ? null : active(model.activeVersion),
      },
    };
  } catch {
    throw invalidStoredModel();
  }
}

function version(value: unknown): ContractModelVersionView {
  const row = exactRecord(value, [
    'id',
    'versionNumber',
    'predecessorVersionId',
    'content',
    'actor',
    'recordedAt',
    'decision',
    'withdrawal',
  ]);
  const contentRecord = exactRecord(row.content, [
    'sourceKind',
    'sourceDescription',
    'title',
    'serviceTitle',
    'place',
    'issuer',
    'providerDetails',
    'clientDetailsIntroduction',
    'frameworks',
    'sections',
    'signatureAreas',
    'annex',
  ]);
  exactRecord(contentRecord.issuer, [
    'legalName',
    'taxId',
    'legalAddress',
    'contactDetails',
  ]);
  return {
    id: uuid(row.id),
    versionNumber: modelInteger(row.versionNumber, 1),
    predecessorVersionId:
      row.predecessorVersionId === null ? null : uuid(row.predecessorVersionId),
    content: readContractModelContent(row.content),
    ...attributed(row),
    decision: row.decision === null ? null : decision(row.decision),
    withdrawal: row.withdrawal === null ? null : withdrawal(row.withdrawal),
  };
}

function decision(
  value: unknown,
): NonNullable<ContractModelVersionView['decision']> {
  const row = exactRecord(value, [
    'id',
    'outcome',
    'basis',
    'actor',
    'recordedAt',
  ]);
  const outcome = row.outcome;
  if (outcome !== 'APPROVE' && outcome !== 'REJECT') throw invalidStoredModel();
  return {
    id: uuid(row.id),
    outcome,
    basis: text(row.basis, 2_000),
    ...attributed(row),
  };
}
function withdrawal(value: unknown) {
  const row = exactRecord(value, ['id', 'reason', 'actor', 'recordedAt']);
  return {
    id: uuid(row.id),
    reason: text(row.reason, 2_000),
    ...attributed(row),
  };
}
function active(
  value: unknown,
): NonNullable<ContractModelResult['model']['activeVersion']> {
  const row = exactRecord(value, [
    'id',
    'versionNumber',
    'sourceKind',
    'serviceTitle',
  ]);
  const sourceKind = row.sourceKind;
  if (sourceKind !== 'ILLUSTRATIVE' && sourceKind !== 'COMPANY_SUPPLIED')
    throw invalidStoredModel();
  return {
    id: uuid(row.id),
    versionNumber: modelInteger(row.versionNumber, 1),
    sourceKind,
    serviceTitle: text(row.serviceTitle, 300),
  };
}
function attributed(row: Record<string, unknown>) {
  const actor = exactRecord(row.actor, [
    'workspaceMembershipId',
    'internalUserId',
    'displayName',
  ]);
  const recordedAt = row.recordedAt;
  if (
    typeof recordedAt !== 'string' ||
    !Number.isFinite(Date.parse(recordedAt)) ||
    new Date(recordedAt).toISOString() !== recordedAt
  )
    throw invalidStoredModel();
  if (typeof actor.displayName !== 'string') throw invalidStoredModel();
  return {
    actor: {
      workspaceMembershipId: uuid(actor.workspaceMembershipId),
      internalUserId: uuid(actor.internalUserId),
      displayName: actor.displayName,
    },
    recordedAt,
  };
}
function uuid(value: unknown) {
  const id = requireUuid(value);
  if (id !== value) throw invalidStoredModel();
  return id;
}
