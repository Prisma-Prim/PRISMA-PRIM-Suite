import { describe, expect, it } from 'vitest';
import { parseCertificateRelease } from './certification-release';

const actor = {
  workspaceMembershipId: 'member',
  displayName: 'Synthetic manager',
};
const draft = {
  id: 'draft-1',
  version: 1,
  caseRevision: 25,
  reason: null,
  recordedBy: actor,
  recordedAt: '2026-11-06T12:00:00.000Z',
  value: {
    attachmentId: 'pdf-1',
    number: 'DEMO-0001',
    decisionVersionId: 'decision-1',
    certificateDataVersionId: 'data-1',
    draftedOn: '2026-11-06',
  },
};
const release = {
  validity: null,
  drafts: [draft],
  opinions: [],
  approvals: [],
  currentDraftId: 'draft-1',
  outdated: false,
  approvalBlockers: ['opinion_missing'],
  issuanceBlockers: ['opinion_missing', 'approval_missing'],
  transmission: null,
  daysSinceIssuance: null,
  legacyIssuance: false,
};

describe('Certificate release response boundary', () => {
  it('preserves exact draft references and an explicit opinion blocker', () => {
    expect(parseCertificateRelease(release)).toEqual(release);
    expect(() =>
      parseCertificateRelease({ ...release, currentDraftId: 'foreign-draft' }),
    ).toThrow();
    expect(() =>
      parseCertificateRelease({
        ...release,
        approvalBlockers: ['automatic_approval'],
      }),
    ).toThrow();
  });
});
