import {
  readContractDecision,
  type ContractDecisionView,
} from './contract-decision-response';
import {
  readContractQualityRun,
  type ContractQualityRunView,
} from './contract-quality-response';
import {
  readContractSignature,
  type ContractSignatureView,
} from './contract-signature-response';
import {
  readLinkedProjects,
  type LinkedProject,
} from './contract-projects-response';
interface ContentDifference {
  field:
    | 'recipientLegalName'
    | 'recipientTaxId'
    | 'recipientLegalAddress'
    | 'termStartsOn'
    | 'termEndsOn'
    | 'specialConditions'
    | 'preliminaryWorkScope'
    | 'preliminaryFinancialConditions'
    | 'preliminaryLimits'
    | 'changeSummary'
    | 'scopeNote'
    | 'commercialConditions';
  before: string | null;
  after: string | null;
}
export type ContractVersionDifference =
  | ContentDifference
  | {
      field: 'pricingSnapshotId';
      before: string | null;
      after: string | null;
      beforeSnapshot: { id: string; currency: string; total: string } | null;
      afterSnapshot: { id: string; currency: string; total: string } | null;
    };
export interface PreliminaryWorkView {
  scope: string;
  financialConditions: string;
  limits: string;
}
export interface PrecontractSummary {
  id: string;
  illustrativeReference: number;
  versionNumber: number;
  decisionState: 'PENDING' | 'APPROVED' | 'REJECTED';
  executionState: 'NOT_EXECUTED' | 'EXECUTED';
}
interface ContractContent {
  addenda: Array<{
    id: string;
    addendumOrdinal: number;
    illustrativeReference: number;
    versionNumber: number;
    decisionState: 'PENDING' | 'APPROVED' | 'REJECTED';
    executionState: 'NOT_EXECUTED' | 'EXECUTED';
  }>;
  id: string;
  companyId: string;
  opportunityId: string;
  illustrativeReference: number;
  revision: number;
  linkedProjects: LinkedProject[];
  version: {
    decisionState: 'PENDING' | 'APPROVED' | 'REJECTED';
    decision: ContractDecisionView | null;
    latestQualityRun: ContractQualityRunView | null;
    id: string;
    versionNumber: number;
    predecessorVersionId: string | null;
    supersededByVersionId: string | null;
    differences: ContractVersionDifference[];
    recipient: {
      legalName: string;
      taxId: string | null;
      legalAddress: string | null;
    };
    issuingCompanyLabel: string;
    scopeNote: string | null;
    commercialConditions: string | null;
    termStartsOn: string | null;
    termEndsOn: string | null;
    specialConditions: string | null;
    preliminaryWork: PreliminaryWorkView | null;
    changeSummary: string | null;
    pricingSnapshotId: string | null;
    pricingSnapshot: {
      currency: string;
      subtotal: string;
      taxTotal: string;
      total: string;
      lines: Array<{
        serviceName: string;
        quantity: string;
        lineNet: string;
        lineTax: string;
      }>;
    } | null;
  } & (
    | { executionState: 'NOT_EXECUTED'; signature: null }
    | { executionState: 'EXECUTED'; signature: ContractSignatureView }
  );
}
export type ContractView = ContractContent &
  (
    | {
        kind: 'CONTRACT';
        origin: 'ACCEPTED_OFFER';
        parentContractId: null;
        addendumOrdinal: null;
        parent: null;
        precontract: PrecontractReference | null;
        sourceOfferVersionId: string;
        sourceOffer: { illustrativeReference: number; versionNumber: number };
      }
    | {
        kind: 'PRECONTRACT';
        origin: 'ACCEPTED_OFFER';
        parentContractId: null;
        addendumOrdinal: null;
        parent: null;
        precontract: null;
        sourceOfferVersionId: string;
        sourceOffer: { illustrativeReference: number; versionNumber: number };
      }
    | {
        kind: 'CONTRACT';
        origin: 'DIRECT';
        directReason: string;
        parentContractId: null;
        addendumOrdinal: null;
        parent: null;
        precontract: PrecontractReference | null;
        sourceOfferVersionId: null;
        sourceOffer: null;
      }
    | {
        kind: 'ADDENDUM';
        origin: null;
        parentContractId: string;
        addendumOrdinal: number;
        precontract: null;
        parent: {
          id: string;
          kind: 'CONTRACT' | 'PRECONTRACT';
          illustrativeReference: number;
          versionNumber: number;
          revision: number;
        };
        sourceOfferVersionId: null;
        sourceOffer: null;
      }
  );
