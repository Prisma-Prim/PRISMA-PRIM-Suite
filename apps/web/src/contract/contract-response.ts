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
export interface ContractView {
  id: string;
  companyId: string;
  opportunityId: string;
  sourceOfferVersionId: string;
  sourceOffer: { illustrativeReference: number; versionNumber: number };
  illustrativeReference: number;
  revision: number;
  linkedProjects: LinkedProject[];
  version: {
    decisionState: 'PENDING' | 'APPROVED' | 'REJECTED';
    decision: ContractDecisionView | null;
    latestQualityRun: ContractQualityRunView | null;
    id: string;
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
    };
  } & (
    | { executionState: 'NOT_EXECUTED'; signature: null }
    | { executionState: 'EXECUTED'; signature: ContractSignatureView }
  );
}
export function readContractDetail(value: unknown): ContractView | null {
  const input = record(value);
  return input.contract === null ? null : readContract(input.contract);
}
export function readContract(value: unknown): ContractView {
  const input = record(value),
    version = record(input.version),
    recipient = record(version.recipient),
    sourceOffer = record(input.sourceOffer),
    snapshot = record(version.pricingSnapshot);
  if (
    input.kind !== 'CONTRACT' ||
    input.origin !== 'ACCEPTED_OFFER' ||
    typeof input.revision !== 'number' ||
    !Number.isInteger(input.revision) ||
    input.revision < 1 ||
    input.revision > 53 ||
    input.provisional !== true ||
    version.versionNumber !== 1 ||
    (version.decisionState !== 'PENDING' &&
      version.decisionState !== 'APPROVED' &&
      version.decisionState !== 'REJECTED') ||
    (version.executionState !== 'NOT_EXECUTED' &&
      version.executionState !== 'EXECUTED') ||
    version.provenance !== 'ILLUSTRATIVE' ||
    version.provisional !== true ||
    !['PRIMARY', 'ADDITIONAL'].includes(string(recipient.kind)) ||
    !Array.isArray(snapshot.lines) ||
    !Number.isSafeInteger(input.illustrativeReference) ||
    typeof input.illustrativeReference !== 'number' ||
    input.illustrativeReference < 1 ||
    string(version.pricingSnapshotId) !== string(snapshot.id)
  )
    throw new Error('Invalid Contract response.');
  const decision =
    version.decision === null || version.decision === undefined
      ? null
      : readContractDecision(
          version.decision,
          string(version.id),
          nullableDate(version.termEndsOn),
        );
  if (
    (version.decisionState === 'PENDING' &&
      (decision !== null || input.revision !== 1)) ||
    (version.decisionState !== 'PENDING' &&
      (!decision ||
        (version.executionState === 'NOT_EXECUTED' &&
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
  return {
    id: string(input.id),
    revision: positiveInteger(input.revision),
    linkedProjects: readLinkedProjects(
      input.linkedProjects,
      string(input.id),
      input.revision,
    ),
    companyId: string(input.companyId),
    opportunityId: string(input.opportunityId),
    sourceOfferVersionId: string(input.sourceOfferVersionId),
    sourceOffer: {
      illustrativeReference: positiveInteger(sourceOffer.illustrativeReference),
      versionNumber: positiveInteger(sourceOffer.versionNumber),
    },
    illustrativeReference: input.illustrativeReference,
    version: {
      ...execution,
      decision,
      decisionState: version.decisionState,
      id: string(version.id),
      latestQualityRun:
        version.latestQualityRun === null
          ? null
          : readContractQualityRun(
              version.latestQualityRun,
              string(version.id),
              nullableDate(version.termEndsOn),
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
      pricingSnapshot: {
        currency: string(snapshot.currency),
        subtotal: money(snapshot.subtotal),
        taxTotal: money(snapshot.taxTotal),
        total: money(snapshot.total),
        lines: snapshot.lines.map((value) => {
          const line = record(value);
          return {
            serviceName: string(line.serviceName),
            quantity: string(line.quantity),
            lineNet: money(line.adjustedLineNet ?? line.lineNet),
            lineTax: money(line.adjustedLineTax ?? line.lineTax),
          };
        }),
      },
    },
  };
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
