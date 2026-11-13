import {
  createContinuationCursor,
  type ContinuationCursorBinding,
  type ContinuationCursorKey,
} from '../continuation-cursor/continuation-cursor.js';
import { BadRequestException } from '@nestjs/common';
import {
  fields,
  literalFollowUpDate,
  safeRevision,
} from './opportunity-follow-up.input.js';
import { followUpUuid } from './opportunity-follow-up.representation.js';

export type FollowUpCursorBinding = ContinuationCursorBinding;
export type FollowUpPosition =
  | {
      kind: 'history';
      opportunityId: string;
      headRevision: number;
      before: number;
    }
  | { kind: 'discovery'; through: string; date: string; opportunityId: string };
export function followUpCursors(
  key: ContinuationCursorKey<FollowUpPosition['kind']>,
) {
  return createContinuationCursor<FollowUpPosition>({
    protocol: 'opportunity-follow-up',
    key,
    position: { encode: (position) => position, decode: followUpPosition },
    invalid: () =>
      new BadRequestException(
        'Follow-up continuation is unavailable; restart deliberately.',
      ),
    wrongKind: (kind) =>
      new BadRequestException(
        kind === 'history'
          ? 'Restart follow-up history deliberately.'
          : 'Restart discovery deliberately.',
      ),
  });
}
function followUpPosition(value: unknown): FollowUpPosition {
  const base = fields(
    value,
    ['kind', 'opportunityId'],
    ['headRevision', 'before', 'through', 'date'],
  );
  const opportunityId = followUpUuid(base.opportunityId);
  if (base.kind === 'history') {
    fields(base, ['kind', 'opportunityId', 'headRevision', 'before']);
    const headRevision = safeRevision(base.headRevision, 1),
      before = safeRevision(base.before, 1);
    if (before > headRevision) throw new Error();
    return { kind: 'history', opportunityId, headRevision, before };
  }
  if (base.kind === 'discovery') {
    fields(base, ['kind', 'opportunityId', 'through', 'date']);
    const through = literalFollowUpDate(base.through),
      date = literalFollowUpDate(base.date);
    if (date > through) throw new Error();
    return { kind: 'discovery', opportunityId, through, date };
  }
  throw new Error();
}
