import type { ActorContext } from '../access/access.types.js';
import {
  CONTRACT_QUALITY_RULES,
  type ContractQualityRuleSetVersion,
} from '../contract/contract-quality.js';
import { canReadContractTarget } from '../contract/contract.read-predicate.js';
import { canReadProjectTargets } from '../project/project.read-predicate.js';
import {
  hasDistinctMembers,
  hasExactly,
  isIdentifier,
  isPlainObject,
  isPositiveInteger,
  isUuid,
} from './recorded-metadata.js';

/**
 * The Contract family of the commercial Activity projection (section 25.1).
 * Each action is recorded by the Contract module under section 19.12;
 * accepting it here adds no producer. An action absent from this list, or
 * persisted metadata outside its recorded shape, fails closed.
 */
const CONTRACT_ACTIVITY_ACTIONS = [
  'contract.created',
  'contract_version.created',
  'contract_version.approved',
  'contract_version.rejected',
  'contract_version.signature_recorded',
  'contract_project.linked',
] as const;

export type ContractActivityAction = (typeof CONTRACT_ACTIVITY_ACTIONS)[number];

export type ContractActivityKind = 'CONTRACT' | 'PRECONTRACT' | 'ADDENDUM';

/**
 * The exact Contract Version an event concerns, superseded or not, named by
 * its Contract's kind and immutable illustrative reference, with the
 * Opportunity and Request that own it. A Contract creation concerns version
 * 1, recorded with it in the same command; a Project link concerns the
 * executed version, the only version a link may follow.
 */
export interface ContractVersionTarget {
  type: 'contract_version';
  contractId: string;
  contractVersionId: string;
  kind: ContractActivityKind;
  illustrativeReference: number;
  versionNumber: number;
  opportunityId: string;
  clientRequestId: string;
  companyId: string;
}

/**
 * The only content a Contract event projects (section 25.2): the target
 * reference, the simulated marker of a signature and, for a Project link,
 * whether the Project was created and the Project's reference. Never an
 * amount, condition, scope, reason, note, signatory label, user-entered date,
 * party identity, Snapshot content or warning.
 */
export type ContractActivityProjection =
  | {
      action:
        | 'contract.created'
        | 'contract_version.created'
        | 'contract_version.approved'
        | 'contract_version.rejected';
      target: ContractVersionTarget;
      metadata: Record<string, never>;
    }
  | {
      action: 'contract_version.signature_recorded';
      target: ContractVersionTarget;
      metadata: { evidenceKind: 'SIMULATED' };
    }
  | {
      action: 'contract_project.linked';
      target: ContractVersionTarget;
      metadata: {
        created: boolean;
        project: { projectId: string; projectTitle: string };
      };
    };

/**
 * The Contract actions one actor may currently see: the opt-in reader bundle
 * and the complete Contract read prerequisite, or none at all. A Project link
 * also needs the actor half of the Project owner's read rule; the query
 * proves each linked Project's Client boundary.
 */
export function eligibleContractActivityActions(
  actor: Pick<ActorContext, 'activeCompany' | 'workspacePermissions'>,
): readonly ContractActivityAction[] {
  const company = actor.activeCompany;
  const permissions = company?.commercialActivityPermissions ?? [];
  if (
    !permissions.includes('commercial.activity.read') ||
    !canReadContractTarget(company)
  )
    return [];
  return canReadProjectTargets(actor)
    ? CONTRACT_ACTIVITY_ACTIONS
    : CONTRACT_ACTIVITY_ACTIONS.filter(
        (action) => action !== 'contract_project.linked',
      );
}

/**
 * One persisted Contract event joined to its current Contract, owning
 * Opportunity and Request, the Contract Version it concerns and, for a
 * Project link, the readable linked Project and the link record. Rows are an external boundary:
 * anything other than exactly the section 19.12 shape of a known action,
 * consistent with the resolved target, is omitted.
 */
