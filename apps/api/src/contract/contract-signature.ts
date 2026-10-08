import { BadRequestException } from '@nestjs/common';
import { readContractWarningCodes } from './contract-decision.js';
import type {
  ContractQualityCode,
  ContractQualityRun,
} from './contract-quality.js';

export interface ContractSignatureCommand {
  readonly expectedContractRevision: number;
  readonly providerSignatoryLabel: string;
  readonly clientSignatoryLabel: string;
  readonly providerSignedOn: string;
  readonly clientSignedOn: string;
  readonly note: string | null;
  readonly acknowledgedWarningCodes: readonly ContractQualityCode[];
}
export interface ContractSignature {
  readonly id: string;
  readonly contractVersionId: string;
  readonly revision: 3;
  readonly evidenceKind: 'SIMULATED';
  readonly provenance: 'ILLUSTRATIVE';
  readonly provisional: true;
  readonly actorWorkspaceMembershipId: string;
  readonly recordedAt: string;
  readonly providerSignatoryLabel: string;
  readonly clientSignatoryLabel: string;
  readonly providerSignedOn: string;
  readonly clientSignedOn: string;
  readonly note: string | null;
  readonly qualityRun: ContractQualityRun;
  readonly acknowledgedWarningCodes: readonly ContractQualityCode[];
  readonly representationChecksum: string;
}
export function readContractSignatureCommand(
  value: unknown,
): ContractSignatureCommand {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body');
  const input: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  for (const key of Object.keys(input))
    if (
      ![
        'expectedContractRevision',
        'providerSignatoryLabel',
        'clientSignatoryLabel',
        'providerSignedOn',
        'clientSignedOn',
        'note',
        'acknowledgedWarningCodes',
      ].includes(key)
    )
      throw invalid(key);
  if (
    typeof input.expectedContractRevision !== 'number' ||
    !Number.isSafeInteger(input.expectedContractRevision) ||
    input.expectedContractRevision < 1
  )
    throw invalid('expectedContractRevision');
  return {
    expectedContractRevision: input.expectedContractRevision,
    providerSignatoryLabel: label(
      input.providerSignatoryLabel,
      'providerSignatoryLabel',
    ),
    clientSignatoryLabel: label(
      input.clientSignatoryLabel,
      'clientSignatoryLabel',
    ),
    providerSignedOn: calendarDate(input.providerSignedOn, 'providerSignedOn'),
    clientSignedOn: calendarDate(input.clientSignedOn, 'clientSignedOn'),
    note: optionalNote(input.note),
    acknowledgedWarningCodes: readContractWarningCodes(
      input.acknowledgedWarningCodes,
    ),
  };
}
function label(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Array.from(value).length > 200 ||
    value.includes('\0')
  )
    throw invalid(field);
  return value;
}
function optionalNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'string' ||
    Array.from(value).length > 500 ||
    value.includes('\0')
  )
    throw invalid('note');
  return value;
}
function calendarDate(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    !Number.isFinite(Date.parse(value + 'T00:00:00.000Z')) ||
    new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) !== value
  )
    throw invalid(field);
  return value;
}
export function requireSigningDateRange(input: {
  command: ContractSignatureCommand;
  approvedAt: string;
  recordedAt: Date;
}): void {
  const earliest = input.approvedAt.slice(0, 10),
    latest = input.recordedAt.toISOString().slice(0, 10);
  for (const field of ['providerSignedOn', 'clientSignedOn'] as const)
    if (input.command[field] < earliest || input.command[field] > latest)
      throw invalid(field);
}
function invalid(field: string) {
  return new BadRequestException({ code: 'INVALID_CONTRACT_INPUT', field });
}
