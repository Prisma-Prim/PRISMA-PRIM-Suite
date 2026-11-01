import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import {
  fields,
  literalFollowUpDate,
  safeRevision,
} from './opportunity-follow-up.input.js';
import { followUpUuid } from './opportunity-follow-up.representation.js';

export type FollowUpCursorBinding = {
  workspaceId: string;
  companyId: string;
  actorMembershipId: string;
  readCapture: string;
};
export type FollowUpPosition =
  | {
      kind: 'history';
      opportunityId: string;
      headRevision: number;
      before: number;
    }
  | { kind: 'discovery'; through: string; date: string; opportunityId: string };
export function followUpCursor(
  key: string,
  binding: FollowUpCursorBinding,
  position: FollowUpPosition,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      format: 'opportunity-follow-up-cursor.v1',
      ...binding,
      ...position,
    }),
  ).toString('base64url');
  return (
    payload +
    '.' +
    createHmac('sha256', key).update(payload).digest('base64url')
  );
}
export function readFollowUpCursor(
  key: string,
  value: string,
  binding: FollowUpCursorBinding,
): FollowUpPosition {
  try {
    if (value.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))
      throw new Error();
    const [payload, signature] = value.split('.');
    if (!payload || !signature) throw new Error();
    const expected = createHmac('sha256', key).update(payload).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (
      expected.length !== supplied.length ||
      supplied.toString('base64url') !== signature ||
      Buffer.from(payload, 'base64url').toString('base64url') !== payload ||
      !timingSafeEqual(expected, supplied)
    )
      throw new Error();
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    const base = fields(
      parsed,
      [
        'format',
        'workspaceId',
        'companyId',
        'actorMembershipId',
        'readCapture',
        'kind',
        'opportunityId',
      ],
      ['headRevision', 'before', 'through', 'date'],
    );
    if (
      base.format !== 'opportunity-follow-up-cursor.v1' ||
      base.workspaceId !== binding.workspaceId ||
      base.companyId !== binding.companyId ||
      base.actorMembershipId !== binding.actorMembershipId ||
      base.readCapture !== binding.readCapture
    )
      throw new Error();
    const opportunityId = followUpUuid(base.opportunityId);
    if (base.kind === 'history') {
      fields(base, [
        'format',
        'workspaceId',
        'companyId',
        'actorMembershipId',
        'readCapture',
        'kind',
        'opportunityId',
        'headRevision',
        'before',
      ]);
      const headRevision = safeRevision(base.headRevision, 1),
        before = safeRevision(base.before, 1);
      if (before > headRevision) throw new Error();
      return { kind: 'history', opportunityId, headRevision, before };
    }
    if (base.kind === 'discovery') {
      fields(base, [
        'format',
        'workspaceId',
        'companyId',
        'actorMembershipId',
        'readCapture',
        'kind',
        'opportunityId',
        'through',
        'date',
      ]);
      const through = literalFollowUpDate(base.through),
        date = literalFollowUpDate(base.date);
      if (date > through) throw new Error();
      return { kind: 'discovery', opportunityId, through, date };
    }
    throw new Error();
  } catch {
    throw new BadRequestException(
      'Follow-up continuation is unavailable; restart deliberately.',
    );
  }
}
