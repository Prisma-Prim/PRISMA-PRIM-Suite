import { describe, expect, it } from 'vitest';
import {
  canAccept,
  canCorrect,
  canRecordDiscrepancy,
  emptyManualDraft,
  manualFromDraft,
  parseBlockingDiscrepancies,
  parseConsistency,
  resolutionFromDraft,
  type Discrepancy,
} from './certification-consistency';

const member = { workspaceMembershipId: 'member-1', displayName: 'Ana Demo' };
const RULE_ID = `R04:${'b'.repeat(32)}`;

function openRule(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    origin: 'rule',
    rule: 'R04',
    subject: { kind: 'stage_capacity', stage: 'stage_2' },
    verdict: 'to_clarify',
    left: {
      value: { kind: 'days', days: '2' },
      detail: null,
      source: {
        kind: 'step',
        step: 'stage_2_plan',
        version: 1,
        versionId: 'plan-version',
        attachment: {
          attachmentId: 'attachment-1',
          documentId: 'document-1',
          versionId: 'version-1',
          versionNumber: 1,
          sourceTitle: 'Stage 2 plan',
        },
      },
    },
    right: {
      value: { kind: 'capacity', calendarDays: 1, auditors: 1 },
      detail: null,
      source: null,
    },
    openedRevision: 14,
    opened: { by: member, at: '2026-11-07T08:00:00.000Z' },
    endedRevision: null,
    status: 'open',
    blocks: null,
    resolution: null,
    ...overrides,
  };
}

function section(open: unknown[], resolved: unknown[] = []) {
  const verdicts = (verdict: string) =>
    open.filter(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'verdict' in entry &&
        entry.verdict === verdict,
    ).length;
  return {
    ruleSetVersion: 'dossier-consistency-2026-11',
    counts: {
      critical: verdicts('critical'),
      error: verdicts('error'),
      toClarify: verdicts('to_clarify'),
    },
    open,
    resolved,
    resolvedTotal: resolved.length,
  };
}

function parsedOpen(overrides: Record<string, unknown> = {}): Discrepancy {
  const [entry] = parseConsistency(section([openRule(overrides)])).open;
  if (!entry) throw new Error('Expected a Discrepancy.');
  return entry;
}

