import { expect, it } from 'vitest';
import { plan, snapshot } from '../test/mission-applicability-app-fixture';
import { readCopiedTemplatePlan } from './project-template-response';
import {
  readApplicabilityFact,
  readMissionApplicability,
} from './mission-applicability-response';

const copied = readCopiedTemplatePlan({ template: plan })?.template;
if (!copied || !('activities' in copied))
  throw new Error('Expected verified preserved pilot source');
const first = plan.activities[0];
if (!first) throw new Error('Expected first source activity');
const observation = {
  id: 'result-id-demo',
  revision: 1,
  reference: {
    documentId: 'document-demo',
    versionId: 'version-demo',
    versionNumber: 1,
    title: 'Qualified frozen reference DEMO',
    status: 'official',
    representationId: 'pdf-id-demo',
  },
};
function current(value: unknown) {
  const base = snapshot();
  return {
    ...base,
    applicability: {
      ...base.applicability,
      activities: base.applicability.activities.map((activity, index) =>
        index === 0
          ? { ...activity, result: { kind: 'available', current: value } }
          : activity,
      ),
    },
  };
}
const fact = {
  id: 'fact-demo',
  revision: 1,
  kind: 'PROPOSED',
  predecessorId: null,
  activityPredecessorId: null,
  activityKey: first.key,
  source: {
    templateKey: plan.templateKey,
    version: 1,
    title: first.title,
    activity: first.activity,
    intendedResult: first.intendedResult,
  },
  intent: {
    action: 'PROPOSE',
    taskId: first.taskId,
    expectedApplicabilityRevision: 0,
    expectedTaskVersion: 1,
    expectedResultRevision: 1,
    expectedLifecycleRevision: 0,
    reason: 'Reported reason DEMO',
    scopeBasis: 'Reported scope DEMO',
    agreement: {
      kind: 'PARTIES_AGREEMENT_UNAVAILABLE',
      basis: 'Reported unavailable DEMO',
    },
  },
  observedTask: {
    id: first.taskId,
    title: first.title,
    status: 'todo',
    version: 1,
  },
  observedResult: observation,
  observedResultRevision: 1,
  observedLifecycleRevision: 0,
  actor: {
    internalUserId: 'actor-demo',
    workspaceMembershipId: 'membership-demo',
    displayName: 'Actor DEMO',
  },
  capture: { assignmentId: 'coordinator-demo', permissionSetVersion: 'v1' },
  occurredAt: '2026-10-29T00:00:00Z',
};
it('reads exact qualified result metadata in current and immutable history without needing declaration/correction/PDF content', () => {
  const read = readMissionApplicability(current(observation), {
    projectId: snapshot().applicability.project.id,
    plan: copied,
  });
  if (!read || read.kind !== 'available')
    throw new Error('Expected available projection');
  expect(read.activities[0]?.result.current).toEqual(observation);
  expect(readApplicabilityFact(fact, copied).observedResult).toEqual(
    observation,
  );
});
it.each([
  { ...observation, declaration: 'Private declaration DEMO' },
  { ...observation, reason: 'Private correction DEMO' },
  {
    ...observation,
    reference: { ...observation.reference, bytes: '%PDF-private' },
  },
  { ...observation, revision: 0 },
  { ...observation, id: '' },
  { ...observation, reference: { ...observation.reference, status: 'draft' } },
])(
  'refuses copied result prose or malformed qualified metadata in both projections: %j',
  (value) => {
    expect(() =>
      readMissionApplicability(current(value), {
        projectId: snapshot().applicability.project.id,
        plan: copied,
      }),
    ).toThrow();
    expect(() =>
      readApplicabilityFact({ ...fact, observedResult: value }, copied),
    ).toThrow();
  },
);
