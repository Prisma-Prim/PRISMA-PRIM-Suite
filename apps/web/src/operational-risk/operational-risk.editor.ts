import type { OperationalRiskFacts } from './operational-risk.types';

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
  riskId?: string;
};
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
  if (editor.kind === 'journal') {
    if (
      editor.narrative.trim().length === 0 ||
      editor.narrative.length > 5000 ||
      !validDate(editor.occurredOn)
    )
      return undefined;
    return {
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
      path: '/operational-risks',
      key: crypto.randomUUID(),
      body: JSON.stringify(facts),
    };
  if (editor.reason.trim().length === 0 || editor.reason.length > 2000)
    return undefined;
  return {
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