export function readContractActivity(
  row: unknown,
): ContractActivityProjection | undefined {
  if (!isPlainObject(row) || !isPlainObject(row.metadata)) return undefined;
  const { metadata } = row;
  const action = CONTRACT_ACTIVITY_ACTIONS.find(
    (candidate) => candidate === row.action,
  );
  const target = versionTarget(row);
  if (!action || !target || metadata.contractId !== target.contractId)
    return undefined;
  if (action === 'contract_project.linked') {
    const { projectId, projectTitle } = row;
    return row.contractVersionId === null &&
      // Only an executed Contract or Precontract is linked (section 19.8,
      // PC16); an Addendum never is, its parent's links apply.
      target.kind !== 'ADDENDUM' &&
      row.executionState === 'EXECUTED' &&
      hasExactly(metadata, ['contractId', 'projectId', 'created']) &&
      typeof metadata.created === 'boolean' &&
      // The recorded link's own creation flag.
      metadata.created === row.linkCreated &&
      isIdentifier(projectId) &&
      metadata.projectId === projectId &&
      typeof projectTitle === 'string'
      ? {
          action,
          target,
          metadata: {
            created: metadata.created,
            project: { projectId, projectTitle },
          },
        }
      : undefined;
  }
  const source = sourceFields(metadata);
  if (
    !source ||
    metadata.kind !== target.kind ||
    !recordsResolvedSource(metadata, row) ||
    metadata.provenance !== 'ILLUSTRATIVE'
  )
    return undefined;
  if (action === 'contract.created')
    return row.contractVersionId === null &&
      target.versionNumber === 1 &&
      hasExactly(metadata, [
        'contractId',
        'illustrativeReference',
        'provenance',
        ...source,
      ]) &&
      metadata.illustrativeReference === target.illustrativeReference
      ? { action, target, metadata: {} }
      : undefined;
  if (
    row.contractVersionId !== target.contractVersionId ||
    metadata.contractVersionId !== target.contractVersionId ||
    metadata.versionNumber !== target.versionNumber ||
    // The resolved version's immutable Snapshot, or none for both.
    (metadata.pricingSnapshotId ?? null) !== row.pricingSnapshotId
  )
    return undefined;
  const identity = [
    'contractId',
    'contractVersionId',
    'versionNumber',
    'provenance',
    ...source,
    // The Snapshot id is recorded only when the version references one.
    ...(isUuid(metadata.pricingSnapshotId) ? ['pricingSnapshotId'] : []),
  ];
  switch (action) {
    case 'contract_version.created':
      return (
        target.versionNumber === 1
          ? hasExactly(metadata, identity)
          : hasExactly(metadata, [...identity, 'predecessorVersionNumber']) &&
            metadata.predecessorVersionNumber === target.versionNumber - 1
      )
        ? { action, target, metadata: {} }
        : undefined;
    case 'contract_version.approved':
      return hasExactly(metadata, [...identity, ...BINDING_FIELDS]) &&
        recordsBinding(metadata)
        ? { action, target, metadata: {} }
        : undefined;
    case 'contract_version.rejected':
      return hasExactly(metadata, identity)
        ? { action, target, metadata: {} }
        : undefined;
    case 'contract_version.signature_recorded':
      return hasExactly(metadata, [
        ...identity,
        ...BINDING_FIELDS,
        'evidenceKind',
      ]) &&
        metadata.evidenceKind === 'SIMULATED' &&
        recordsBinding(metadata)
        ? { action, target, metadata: { evidenceKind: 'SIMULATED' } }
        : undefined;
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

const BINDING_FIELDS = ['ruleSetVersion', 'acknowledgedWarningCodes'] as const;

/** The closed vocabulary of acknowledgeable Contract Quality Check warnings. */
const CONTRACT_WARNING_CODES = Object.entries(CONTRACT_QUALITY_RULES).flatMap(
  ([code, severity]) => (severity === 'WARNING' ? [code] : []),
);

/** The Contract Version and owners the query resolved for the event. */
function versionTarget(
  row: Record<string, unknown>,
): ContractVersionTarget | undefined {
  const {
    contractId,
    resolvedContractVersionId,
    kind,
    illustrativeReference,
    versionNumber,
    opportunityId,
    clientRequestId,
    companyId,
  } = row;
  return isIdentifier(contractId) &&
    isIdentifier(resolvedContractVersionId) &&
    (kind === 'CONTRACT' || kind === 'PRECONTRACT' || kind === 'ADDENDUM') &&
    isPositiveInteger(illustrativeReference) &&
    isPositiveInteger(versionNumber) &&
    isIdentifier(opportunityId) &&
    isIdentifier(clientRequestId) &&
    isIdentifier(companyId)
    ? {
        type: 'contract_version',
        contractId,
        contractVersionId: resolvedContractVersionId,
        kind,
        illustrativeReference,
        versionNumber,
        opportunityId,
        clientRequestId,
        companyId,
      }
    : undefined;
}

/**
 * The recorded source of a Contract, Precontract or Addendum (section 19.12):
 * a direct Contract, a Contract or Precontract from an accepted Offer Version,
 * or an Addendum to its parent with its ordinal. Neither value is projected.
 */
function sourceFields(
  metadata: Record<string, unknown>,
): readonly string[] | undefined {
  const { kind, origin } = metadata;
  if (kind === 'CONTRACT' && origin === 'DIRECT') return ['kind', 'origin'];
  if (
    (kind === 'CONTRACT' || kind === 'PRECONTRACT') &&
    origin === 'ACCEPTED_OFFER' &&
    isUuid(metadata.offerVersionId)
  )
    return ['kind', 'origin', 'offerVersionId'];
  if (
    kind === 'ADDENDUM' &&
    isUuid(metadata.parentContractId) &&
    isPositiveInteger(metadata.addendumOrdinal)
  )
    return ['kind', 'parentContractId', 'addendumOrdinal'];
  return undefined;
}

/**
 * The recorded source equals the resolved Contract's immutable source: its
 * origin and accepted Offer Version, or an Addendum's parent and ordinal.
 * A field the kind does not record must be absent on both sides.
 */
function recordsResolvedSource(
  metadata: Record<string, unknown>,
  row: Record<string, unknown>,
): boolean {
  return (
    (metadata.origin ?? null) === row.origin &&
    (metadata.offerVersionId ?? null) === row.sourceOfferVersionId &&
    (metadata.parentContractId ?? null) === row.parentContractId &&
    (metadata.addendumOrdinal ?? null) === row.addendumOrdinal
  );
}

/**
 * A known rule set version and a list of distinct acknowledgeable warning
 * codes, the closed vocabulary the Contract module records; neither is
 * projected.
 */
function recordsBinding(metadata: Record<string, unknown>): boolean {
  const { ruleSetVersion, acknowledgedWarningCodes } = metadata;
  return (
    isRuleSetVersion(ruleSetVersion) &&
    hasDistinctMembers(acknowledgedWarningCodes, CONTRACT_WARNING_CODES)
  );
}

function isRuleSetVersion(
  value: unknown,
): value is ContractQualityRuleSetVersion {
  return value === 1 || value === 2;
}
