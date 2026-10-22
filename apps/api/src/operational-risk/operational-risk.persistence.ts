import type {
  operationalRiskEntries,
  operationalRisks,
} from '../database/schema/index.js';
import type {
  OperationalRiskEntry,
  OperationalRiskIntake,
  OperationalRiskRecord,
  OperationalRiskResult,
} from './operational-risk.types.js';
import {
  object,
  optionalDate,
  readOperationalRiskIntake,
  revision,
  text,
  uuid,
} from './operational-risk.validation.js';

export function readOperationalRiskEntry(
  row: typeof operationalRiskEntries.$inferSelect,
): OperationalRiskEntry {
  return stored(() => {
    const payload = object(row.payload);
    const common = {
      id: row.id,
      revision: row.revision,
      actor: {
        workspaceMembershipId: row.actorMembershipId,
        displayName: row.actorDisplayName,
      },
      recordedAt: row.recordedAt.toISOString(),
    };
    if (row.kind === 'intake-recorded') {
      exact(payload, ['facts']);
      if (row.predecessorId !== null || row.predecessorRevision !== null)
        corrupt();
      return entry({
        ...common,
        kind: row.kind,
        facts: payload.facts,
        predecessorId: null,
        reason: null,
      });
    }
    if (row.kind === 'intake-corrected') {
      exact(payload, ['facts', 'reason']);
      if (
        row.predecessorRevision === null ||
        row.predecessorRevision >= row.revision
      )
        corrupt();
      return entry({
        ...common,
        kind: row.kind,
        facts: payload.facts,
        predecessorId: row.predecessorId,
        reason: payload.reason,
      });
    }
    if (row.kind !== 'observation' && row.kind !== 'reassessment')
      return corrupt();
    exact(payload, ['narrative', 'occurredOn']);
    if (row.predecessorId !== null || row.predecessorRevision !== null)
      corrupt();
    return entry({
      ...common,
      kind: row.kind,
      narrative: payload.narrative,
      occurredOn: payload.occurredOn,
    });
  });
}

export function buildOperationalRiskRecord({
  row,
  original,
  current,
}: {
  row: typeof operationalRisks.$inferSelect;
  original: OperationalRiskEntry;
  current: OperationalRiskEntry;
}): OperationalRiskRecord {
  return stored(() => {
    if (
      original.kind !== 'intake-recorded' ||
      original.revision !== 1 ||
      !intake(current) ||
      current.revision !== row.currentIntakeRevision ||
      current.revision > row.revision
    )
      return corrupt();
    if (original.recordedAt !== row.createdAt.toISOString()) corrupt();
    return {
      id: uuid(row.id),
      companyId: uuid(row.companyId),
      revision: revision(row.revision),
      createdAt: row.createdAt.toISOString(),
      assessment: 'not-assessed',
      responsibility: 'not-specified',
      originalIntake: original,
      currentIntake: current,
    };
  });
}

/** Validates the durable response boundary while still inside the transaction. */
export function readOperationalRiskResult(
  value: unknown,
  expected: { companyId: string; riskId?: string },
): OperationalRiskResult {
  return stored(() => {
    const body = object(value);
    exact(body, ['risk', 'entry']);
    const risk = record(body.risk);
    const resultEntry = entry(body.entry);
    if (
      risk.companyId !== expected.companyId ||
      (expected.riskId !== undefined && risk.id !== expected.riskId) ||
      resultEntry.revision !== risk.revision
    )
      return corrupt();
    if (intake(resultEntry) && resultEntry.id !== risk.currentIntake.id)
      corrupt();
    return { risk, entry: resultEntry };
  });
}

function record(value: unknown): OperationalRiskRecord {
  const body = object(value);
  exact(body, [
    'id',
    'companyId',
    'revision',
    'createdAt',
    'assessment',
    'responsibility',
    'originalIntake',
    'currentIntake',
  ]);
  const original = entry(body.originalIntake);
  const current = entry(body.currentIntake);
  const aggregateRevision = revision(body.revision);
  if (
    body.assessment !== 'not-assessed' ||
    body.responsibility !== 'not-specified' ||
    original.kind !== 'intake-recorded' ||
    original.revision !== 1 ||
    !intake(current) ||
    current.revision > aggregateRevision
  )
    return corrupt();
  const createdAt = instant(body.createdAt);
  if (
    original.recordedAt !== createdAt ||
    (current.kind === 'intake-recorded' && current.id !== original.id)
  )
    corrupt();
  return {
    id: uuid(body.id),
    companyId: uuid(body.companyId),
    revision: aggregateRevision,
    createdAt,
    assessment: 'not-assessed',
    responsibility: 'not-specified',
    originalIntake: original,
    currentIntake: current,
  };
}

function entry(value: unknown): OperationalRiskEntry {
  const body = object(value);
  const actor = object(body.actor);
  exact(actor, ['workspaceMembershipId', 'displayName']);
  const common = {
    id: uuid(body.id),
    revision: revision(body.revision),
    actor: {
      workspaceMembershipId: uuid(actor.workspaceMembershipId),
      displayName: text(actor.displayName, 10000),
    },
    recordedAt: instant(body.recordedAt),
  };
  const commonKeys = ['id', 'revision', 'actor', 'recordedAt', 'kind'];
  if (body.kind === 'intake-recorded') {
    exact(body, [...commonKeys, 'facts', 'predecessorId', 'reason']);
    if (
      common.revision !== 1 ||
      body.predecessorId !== null ||
      body.reason !== null
    )
      return corrupt();
    return {
      ...common,
      kind: body.kind,
      facts: readOperationalRiskIntake(body.facts),
      predecessorId: null,
      reason: null,
    };
  }
  if (body.kind === 'intake-corrected') {
    exact(body, [...commonKeys, 'facts', 'predecessorId', 'reason']);
    if (common.revision <= 1) corrupt();
    return {
      ...common,
      kind: body.kind,
      facts: readOperationalRiskIntake(body.facts),
      predecessorId: uuid(body.predecessorId),
      reason: text(body.reason, 2000),
    };
  }
  if (body.kind !== 'observation' && body.kind !== 'reassessment')
    return corrupt();
  exact(body, [...commonKeys, 'narrative', 'occurredOn']);
  if (common.revision <= 1) corrupt();
  return {
    ...common,
    kind: body.kind,
    narrative: text(body.narrative, 5000),
    occurredOn: optionalDate(body.occurredOn),
  };
}

function intake(value: OperationalRiskEntry): value is OperationalRiskIntake {
  return value.kind === 'intake-recorded' || value.kind === 'intake-corrected';
}

function instant(value: unknown): string {
  if (typeof value !== 'string') return corrupt();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value)
    return corrupt();
  return value;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    corrupt();
}

function stored<Value>(read: () => Value): Value {
  try {
    return read();
  } catch {
    return corrupt();
  }
}

function corrupt(): never {
  throw new Error('The stored operational Risk result is invalid.');
}
