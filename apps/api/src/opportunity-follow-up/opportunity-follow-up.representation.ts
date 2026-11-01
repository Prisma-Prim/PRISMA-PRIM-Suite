import {
  fields,
  literalFollowUpDate,
  literalFollowUpReason,
  safeRevision,
} from './opportunity-follow-up.input.js';
import {
  FOLLOW_UP_FORMAT,
  type FollowUpHead,
  type RecordedFollowUp,
  type FollowUpActor,
  type FollowUpReceipt,
  type FollowUpHistoryEntry,
} from './opportunity-follow-up.types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
export function followUpUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new Error('Invalid follow-up identity.');
  return value;
}
function instant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    new Date(value).toISOString() !== value
  )
    throw new Error('Invalid follow-up attribution time.');
  return value;
}
export function followUpActor(value: unknown): FollowUpActor {
  const actor = fields(value, ['workspaceMembershipId', 'displayLabel']);
  if (
    typeof actor.displayLabel !== 'string' ||
    !actor.displayLabel.trim() ||
    actor.displayLabel.includes('\0')
  )
    throw new Error('Invalid follow-up actor.');
  return {
    workspaceMembershipId: followUpUuid(actor.workspaceMembershipId),
    displayLabel: actor.displayLabel,
  };
}
export function followUpHead(value: unknown): FollowUpHead {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'state' in value &&
    value.state === 'UNRECORDED'
  ) {
    const empty = fields(value, ['state', 'revision']);
    if (empty.revision !== 0) throw new Error('Invalid absent follow-up.');
    return { state: 'UNRECORDED', revision: 0 };
  }
  const fact = fields(value, [
    'state',
    'revision',
    'followUpOn',
    'confirmedEpoch',
    'recordedBy',
    'recordedAt',
  ]);
  if (
    fact.state !== 'RECORDED' ||
    typeof fact.confirmedEpoch !== 'string' ||
    !/^(initial|transition):[0-9a-f-]{36}$/.test(fact.confirmedEpoch)
  )
    throw new Error('Invalid recorded follow-up.');
  followUpUuid(fact.confirmedEpoch.slice(fact.confirmedEpoch.indexOf(':') + 1));
  return {
    state: 'RECORDED',
    revision: safeRevision(fact.revision, 1),
    followUpOn:
      fact.followUpOn === null ? null : literalFollowUpDate(fact.followUpOn),
    confirmedEpoch: fact.confirmedEpoch,
    recordedBy: followUpActor(fact.recordedBy),
    recordedAt: instant(fact.recordedAt),
  };
}
export function recordedFollowUp(value: unknown): RecordedFollowUp {
  const result = followUpHead(value);
  if (result.state !== 'RECORDED')
    throw new Error('Expected a recorded follow-up.');
  return result;
}
export function followUpReceipt(value: unknown): FollowUpReceipt {
  const receipt = fields(value, ['format', 'opportunityId', 'outcome', 'fact']);
  if (
    receipt.format !== FOLLOW_UP_FORMAT ||
    (receipt.outcome !== 'updated' && receipt.outcome !== 'unchanged')
  )
    throw new Error('Unknown follow-up receipt.');
  return {
    format: FOLLOW_UP_FORMAT,
    opportunityId: followUpUuid(receipt.opportunityId),
    outcome: receipt.outcome,
    fact: recordedFollowUp(receipt.fact),
  };
}
export function followUpHistoryEntry(value: unknown): FollowUpHistoryEntry {
  const entry = fields(value, [
    'format',
    'opportunityId',
    'revision',
    'before',
    'after',
    'reason',
    'commandId',
    'actor',
    'occurredAt',
  ]);
  const before = followUpHead(entry.before),
    after = recordedFollowUp(entry.after),
    actor = followUpActor(entry.actor),
    occurredAt = instant(entry.occurredAt),
    reason = literalFollowUpReason(entry.reason),
    revision = safeRevision(entry.revision, 1);
  if (
    entry.format !== FOLLOW_UP_FORMAT ||
    before.revision !== revision - 1 ||
    after.revision !== revision ||
    (before.state === 'RECORDED' &&
      (reason === null ||
        (before.followUpOn === after.followUpOn &&
          before.confirmedEpoch === after.confirmedEpoch))) ||
    JSON.stringify(actor) !== JSON.stringify(after.recordedBy) ||
    occurredAt !== after.recordedAt
  )
    throw new Error('Invalid follow-up history coupling.');
  return {
    format: FOLLOW_UP_FORMAT,
    opportunityId: followUpUuid(entry.opportunityId),
    revision,
    before,
    after,
    reason,
    commandId: followUpUuid(entry.commandId),
    actor,
    occurredAt,
  };
}