describe('Dossier consistency section', () => {
  it('reads open and resolved Discrepancies with their values, sources and resolutions', () => {
    const resolved = {
      ...openRule(),
      id: `manual:${'1'.repeat(8)}-1111-4111-8111-${'1'.repeat(12)}`,
      origin: 'manual',
      rule: null,
      sequence: 1,
      subject: { kind: 'manual', text: 'Stage type' },
      note: null,
      left: {
        value: { kind: 'text', text: 'Stage 1' },
        detail: 'page 1',
        source: null,
      },
      status: 'resolved',
      blocks: null,
      resolution: {
        kind: 'accepted',
        via: 'acceptance',
        reason: 'The signed PDF prevails.',
        by: member,
        at: '2026-11-07T09:00:00.000Z',
        caseRevision: 16,
        ruleSetVersion: 'dossier-consistency-2026-11',
      },
    };
    const parsed = parseConsistency(section([openRule()], [resolved]));
    expect(parsed.counts).toEqual({ critical: 0, error: 0, toClarify: 1 });
    expect(parsed.open[0]).toMatchObject({
      rule: 'R04',
      subject: { kind: 'stage_capacity', stage: 'stage_2' },
      left: { source: { attachment: { sourceTitle: 'Stage 2 plan' } } },
    });
    expect(parsed.resolved[0]).toMatchObject({
      origin: 'manual',
      subject: 'Stage type',
      resolution: { kind: 'accepted', reason: 'The signed PDF prevails.' },
    });
  });

  it.each([
    ['an unknown rule', section([openRule({ rule: 'R99' })])],
    ['an unknown verdict', section([openRule({ verdict: 'warning' })])],
    [
      'an unknown value',
      section([
        openRule({
          left: { value: { kind: 'money' }, detail: null, source: null },
        }),
      ]),
    ],
    ['a "to clarify" that blocks', section([openRule({ blocks: 'decision' })])],
    [
      'counts that differ from the open list',
      {
        ...section([openRule()]),
        counts: { critical: 0, error: 1, toClarify: 0 },
      },
    ],
    [
      'a resolved Discrepancy listed as open',
      section([openRule({ status: 'resolved' })]),
    ],
  ])('fails closed on %s', (_name, value) => {
    expect(() => parseConsistency(value)).toThrow();
  });

  it('offers acceptance by verdict and role, and correction only of a manual one', () => {
    const manager = {
      manager: true,
      independentApprover: false,
      auditorOnTeam: false,
    };
    const approver = {
      manager: false,
      independentApprover: true,
      auditorOnTeam: false,
    };
    const auditor = {
      manager: false,
      independentApprover: false,
      auditorOnTeam: true,
    };
    const toClarify = parsedOpen();
    const error = parsedOpen({ verdict: 'error', blocks: 'decision' });
    const critical = parsedOpen({ verdict: 'critical', blocks: 'decision' });
    expect(canAccept(toClarify, manager)).toBe(true);
    expect(canAccept(toClarify, auditor)).toBe(false);
    expect(canAccept(error, manager)).toBe(false);
    expect(canAccept(error, approver)).toBe(true);
    expect(canAccept(critical, approver)).toBe(false);
    expect(canCorrect(toClarify, manager)).toBe(false);
    expect(canRecordDiscrepancy(auditor)).toBe(true);
    expect(
      canRecordDiscrepancy({
        manager: false,
        independentApprover: false,
        auditorOnTeam: false,
      }),
    ).toBe(false);
  });

  it('builds the manual Discrepancy and resolution commands, refusing incomplete drafts', () => {
    const attachments = [{ id: 'draft' }, { id: 'signed' }];
    expect(manualFromDraft(emptyManualDraft(), attachments)).toEqual({
      status: 'invalid',
    });
    expect(
      manualFromDraft(
        {
          ...emptyManualDraft(),
          subject: 'Stage type',
          verdict: 'to_clarify',
          leftValue: 'Stage 1',
          leftAttachmentId: 'draft',
          leftLocation: 'page 1',
          rightValue: 'Stage 2',
          rightAttachmentId: 'signed',
        },
        attachments,
      ),
    ).toEqual({
      status: 'valid',
      body: {
        verdict: 'to_clarify',
        subject: 'Stage type',
        left: { value: 'Stage 1', attachmentId: 'draft', location: 'page 1' },
        right: { value: 'Stage 2', attachmentId: 'signed', location: null },
        note: null,
      },
    });
    const options = { attachments, versions: [{ id: 'plan-version' }] };
    expect(
      resolutionFromDraft(
        {
          discrepancyId: RULE_ID,
          resolution: 'accepted',
          reason: ' ',
          correctedBy: '',
          reverify: false,
        },
        options,
      ),
    ).toEqual({ status: 'reasonRequired' });
    expect(
      resolutionFromDraft(
        {
          discrepancyId: 'manual:x',
          resolution: 'corrected',
          reason: 'Fixed',
          correctedBy: 'step:unknown',
          reverify: false,
        },
        options,
      ),
    ).toEqual({ status: 'correctionRequired' });
    expect(
      resolutionFromDraft(
        {
          discrepancyId: 'manual:x',
          resolution: 'corrected',
          reason: 'Fixed',
          correctedBy: 'step:plan-version',
          reverify: false,
        },
        options,
      ),
    ).toEqual({
      status: 'valid',
      body: {
        discrepancyId: 'manual:x',
        resolution: 'corrected',
        reason: 'Fixed',
        correctedBy: { stepVersionId: 'plan-version' },
      },
    });
  });

  it('adds the re-verification flag to an acceptance only when asked', () => {
    const options = { attachments: [], versions: [] };
    expect(
      resolutionFromDraft(
        {
          discrepancyId: RULE_ID,
          resolution: 'accepted',
          reason: 'Fictional reason',
          correctedBy: '',
          reverify: true,
        },
        options,
      ),
    ).toEqual({
      status: 'valid',
      body: {
        discrepancyId: RULE_ID,
        resolution: 'accepted',
        reason: 'Fictional reason',
        reverify: true,
      },
    });
  });

  it('reads the Discrepancies a gate names, and refuses an unknown rule', () => {
    expect(
      parseBlockingDiscrepancies([
        { id: RULE_ID, rule: 'R05', verdict: 'error' },
        { id: 'manual:x', rule: 'manual', verdict: 'critical' },
      ]),
    ).toEqual([
      { id: RULE_ID, rule: 'R05' },
      { id: 'manual:x', rule: 'manual' },
    ]);
    expect(parseBlockingDiscrepancies([{ id: 'x', rule: 'R99' }])).toBe(
      undefined,
    );
    expect(parseBlockingDiscrepancies(undefined)).toBe(undefined);
  });
});
