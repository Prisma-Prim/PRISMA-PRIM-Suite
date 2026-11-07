import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import { calendarDate, inputObject } from './certification.validation.js';

/**
 * An act performed by the certification body's own staff and recorded by a
 * member of the representative Company: who acted, in which function, on
 * which business date, and the signed form when it is attached to the Case.
 */
export interface ActAttribution {
  actedBy: string;
  actedByFunction: string;
  actedOn: string;
  formAttachmentId: string | null;
}

/** An optional attribution; absent in records made before it existed. */
export function optionalAttribution(value: unknown): ActAttribution | null {
  if (value === undefined || value === null) return null;
  const body = inputObject(value, [
    'actedBy',
    'actedByFunction',
    'actedOn',
    'formAttachmentId',
  ]);
  if (!calendarDate(body.actedOn)) return invalid();
  return {
    actedBy: text(body.actedBy, 200),
    actedByFunction: text(body.actedByFunction, 200),
    actedOn: body.actedOn,
    formAttachmentId:
      body.formAttachmentId === undefined || body.formAttachmentId === null
        ? null
        : requireUuid(body.formAttachmentId),
  };
}

/** A command that must come from outside the audit team carries this attestation. */
export function requireIndependenceAttestation(value: unknown): true {
  if (value !== true)
    throw new BadRequestException({
      code: 'CERTIFICATION_INDEPENDENCE_ATTESTATION',
      message:
        'Attest that the person acting is not a member of the audit team.',
    });
  return true;
}

/** Names compared without case, accents or repeated spaces. */
export function sameName(left: string, right: string): boolean {
  const normal = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/\s+/gu, ' ')
      .trim()
      .toLocaleLowerCase('en');
  return normal(left) === normal(right);
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    return invalid();
  return value;
}

function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_CERTIFICATION_INPUT',
    message: 'Invalid certification input.',
  });
}
