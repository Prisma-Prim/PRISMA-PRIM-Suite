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

const revision = {
  id: 'revision-1',
  index: 1,
  caseRevision: 31,
  reason: 'Correct the English city.',
  revisedOn: '2026-11-07',
  attachmentId: 'certificate-pdf-2',
  texts: [
    {
      language: 'en',
      holderName: 'Lactis Demo SRL',
      address: '1 Example Street, Demo City',
      scope: 'Pasteurised milk production',
    },
  ],
  decisionVersionId: 'decision-1',
  certificateDataVersionId: 'data-1',
  revisionMarked: false,
  independenceAttested: true,
  onBehalf: null,
  recordedBy: actor,
  recordedAt: '2026-11-07T12:00:00.000Z',
  transmission: null,
};

describe('Certificate release response boundary', () => {
  it('preserves exact draft references and an explicit opinion blocker', () => {
    expect(parseCertificateRelease(release)).toEqual({
      ...release,
      revisions: [],
      currentRevisionIndex: null,
      revisionRequired: false,
    });
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
  it('reads immutable revisions and preserves an explicit unmarked answer', () => {
    expect(
      parseCertificateRelease({
        ...release,
        revisions: [revision],
        currentRevisionIndex: 1,
        revisionRequired: false,
      }),
    ).toMatchObject({
      revisions: [revision],
      currentRevisionIndex: 1,
      revisionRequired: false,
    });
  });
  it('defaults absent revision additions for old issued payloads and rejects incomplete or unknown revision states', () => {
    expect(
      parseCertificateRelease(release, { hasCertificate: true }),
    ).toMatchObject({
      revisions: [],
      currentRevisionIndex: 0,
      revisionRequired: false,
    });
    for (const change of [
      { revisions: [] },
      { revisions: [], currentRevisionIndex: 0, revisionRequired: 'pending' },
      { revisions: [], currentRevisionIndex: 1, revisionRequired: false },
      { revisions: [], currentRevisionIndex: null, revisionRequired: true },
      {
        revisions: [{ ...revision, revisionMarked: 'yes' }],
        currentRevisionIndex: 1,
        revisionRequired: false,
      },
      {
        revisions: [{ ...revision, revisionMarked: undefined }],
        currentRevisionIndex: 1,
        revisionRequired: false,
      },
      {
        revisions: [{ ...revision, independenceAttested: false }],
        currentRevisionIndex: 1,
        revisionRequired: false,
      },
      {
        revisions: [{ ...revision, index: 2 }],
        currentRevisionIndex: 2,
        revisionRequired: false,
      },
      {
        revisions: [{ ...revision, reason: '' }],
        currentRevisionIndex: 1,
        revisionRequired: false,
      },
    ])
      expect(() =>
        parseCertificateRelease(
          { ...release, ...change },
          { hasCertificate: true },
        ),
      ).toThrow();
  });

  it('refuses a revision transmission that cites another PDF or carries a received or bundled sending', () => {
    const sent = {
      id: 'exchange-revision',
      sequence: 2,
      version: 1,
      caseRevision: 32,
      direction: 'sent',
      itemKind: 'certificate',
      counterpart: { kind: 'client', name: 'Lactis Demo SRL' },
      businessDate: '2026-11-07',
      channel: 'email',
      reference: null,
      note: null,
      reason: null,
      attachmentIds: ['certificate-pdf-2'],
      recordedBy: actor,
      recordedAt: '2026-11-07T12:30:00.000Z',
    };
    const payload = {
      ...release,
      revisions: [{ ...revision, transmission: sent }],
      currentRevisionIndex: 1,
      revisionRequired: false,
    };
    expect(
      parseCertificateRelease(payload, { hasCertificate: true }).revisions[0]
        ?.transmission?.id,
    ).toBe('exchange-revision');
    for (const change of [
      { direction: 'received' },
      { counterpart: { kind: 'other', name: 'Example' } },
      { attachmentIds: ['another-pdf'] },
    ])
      expect(() =>
        parseCertificateRelease(
          {
            ...payload,
            revisions: [{ ...revision, transmission: { ...sent, ...change } }],
          },
          { hasCertificate: true },
        ),
      ).toThrow();
    expect(() =>
      parseCertificateRelease(
        {
          ...payload,
          revisions: [
            {
              ...revision,
              transmission: {
                ...sent,
                attachmentIds: ['certificate-pdf-2', 'certificate-pdf-3'],
              },
            },
            {
              ...revision,
              id: 'revision-2',
              index: 2,
              caseRevision: 33,
              attachmentId: 'certificate-pdf-3',
            },
          ],
          currentRevisionIndex: 2,
        },
        { hasCertificate: true },
      ),
    ).toThrow();
  });
});
