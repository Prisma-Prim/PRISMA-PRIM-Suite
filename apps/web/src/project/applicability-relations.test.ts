import { expect, it } from 'vitest';
import {
  applicabilityRelation,
  resolveApplicabilityRelation,
} from './applicability-relations';
import { readApplicabilityFact } from './mission-applicability-response';
import { readCopiedTemplatePlan } from './project-template-response';
import { plan } from '../test/mission-applicability-app-fixture';
import {
  historyProposal,
  historyDecision,
} from '../test/mission-applicability-history-fixture';
const copied = readCopiedTemplatePlan({ template: plan })?.template;
if (!copied || !('activities' in copied))
  throw new Error('Expected exact preserved source');
const verifiedPlan = copied;
function fact(value: unknown) {
  return readApplicabilityFact(value, verifiedPlan);
}
it.each([
  [
    'wrong kind',
    historyDecision({ revision: 2, index: 0, proposalId: 'fact-1' }),
  ],
  ['different activity', historyProposal({ revision: 3, index: 1 })],
  ['not earlier', historyProposal({ revision: 31, index: 0 })],
])(
  'refuses a known exact ID with %s instead of describing a proposal Version',
  (_label, value) => {
    const candidate = fact(value),
      origin = fact(
        historyDecision({ revision: 30, index: 0, proposalId: candidate.id }),
      ),
      relation = applicabilityRelation(origin);
    if (!relation) throw new Error('Expected explicit proposal reference');
    expect(
      resolveApplicabilityRelation({ origin, relation, facts: [candidate] }),
    ).toEqual({ kind: 'unverified' });
  },
);
it('requires the exact immutable ID and refuses contradictory copies of a known fact', () => {
  const raw = historyProposal({ revision: 4, index: 0 }),
    target = fact(raw),
    origin = fact(
      historyDecision({ revision: 30, index: 0, proposalId: target.id }),
    ),
    relation = applicabilityRelation(origin);
  if (!relation) throw new Error('Expected explicit proposal reference');
  const newer = fact(historyProposal({ revision: 29, index: 0 }));
  expect(
    resolveApplicabilityRelation({ origin, relation, facts: [newer] }),
  ).toEqual({ kind: 'notLoaded' });
  expect(
    resolveApplicabilityRelation({ origin, relation, facts: [target] }),
  ).toEqual({ kind: 'known', fact: target });
  const conflicting = fact({
    ...raw,
    intent: { ...raw.intent, reason: 'Contradictory historical literal DEMO' },
  });
  expect(
    resolveApplicabilityRelation({
      origin,
      relation,
      facts: [target, conflicting],
    }),
  ).toEqual({ kind: 'unverified' });
});
