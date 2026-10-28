import type {
  OperationalRiskFacts,
  OperationalRiskJournalOriginal,
} from './operational-risk.types';

const requiredFactFields = [
  'process',
  'cause',
  'effect',
  'plannedMeasure',
] as const;
export const factFields = [
  'process',
  'cause',
  'effect',
  'plannedMeasure',
  'existingMeasures',
  'sourceDescription',
  'plannedDate',
] as const;
export type FactsDraft = Record<(typeof factFields)[number], string>;
export type Editor =
  | { kind: 'record'; facts: FactsDraft }
  | {
      kind: 'correct';
      riskId: string;
      expectedRevision: number;
      predecessorId: string;
      facts: FactsDraft;
      reason: string;
    }
  | {
      kind: 'journal-correct';
      riskId: string;
      originalEntry: OperationalRiskJournalOriginal;
      expectedRevision: number;
      predecessorId: string;
      narrative: string;
      occurredOn: string;
      reason: string;
      baseline: { narrative: string; occurredOn: string | null };
    }
  | {
      kind: 'journal';
      riskId: string;
      expectedRevision: number;
      entryKind: 'observation' | 'reassessment';
      narrative: string;
      occurredOn: string;
    };
export type Command = {
  path: string;
  body: string;
  key: string;
} & (
  | { kind: 'record' }
  | { kind: 'journal' | 'correct'; riskId: string }
  | {
      kind: 'journal-correct';
      riskId: string;
      journalEntryId: string;
      journalKind: 'observation' | 'reassessment';
    }
);
export function emptyFacts(): FactsDraft {
  return {
    process: '',
    cause: '',
    effect: '',
    plannedMeasure: '',
    existingMeasures: '',
    sourceDescription: '',
    plannedDate: '',
  };
}
export function draftFacts(facts: OperationalRiskFacts): FactsDraft {
  return {
    ...facts,
    existingMeasures: facts.existingMeasures ?? '',
    sourceDescription: facts.sourceDescription ?? '',
    plannedDate: facts.plannedDate ?? '',
  };
}
export function commandFrom(editor: Editor): Command | undefined {
  if (editor.kind === 'journal' || editor.kind === 'journal-correct') {
    if (
      editor.narrative.trim().length === 0 ||
      editor.narrative.length > 5000 ||
      !validDate(editor.occurredOn)
    )
      return undefined;
    if (editor.kind === 'journal-correct') {
      if (
        editor.reason.trim().length === 0 ||
        editor.reason.length > 2000 ||
        (editor.narrative === editor.baseline.narrative &&
          (editor.occurredOn || null) === editor.baseline.occurredOn)
      )
        return undefined;
      return {
        kind: editor.kind,
        riskId: editor.riskId,
        journalEntryId: editor.originalEntry.id,
        journalKind: editor.originalEntry.kind,
        path: `/operational-risks/${encodeURIComponent(editor.riskId)}/journal/${encodeURIComponent(editor.originalEntry.id)}/corrections`,
        key: crypto.randomUUID(),
        body: JSON.stringify({
          expectedRevision: editor.expectedRevision,
          predecessorId: editor.predecessorId,
          narrative: editor.narrative,
          occurredOn: editor.occurredOn || null,
          reason: editor.reason,
        }),
      };
    }
    return {
      kind: editor.kind,
      path: `/operational-risks/${encodeURIComponent(editor.riskId)}/journal`,
      riskId: editor.riskId,
      key: crypto.randomUUID(),
      body: JSON.stringify({
        expectedRevision: editor.expectedRevision,
        kind: editor.entryKind,
        narrative: editor.narrative,
        occurredOn: editor.occurredOn || null,
      }),
    };
  }
  if (
    !requiredFactFields.every((name) => {
      const value = editor.facts[name];
      return typeof value === 'string' && value.trim().length > 0;
    }) ||
    editor.facts.process.length > 300 ||
    editor.facts.cause.length > 2000 ||
    editor.facts.effect.length > 2000 ||
    editor.facts.plannedMeasure.length > 2000 ||
    editor.facts.existingMeasures.length > 2000 ||
    editor.facts.sourceDescription.length > 300 ||
    !validDate(editor.facts.plannedDate)
  )
    return undefined;
  const facts = {
    ...editor.facts,
    existingMeasures: editor.facts.existingMeasures || null,
    sourceDescription: editor.facts.sourceDescription || null,
    plannedDate: editor.facts.plannedDate || null,
  };
  if (editor.kind === 'record')
    return {
      kind: editor.kind,
      path: '/operational-risks',
      key: crypto.randomUUID(),
      body: JSON.stringify(facts),
    };
  if (editor.reason.trim().length === 0 || editor.reason.length > 2000)
    return undefined;
  return {
    kind: editor.kind,
    path: `/operational-risks/${encodeURIComponent(editor.riskId)}/intake-corrections`,
    riskId: editor.riskId,
    key: crypto.randomUUID(),
    body: JSON.stringify({
      ...facts,
      expectedRevision: editor.expectedRevision,
      predecessorId: editor.predecessorId,
      reason: editor.reason,
    }),
  };
}
function validDate(value: string): boolean {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