interface PrecontractReference {
  id: string;
  illustrativeReference: number;
}
export function readContractDetail(value: unknown): ContractView | null {
  const input = record(value);
  return input.contract === null ? null : readContract(input.contract);
}
/** The Opportunity's main Contract and its Precontract summary (PRD 19.13). */
export function readOpportunityContracts(value: unknown): {
  contract: ContractView | null;
  precontract: PrecontractSummary | null;
} {
  const input = record(value);
  const contract = readContractDetail(value);
  if (contract && contract.kind !== 'CONTRACT')
    throw new Error('Invalid main Contract kind.');
  if (input.precontract === null || input.precontract === undefined) {
    if (contract?.precontract) throw new Error('Missing recorded Precontract.');
    return { contract, precontract: null };
  }
  const summary = record(input.precontract);
  const decisionState = summary.decisionState,
    executionState = summary.executionState;
  if (
    (decisionState !== 'PENDING' &&
      decisionState !== 'APPROVED' &&
      decisionState !== 'REJECTED') ||
    (executionState !== 'NOT_EXECUTED' && executionState !== 'EXECUTED') ||
    (executionState === 'EXECUTED' && decisionState !== 'APPROVED')
  )
    throw new Error('Invalid Precontract summary state.');
  const precontract: PrecontractSummary = {
    id: string(summary.id),
    illustrativeReference: positiveInteger(summary.illustrativeReference),
    versionNumber: positiveInteger(summary.versionNumber),
    decisionState,
    executionState,
  };
  if (contract && contract.precontract?.id !== precontract.id)
    throw new Error('Mismatched recorded Precontract.');
  return { contract, precontract };
}
export function readContract(value: unknown): ContractView {
  const input = record(value),
    version = record(input.version),
    recipient = record(version.recipient),
    sourceOffer = input.sourceOffer === null ? null : record(input.sourceOffer),
    snapshot =
      version.pricingSnapshot === null ? null : record(version.pricingSnapshot);
  const isAddendum = input.kind === 'ADDENDUM';
  const isDirect = input.kind === 'CONTRACT' && input.origin === 'DIRECT';
  const isPrecontract = input.kind === 'PRECONTRACT';
  const preliminaryWork =
    version.preliminaryWork === null || version.preliminaryWork === undefined
      ? null
      : readPreliminaryWork(version.preliminaryWork);
  const precontract =
    input.precontract === null || input.precontract === undefined
      ? null
      : readPrecontractReference(input.precontract);
  const parent = isAddendum ? readParent(input.parent) : null;
  const addendum = isAddendum
    ? { pricingSnapshotId: nullableString(version.pricingSnapshotId) }
    : isDirect
      ? ({ origin: 'DIRECT' } as const)
      : undefined;
  if (
    !(
      ((input.kind === 'CONTRACT' || isPrecontract) &&
        input.origin === 'ACCEPTED_OFFER' &&
        sourceOffer !== null &&
        snapshot !== null) ||
      (isDirect &&
        input.sourceOfferId === null &&
        input.sourceOfferVersionId === null &&
        sourceOffer === null &&
        snapshot !== null &&
        input.parentContractId === null &&
        input.addendumOrdinal === null &&
        input.parent === null &&
        typeof input.directReason === 'string' &&
        input.directReason.trim().length > 0 &&
        input.directReason.length <= 500 &&
        typeof version.scopeNote === 'string' &&
        version.scopeNote.trim().length > 0 &&
        version.scopeNote.length <= 2000) ||
      (isAddendum &&
        input.origin === null &&
        input.sourceOfferVersionId === null &&
        input.sourceOfferId === null &&
        sourceOffer === null &&
        parent !== null &&
        input.parentContractId === parent.id &&
        Number.isSafeInteger(input.addendumOrdinal) &&
        typeof input.addendumOrdinal === 'number' &&
        input.addendumOrdinal > 0 &&
        typeof version.changeSummary === 'string' &&
        version.changeSummary.length > 0 &&
        version.changeSummary.length <= 4000)
    ) ||
    typeof input.revision !== 'number' ||
    !Number.isInteger(input.revision) ||
    input.revision < 1 ||
    input.provisional !== true ||
    typeof version.versionNumber !== 'number' ||
    !Number.isSafeInteger(version.versionNumber) ||
    version.versionNumber < 1 ||
    (version.decisionState !== 'PENDING' &&
      version.decisionState !== 'APPROVED' &&
      version.decisionState !== 'REJECTED') ||
    (version.executionState !== 'NOT_EXECUTED' &&
      version.executionState !== 'EXECUTED') ||
    version.provenance !== 'ILLUSTRATIVE' ||
    version.provisional !== true ||
    !['PRIMARY', 'ADDITIONAL'].includes(string(recipient.kind)) ||
    (snapshot !== null && !Array.isArray(snapshot.lines)) ||
    !Number.isSafeInteger(input.illustrativeReference) ||
    typeof input.illustrativeReference !== 'number' ||
    input.illustrativeReference < 1 ||
    (snapshot === null
      ? version.pricingSnapshotId !== null
      : string(version.pricingSnapshotId) !== string(snapshot.id)) ||
    isPrecontract !== (preliminaryWork !== null) ||
    (isPrecontract && version.termEndsOn === null) ||
    (input.kind !== 'CONTRACT' && precontract !== null)
  )
    throw new Error('Invalid Contract response.');
  const createdRevision =
    version.createdContractRevision === undefined && version.versionNumber === 1
      ? 1
      : positiveInteger(version.createdContractRevision);
  const predecessorVersionId =
    version.versionNumber === 1
      ? nullableString(version.predecessorVersionId ?? null)
      : string(version.predecessorVersionId);
  const supersededByVersionId = nullableString(
    version.supersededByVersionId ?? null,
  );
  if (
    createdRevision > input.revision ||
    (version.versionNumber === 1 && predecessorVersionId !== null)
  )
    throw new Error('Invalid Contract lineage.');
  const decision =
    version.decision === null || version.decision === undefined
      ? null
      : readContractDecision(
          version.decision,
          string(version.id),
          nullableDate(version.termEndsOn),
          addendum,
        );
  if (
    (version.decisionState === 'PENDING' &&
      (decision !== null ||
        (!supersededByVersionId && input.revision !== createdRevision))) ||
    (version.decisionState !== 'PENDING' &&
      (!decision ||
        decision.revision !== createdRevision + 1 ||
        (version.executionState === 'NOT_EXECUTED' &&
          !supersededByVersionId &&
          decision.revision !== input.revision) ||
        version.decisionState !==
          (decision.kind === 'APPROVE' ? 'APPROVED' : 'REJECTED')))
  )
    throw new Error('Invalid Contract decision state.');
  const execution =
    version.executionState === 'EXECUTED'
      ? ({
          executionState: 'EXECUTED',
          signature: readContractSignature(version.signature, {
            versionId: string(version.id),
            termEndsOn: nullableDate(version.termEndsOn),
            approval: decision,
            addendum,
          }),
        } as const)
      : ({ executionState: 'NOT_EXECUTED', signature: null } as const);
  if (
    (execution.executionState === 'EXECUTED' &&
      (input.revision < 3 || version.decisionState !== 'APPROVED')) ||
    (execution.executionState === 'NOT_EXECUTED' &&
      version.signature !== null &&
      version.signature !== undefined)
  )
    throw new Error('Invalid Contract execution state.');
  const content: ContractContent = {
    addenda: readAddenda(input.addenda ?? []),
    id: string(input.id),
    revision: positiveInteger(input.revision),
    linkedProjects: readLinkedProjects(
      input.linkedProjects,
      parent?.id ?? string(input.id),
      parent?.revision ?? input.revision,
    ),
    companyId: string(input.companyId),
    opportunityId: string(input.opportunityId),
    illustrativeReference: input.illustrativeReference,
    version: {
      ...execution,
      decision,
      decisionState: version.decisionState,
      id: string(version.id),
      versionNumber: version.versionNumber,
      predecessorVersionId,
      supersededByVersionId,
      differences: readContractDifferences(version.differences ?? []),
      latestQualityRun:
        version.latestQualityRun === null
          ? null
          : readContractQualityRun(
              version.latestQualityRun,
              string(version.id),
              nullableDate(version.termEndsOn),
              addendum,
            ),
      recipient: {
        legalName: string(recipient.legalName),
        taxId: nullableString(recipient.taxId),
        legalAddress: nullableString(recipient.legalAddress),
      },
      issuingCompanyLabel: string(version.issuingCompanyLabel),
      scopeNote: nullableString(version.scopeNote),
      commercialConditions: nullableString(version.commercialConditions),
      termStartsOn: nullableDate(version.termStartsOn),
      termEndsOn: nullableDate(version.termEndsOn),
      specialConditions: nullableString(version.specialConditions),
      preliminaryWork,
      changeSummary: isAddendum ? string(version.changeSummary) : null,
      pricingSnapshotId: nullableString(version.pricingSnapshotId),
      pricingSnapshot: snapshot
        ? {
            currency: string(snapshot.currency),
            subtotal: money(snapshot.subtotal),
            taxTotal: money(snapshot.taxTotal),
            total: money(snapshot.total),
            lines: snapshotLines(snapshot.lines).map((value: unknown) => {
              const line = record(value);
              return {
                serviceName: string(line.serviceName),
                quantity: string(line.quantity),
                lineNet: money(line.adjustedLineNet ?? line.lineNet),
                lineTax: money(line.adjustedLineTax ?? line.lineTax),
              };
            }),
          }
        : null,
    },
  };
  if (isAddendum && parent)
    return {
      ...content,
      kind: 'ADDENDUM',
      origin: null,
      parentContractId: parent.id,
      parent,
      addendumOrdinal: positiveInteger(input.addendumOrdinal),
      precontract: null,
      sourceOfferVersionId: null,
      sourceOffer: null,
    };
  if (isDirect)
    return {
      ...content,
      kind: 'CONTRACT',
      origin: 'DIRECT',
      directReason: string(input.directReason),
      parentContractId: null,
      parent: null,
      addendumOrdinal: null,
      precontract,
      sourceOfferVersionId: null,
      sourceOffer: null,
    };
  if (!sourceOffer) throw new Error('Missing Contract Offer source.');
  const accepted = {
    origin: 'ACCEPTED_OFFER',
    parentContractId: null,
    parent: null,
    addendumOrdinal: null,
    sourceOfferVersionId: string(input.sourceOfferVersionId),
    sourceOffer: {
      illustrativeReference: positiveInteger(sourceOffer.illustrativeReference),
      versionNumber: positiveInteger(sourceOffer.versionNumber),
    },
  } as const;
  return isPrecontract
    ? { ...content, ...accepted, kind: 'PRECONTRACT', precontract: null }
    : { ...content, ...accepted, kind: 'CONTRACT', precontract };
}
function readPreliminaryWork(value: unknown): PreliminaryWorkView {
  const input = record(value);
  if (Object.keys(input).length !== 3)
    throw new Error('Invalid preliminary work.');
  return {
    scope: boundedText(input.scope),
    financialConditions: boundedText(input.financialConditions),
    limits: boundedText(input.limits),
  };
}
function boundedText(value: unknown): string {
  const text = string(value);
  if (text.length > 2000 || !text.trim())
    throw new Error('Invalid preliminary work text.');
  return text;
}
function readPrecontractReference(value: unknown): PrecontractReference {
  const input = record(value);
  return {
    id: string(input.id),
    illustrativeReference: positiveInteger(input.illustrativeReference),
  };
}
function readContractDifferences(value: unknown): ContractVersionDifference[] {
  if (!Array.isArray(value)) throw new Error('Invalid Contract differences.');
  const differences: ContractVersionDifference[] = [];
  for (const item of value) {
    const row = record(item),
      field = row.field;
    if (
      field !== 'recipientLegalName' &&
      field !== 'recipientTaxId' &&
      field !== 'recipientLegalAddress' &&
      field !== 'pricingSnapshotId' &&
      field !== 'termStartsOn' &&
      field !== 'termEndsOn' &&
      field !== 'specialConditions' &&
      field !== 'preliminaryWorkScope' &&
      field !== 'preliminaryFinancialConditions' &&
      field !== 'preliminaryLimits' &&
      field !== 'changeSummary' &&
      field !== 'scopeNote' &&
      field !== 'commercialConditions'
    )
      throw new Error('Invalid Contract difference field.');
    const before = nullableString(row.before),
      after = nullableString(row.after);
    if (before === after || differences.some((entry) => entry.field === field))
      throw new Error('Invalid Contract difference.');
    differences.push(
      field === 'pricingSnapshotId'
        ? {
            field,
            before,
            after,
            beforeSnapshot: readSnapshotDifference(row.beforeSnapshot, before),
            afterSnapshot: readSnapshotDifference(row.afterSnapshot, after),
          }
        : { field, before, after },
    );
  }
  return differences;
}
function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Invalid Contract source reference.');
  return value;
}
export function readAcceptedOfferSource(value: unknown): string | null {
  const input = record(value);
  if (input.offer === null) return null;
  const version = record(record(input.offer).version);
  if (
    version.provenance !== 'ILLUSTRATIVE' ||
    version.provisional !== true ||
    !['PENDING', 'APPROVED', 'REJECTED'].includes(string(version.decisionState))
  )
    throw new Error('Invalid Offer source.');
  return version.clientResponseState === 'ACCEPTED' &&
    version.decisionState === 'APPROVED' &&
    version.supersededByVersionId === null
    ? string(version.id)
    : null;
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid Contract object.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.length)
    throw new Error('Invalid Contract text.');
  return value;
}
function nullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('Invalid Contract text.');
  return value;
}
function nullableDate(value: unknown): string | null {
  const date = nullableString(value);
  if (
    date !== null &&
    (!/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)
  )
    throw new Error('Invalid Contract date.');
  return date;
}
function money(value: unknown): string {
  const amount = string(value);
  if (!/^\d+\.\d{2}$/u.test(amount))
    throw new Error('Invalid Contract amount.');
  return amount;
}

function snapshotLines(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid Snapshot lines.');
  return value;
}
function readParent(
  value: unknown,
): NonNullable<Extract<ContractView, { kind: 'ADDENDUM' }>['parent']> {
  const input = record(value);
  const kind = string(input.kind);
  if (kind !== 'CONTRACT' && kind !== 'PRECONTRACT')
    throw new Error('Invalid Addendum parent kind.');
  return {
    id: string(input.id),
    kind,
    illustrativeReference: positiveInteger(input.illustrativeReference),
    versionNumber: positiveInteger(input.versionNumber),
    revision: positiveInteger(input.revision),
  };
}
function readAddenda(value: unknown): ContractView['addenda'] {
  if (!Array.isArray(value)) throw new Error('Invalid Addenda list.');
  const items: ContractView['addenda'] = [];
  for (const item of value) {
    const input = record(item);
    const decisionState = input.decisionState,
      executionState = input.executionState;
    if (
      (decisionState !== 'PENDING' &&
        decisionState !== 'APPROVED' &&
        decisionState !== 'REJECTED') ||
      (executionState !== 'EXECUTED' && executionState !== 'NOT_EXECUTED') ||
      (executionState === 'EXECUTED' && decisionState !== 'APPROVED')
    )
      throw new Error('Invalid Addendum state.');
    const ordinal = positiveInteger(input.addendumOrdinal);
    if (
      (items.at(-1)?.addendumOrdinal ?? 0) >= ordinal ||
      items.some((entry) => entry.id === input.id)
    )
      throw new Error('Invalid Addendum order.');
    items.push({
      id: string(input.id),
      addendumOrdinal: ordinal,
      illustrativeReference: positiveInteger(input.illustrativeReference),
      versionNumber: positiveInteger(input.versionNumber),
      decisionState,
      executionState,
    });
  }
  return items;
}
export function contractPath(
  opportunityId: string,
  contract: Pick<ContractView, 'id' | 'kind'>,
) {
  return `/contracts/opportunities/${encodeURIComponent(opportunityId)}${contract.kind === 'CONTRACT' ? '' : '/agreements/' + encodeURIComponent(contract.id)}`;
}
export function contractQualityContext(contract: ContractView) {
  return contract.kind === 'ADDENDUM'
    ? { pricingSnapshotId: contract.version.pricingSnapshotId }
    : contract.origin === 'DIRECT'
      ? ({ origin: 'DIRECT' } as const)
      : undefined;
}

function readSnapshotDifference(value: unknown, id: string | null) {
  if (id === null) {
    if (value !== null) throw new Error('Invalid absent Snapshot difference.');
    return null;
  }
  const row = record(value);
  if (row.id !== id) throw new Error('Invalid Snapshot difference target.');
  return { id, currency: string(row.currency), total: money(row.total) };
}
