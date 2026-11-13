import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CERTIFICATION_APPROVER as APPROVER,
  CERTIFICATION_AUDITOR as AUDITOR,
  CERTIFICATION_OWNER as MANAGER,
  CERTIFICATION_READER as READER,
  openCertificationFixture,
  record,
  text,
  type CertificationSubject,
} from './certification.test-support.js';
import { DOSSIER_ITEMS } from './certification-decision.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const TEXTS = [
  {
    language: 'ro',
    holderName: 'Lactis Demo SRL',
    address: 'Str. Exemplu 1, Demo City',
    scope: 'Production of milk',
  },
];

withPostgres('Certificate release', { timeout: 60_000 }, () => {
  let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;
  let otherCompanyId = '';
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    fixture = await openCertificationFixture({
      databaseUrl,
      namePrefix: 'release1294',
      workspaceId: '00000000-0000-4000-8000-000000001294',
    });
    otherCompanyId = text(
      (
        await fixture.created(
          await fixture.call(MANAGER, '/companies', {
            method: 'POST',
            company: null,
            body: { displayName: 'Other Demo Company' },
          }),
        )
      ).id,
    );
    for (const path of [
      '/company-project-assignments',
      '/company-certification-reader-assignments',
      '/company-certification-programme-manager-assignments',
      '/company-certification-approver-assignments',
    ])
      await fixture.created(
        await fixture.call(MANAGER, path, {
          method: 'POST',
          company: null,
          body: {
            companyId: otherCompanyId,
            workspaceMembershipId: fixture.membership(MANAGER),
          },
        }),
      );
  }, 240_000);
  afterAll(async () => fixture?.close());
  const base = (id: string) => `/certification-cases/${id}`;
  async function read(id: string) {
    return record(await (await fixture.call(MANAGER, base(id))).json());
  }
  async function post(
    id: string,
    subject: CertificationSubject,
    path: string,
    value: Record<string, unknown>,
    key?: string,
  ) {
    return fixture.call(subject, `${base(id)}/${path}`, {
      method: 'POST',
      body: { expectedRevision: (await read(id)).revision, ...value },
      ...(key ? { key } : {}),
    });
  }
  async function ok(
    id: string,
    subject: CertificationSubject,
    path: string,
    value: Record<string, unknown>,
  ) {
    return fixture.created(await post(id, subject, path, value));
  }
  async function attach(id: string, role: string) {
    return fixture.attach(id, role, Number((await read(id)).revision));
  }
  async function granted() {
    const id = await fixture.approvedTeamCase();
    for (const [stage, startDate, days] of [
      ['stage-1', '2026-10-01', '1'],
      ['stage-2', '2026-10-20', '1.5'],
    ]) {
      await ok(id, MANAGER, `stages/${stage}/plan`, {
        startDate,
        endDate: startDate,
        onSiteDays: days,
        remoteDays: '0',
        objectives: 'Fictional audit',
        scope: 'Milk',
        planAttachmentId: await attach(id, 'plan'),
        sentToClientOn: null,
        deviationNote: null,
      });
      await ok(id, AUDITOR, `stages/${stage}/report`, {
        reportDate: startDate,
        reportAttachmentId: await attach(id, 'report'),
        ...(stage === 'stage-1'
          ? {
              documentReviewCompleted: true,
              conclusion: 'ready',
              conclusionNote: 'Ready',
            }
          : { summary: 'Completed' }),
      });
    }
    await ok(id, AUDITOR, 'recommendation', {
      recommendation: 'grant',
      basis: 'No nonconformities',
    });
    await ok(id, MANAGER, 'certificate-data', {
      texts: TEXTS,
      agreedOn: '2026-10-21',
      agreementAttachmentId: await attach(id, 'certificate_data'),
    });
    await ok(id, APPROVER, 'dossier-review', {
      items: Object.fromEntries(
        DOSSIER_ITEMS.map((item) => [
          item,
          {
            answer: ['findings_follow_up', 'participant_lists'].includes(item)
              ? 'not_applicable'
              : 'present',
            note: null,
          },
        ]),
      ),
      conclusion: 'Complete',
      independenceAttested: true,
    });
    await ok(id, APPROVER, 'decision', {
      decision: 'granted',
      decidedOn: '2026-11-06',
      decidedBy: 'Independent Demo',
      independenceAttested: true,
      grantedTexts: TEXTS,
      rationale: 'Grant',
    });
    return id;
  }
  async function draft(id: string, number = 'DEMO-0001', reason?: string) {
    const attachmentId = await attach(id, 'certificate_draft');
    const current = await read(id);
    return ok(id, MANAGER, 'certificate-draft', {
      attachmentId,
      number,
      draftedOn: '2026-11-06',
      decisionVersionId: record(current.decision).id,
      certificateDataVersionId: record(current.certificateData).id,
      ...(reason ? { reason } : {}),
    });
  }

  function records(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) throw new Error('Expected list');
    return value.map(record);
  }
  async function skip(id: string, reason?: string) {
    return ok(id, MANAGER, 'client-opinion', {
      draftVersionId: record((await read(id)).release).currentDraftId,
      outcome: 'skipped',
      businessDate: '2026-11-06',
      skipReason: 'texts_already_agreed',
      note: null,
      ...(reason ? { reason } : {}),
    });
  }
  async function approve(id: string) {
    return ok(id, APPROVER, 'certificate-draft-approval', {
      draftVersionId: record((await read(id)).release).currentDraftId,
      approvedOn: '2026-11-06',
      textsConfirmed: true,
      numberConfirmed: true,
      validityConfirmed: true,
      independenceAttested: true,
    });
  }
  async function approved(number: string) {
    const id = await granted();
    await draft(id, number);
    await skip(id);
    await approve(id);
    return id;
  }
  async function issue(id: string, number: string) {
    return ok(id, APPROVER, 'certificate', {
      number,
      issuedOn: '2026-11-06',
      attachmentId: await attach(id, 'certificate'),
      independenceAttested: true,
    });
  }
  async function exchange(id: string, value: Record<string, unknown>) {
    return ok(id, MANAGER, 'exchanges', {
      direction: 'sent',
      itemKind: 'certificate_draft',
      attachmentIds: [],
      counterpart: { kind: 'client', name: 'Lactis Demo SRL' },
      businessDate: '2026-11-06',
      channel: 'email',
      ...value,
    });
  }

  it('records an exact draft only after a grant and preserves its decision and data versions', async () => {
    const id = await granted();
    const next = await draft(id);
    expect(record(next.release).drafts).toMatchObject([
      {
        version: 1,
        value: {
          number: 'DEMO-0001',
          decisionVersionId: record(next.decision).id,
          certificateDataVersionId: record(next.certificateData).id,
        },
      },
    ]);
    const denied = await post(id, READER, 'certificate-draft', {});
    expect(denied.status).toBe(403);
  });
  it('requires an opinion and explicit confirmations, then issues only the approved number and bounded issue date', async () => {
    const id = await granted();
    await draft(id, 'RELEASE-ORDER');
    const draftVersionId = record((await read(id)).release).currentDraftId;
    const approval = {
      draftVersionId,
      approvedOn: '2026-11-06',
      textsConfirmed: true,
      numberConfirmed: true,
      validityConfirmed: true,
      independenceAttested: true,
    };
    const before = await fixture.eventCount(id);
    const missing = await post(
      id,
      APPROVER,
      'certificate-draft-approval',
      approval,
    );
    expect(missing.status).toBe(409);
    expect(record(await missing.json()).failures).toContain('opinion_missing');
    expect(await fixture.eventCount(id)).toBe(before);
    await skip(id);
    for (const name of [
      'textsConfirmed',
      'numberConfirmed',
      'validityConfirmed',
      'independenceAttested',
    ]) {
      const invalid = await post(id, APPROVER, 'certificate-draft-approval', {
        ...approval,
        [name]: undefined,
      });
      expect(invalid.status).toBe(400);
    }
    const onTeam = await post(id, APPROVER, 'certificate-draft-approval', {
      ...approval,
      onBehalf: {
        actedBy: 'AUDITOR   DÉMO',
        actedByFunction: 'Approver',
        actedOn: '2026-11-06',
        formAttachmentId: null,
      },
    });
    expect(onTeam.status).toBe(409);
    await approve(id);
    const attachmentId = await attach(id, 'certificate');
    for (const value of [
      { number: 'WRONG', issuedOn: '2026-11-06' },
      { number: 'RELEASE-ORDER', issuedOn: '2026-11-05' },
      { number: 'RELEASE-ORDER', issuedOn: '2026-11-08' },
    ]) {
      const denied = await post(id, APPROVER, 'certificate', {
        ...value,
        attachmentId,
        independenceAttested: true,
      });
      expect(denied.status).toBe(409);
    }
    const certified = await ok(id, APPROVER, 'certificate', {
      number: 'RELEASE-ORDER',
      issuedOn: '2026-11-06',
      attachmentId,
      independenceAttested: true,
    });
    expect(
      records(record(certified.consistency).open).filter(
        (entry) => entry.rule === 'R13',
      ),
    ).toEqual([]);
    const activity = await fixture.eventMetadata(id);
    for (const action of [
      'certification_case.certificate_draft_recorded',
      'certification_case.client_opinion_recorded',
      'certification_case.certificate_draft_approved',
      'certification_case.certificate_recorded',
    ]) {
      const events = activity.filter((event) => event.action === action);
      expect(events).toHaveLength(1);
      for (const key of Object.keys(record(events[0]?.metadata)))
        expect(['revision', 'version', 'outcome']).toContain(key);
    }
    expect(certified).toMatchObject({
      status: 'certified',
      certificate: {
        number: 'RELEASE-ORDER',
        issuedOn: '2026-11-06',
        approvedDraftVersionId: draftVersionId,
        validFrom: '2026-11-06',
        validUntil: '2029-11-05',
      },
      release: { daysSinceIssuance: 1, transmission: null },
    });
  });

  it('requires a new draft after requested changes, then the new matching data and same-outcome decision versions', async () => {
    const id = await granted();
    await draft(id, 'RELEASE-CHANGES');
    let current = await read(id);
    const firstDraft = records(record(current.release).drafts)[0];
    if (!firstDraft) throw new Error('Draft missing');
    await exchange(id, {
      attachmentIds: [record(firstDraft.value).attachmentId],
    });
    const answer = await exchange(id, {
      direction: 'received',
      itemKind: 'client_opinion',
      attachmentIds: [await attach(id, 'client_opinion')],
    });
    const exchangeRecord = records(record(answer.exchanges).records).find(
      (entry) => record(entry.current).direction === 'received',
    );
    if (!exchangeRecord) throw new Error('Opinion exchange missing');
    await ok(id, MANAGER, 'client-opinion', {
      draftVersionId: firstDraft.id,
      outcome: 'changes_requested',
      requestedChange: 'Add the English text',
      exchangeRecordId: record(exchangeRecord.current).id,
      businessDate: '2026-11-06',
    });
    let denied = await post(id, APPROVER, 'certificate-draft-approval', {
      draftVersionId: firstDraft.id,
      approvedOn: '2026-11-06',
      textsConfirmed: true,
      numberConfirmed: true,
      validityConfirmed: true,
      independenceAttested: true,
    });
    expect(record(await denied.json()).failures).toContain('changes_requested');
    const original = record(record(current.decision).value);
    const correctedTexts = [
      ...TEXTS,
      {
        language: 'en',
        holderName: 'Lactis Demo LLC',
        address: '1 Example Street, Demo City',
        scope: 'Production of milk',
      },
    ];
    await ok(id, MANAGER, 'certificate-data', {
      texts: correctedTexts,
      agreedOn: '2026-11-06',
      agreementAttachmentId: await attach(id, 'certificate_data'),
      reason: 'Client agreed bilingual texts',
    });
    current = await read(id);
    expect(record(current.release)).toMatchObject({
      outdated: true,
      approvalBlockers: expect.arrayContaining([
        'draft_outdated',
        'texts_differ',
      ]),
    });
    expect(records(record(current.consistency).open)).toContainEqual(
      expect.objectContaining({
        rule: 'R11',
        blocks: 'certificate_draft_approval',
      }),
    );
    const beforeOutdatedApproval = await fixture.eventCount(id);
    denied = await post(id, APPROVER, 'certificate-draft-approval', {
      draftVersionId: firstDraft.id,
      approvedOn: '2026-11-06',
      textsConfirmed: true,
      numberConfirmed: true,
      validityConfirmed: true,
      independenceAttested: true,
    });
    expect(denied.status).toBe(409);
    expect(record(await denied.json()).failures).toEqual(
      expect.arrayContaining([
        'draft_outdated',
        'texts_differ',
        'discrepancies_open',
      ]),
    );
    expect(await fixture.eventCount(id)).toBe(beforeOutdatedApproval);
    denied = await post(id, APPROVER, 'decision', {
      ...original,
      decision: 'refused',
      grantedTexts: null,
      reason: 'Attempt reversal',
    });
    expect(record(await denied.json()).code).toBe(
      'CERTIFICATION_DECISION_OUTCOME_FIXED',
    );
    await ok(id, APPROVER, 'decision', {
      ...original,
      grantedTexts: correctedTexts,
      reason: 'Grant the agreed bilingual texts',
    });
    await draft(id, 'RELEASE-CHANGES', 'Bilingual PDF');
    current = await read(id);
    expect(record(current.release).approvalBlockers).toContain(
      'opinion_missing',
    );
    await skip(id, 'The corrected texts are agreed');
    await approve(id);
    expect(
      record((await issue(id, 'RELEASE-CHANGES')).certificate).texts,
    ).toEqual(correctedTexts);
  });

  it('derives transmission from the exact issued Version and client sending, including corrected exchanges', async () => {
    const id = await approved('RELEASE-TRANSMIT');
    const issued = await issue(id, 'RELEASE-TRANSMIT');
    const attachmentId = record(issued.certificate).attachmentId;
    await exchange(id, {
      itemKind: 'certificate',
      attachmentIds: [attachmentId],
      counterpart: { kind: 'certification_body', name: 'Demo Body' },
    });
    expect(record((await read(id)).release)).toMatchObject({
      transmission: null,
      daysSinceIssuance: 1,
    });
    const transmitted = await exchange(id, {
      itemKind: 'certificate',
      attachmentIds: [attachmentId],
      channel: 'courier',
    });
    expect(record(transmitted.release)).toMatchObject({
      transmission: {
        direction: 'sent',
        itemKind: 'certificate',
        channel: 'courier',
        attachmentIds: [attachmentId],
      },
      daysSinceIssuance: null,
    });
  });

  it('raises R13 privately and preserves unique issuance when two approved Cases race for one number', async () => {
    const first = await approved('RELEASE-RACE');
    const second = await approved('RELEASE-RACE');
    const a = await attach(first, 'certificate');
    const b = await attach(second, 'certificate');
    // SHARE permits both availability reads and pins both INSERTs before
    // either can commit, so the unique constraint must arbitrate the race.
    const beforeFirst = await fixture.eventCount(first);
    const beforeSecond = await fixture.eventCount(second);
    await fixture.grant(MANAGER, '/company-certification-approver-assignments');
    const hold = await fixture.holdTable('certification_certificates', 'SHARE');
    const pending = Promise.all([
      post(first, APPROVER, 'certificate', {
        number: 'RELEASE-RACE',
        issuedOn: '2026-11-06',
        attachmentId: a,
        independenceAttested: true,
      }),
      post(second, MANAGER, 'certificate', {
        number: 'RELEASE-RACE',
        issuedOn: '2026-11-06',
        attachmentId: b,
        independenceAttested: true,
      }),
    ]);
    try {
      await expect.poll(() => hold.waitingCount()).toBe(2);
    } finally {
      await hold.release();
      await pending;
    }
    const results = await pending;
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await fixture.eventCount(first)).toBe(
      beforeFirst + (results[0]?.status === 201 ? 1 : 0),
    );
    expect(await fixture.eventCount(second)).toBe(
      beforeSecond + (results[1]?.status === 201 ? 1 : 0),
    );
    const failed = results.find((response) => response.status === 409);
    if (!failed) throw new Error('One issuance must be refused');
    expect(record(await failed.json()).code).toBe(
      'CERTIFICATION_CERTIFICATE_NUMBER_TAKEN',
    );
    const third = await granted();
    await draft(third, 'RELEASE-RACE');
    await skip(third);
    const current = await read(third);
    const collisions = records(record(current.consistency).open).filter(
      (entry) => entry.rule === 'R13',
    );
    expect(collisions).toHaveLength(1);
    expect(record(record(collisions[0]).right).source).toEqual({
      kind: 'company_certificate_number',
      number: 'RELEASE-RACE',
      attachment: null,
    });
    const approval = await post(third, APPROVER, 'certificate-draft-approval', {
      draftVersionId: record(current.release).currentDraftId,
      approvedOn: '2026-11-06',
      textsConfirmed: true,
      numberConfirmed: true,
      validityConfirmed: true,
      independenceAttested: true,
    });
    expect(record(await approval.json()).failures).toContain(
      'discrepancies_open',
    );
    await draft(third, 'RELEASE-UNUSED', 'Choose an unused number');
    expect(
      records(record((await read(third)).consistency).open).filter(
        (entry) => entry.rule === 'R13',
      ),
    ).toHaveLength(0);
  });

  it('replays the original draft response and refuses stale commands without extra events', async () => {
    const id = await granted();
    const attachmentId = await attach(id, 'certificate_draft');
    const current = await read(id);
    const key = randomUUID();
    const body = {
      expectedRevision: current.revision,
      attachmentId,
      number: 'RELEASE-REPLAY',
      draftedOn: '2026-11-06',
      decisionVersionId: record(current.decision).id,
      certificateDataVersionId: record(current.certificateData).id,
    };
    const response = await fixture.created(
      await fixture.call(MANAGER, `${base(id)}/certificate-draft`, {
        method: 'POST',
        body,
        key,
      }),
    );
    await skip(id);
    const count = await fixture.eventCount(id);
    const observations = await fixture.numberObservationCount(id);
    await read(id);
    expect(await fixture.numberObservationCount(id)).toBe(observations);
    expect(
      await fixture.created(
        await fixture.call(MANAGER, `${base(id)}/certificate-draft`, {
          method: 'POST',
          body,
          key,
        }),
      ),
    ).toEqual(response);
    const stale = await fixture.call(MANAGER, `${base(id)}/certificate-draft`, {
      method: 'POST',
      body,
      key: randomUUID(),
    });
    expect(stale.status).toBe(409);
    expect(await fixture.eventCount(id)).toBe(count);
    expect(await fixture.numberObservationCount(id)).toBe(observations);
  });
  it('gives another Company the same missing-Case denial for release reads, commands and PDF', async () => {
    const id = await granted();
    const targets = [base(id), base(randomUUID())];
    for (const target of targets) {
      expect(
        (await fixture.call(MANAGER, target, { company: otherCompanyId }))
          .status,
      ).toBe(404);
      expect(
        (
          await fixture.call(MANAGER, `${target}/register`, {
            company: otherCompanyId,
          })
        ).status,
      ).toBe(404);
      for (const path of [
        'certificate-draft',
        'client-opinion',
        'certificate-draft-approval',
      ]) {
        const before = await fixture.eventCount(id);
        const response = await fixture.call(MANAGER, `${target}/${path}`, {
          company: otherCompanyId,
          method: 'POST',
          body:
            path === 'certificate-draft'
              ? {
                  expectedRevision: 1,
                  attachmentId: randomUUID(),
                  number: 'HIDDEN',
                  decisionVersionId: randomUUID(),
                  certificateDataVersionId: randomUUID(),
                  draftedOn: '2026-11-06',
                }
              : path === 'client-opinion'
                ? {
                    expectedRevision: 1,
                    draftVersionId: randomUUID(),
                    businessDate: '2026-11-06',
                    outcome: 'skipped',
                    skipReason: 'texts_already_agreed',
                  }
                : {
                    expectedRevision: 1,
                    draftVersionId: randomUUID(),
                    approvedOn: '2026-11-06',
                    textsConfirmed: true,
                    numberConfirmed: true,
                    validityConfirmed: true,
                    independenceAttested: true,
                  },
        });
        expect(response.status).toBe(404);
        expect(await fixture.eventCount(id)).toBe(before);
      }
    }
  });

  it('records agreement from the exact received client opinion and invalidates approval on a later identical-text data version', async () => {
    const id = await granted();
    await draft(id, 'RELEASE-AGREED');
    const drafted = await read(id);
    const first = records(record(drafted.release).drafts)[0];
    if (!first) throw new Error('Draft required');
    await exchange(id, { attachmentIds: [record(first.value).attachmentId] });
    const received = await exchange(id, {
      direction: 'received',
      itemKind: 'client_opinion',
      attachmentIds: [await attach(id, 'client_opinion')],
    });
    const answer = records(record(received.exchanges).records).find(
      (entry) => record(entry.current).direction === 'received',
    );
    if (!answer) throw new Error('Answer required');
    await ok(id, MANAGER, 'client-opinion', {
      draftVersionId: first.id,
      outcome: 'agreed',
      exchangeRecordId: record(answer.current).id,
      businessDate: '2026-11-06',
    });
    await approve(id);
    const current = await read(id);
    const body = {
      expectedRevision: current.revision,
      draftVersionId: first.id,
      approvedOn: '2026-11-06',
      textsConfirmed: true,
      numberConfirmed: true,
      validityConfirmed: true,
      independenceAttested: true,
      reason: 'Same approval',
    };
    const before = await fixture.eventCount(id);
    const observations = await fixture.numberObservationCount(id);
    const unchanged = await fixture.call(
      APPROVER,
      `${base(id)}/certificate-draft-approval`,
      { method: 'POST', body },
    );
    expect(unchanged.status).toBe(409);
    expect(record(await unchanged.json()).code).toBe(
      'CERTIFICATION_CORRECTION_UNCHANGED',
    );
    expect(await fixture.eventCount(id)).toBe(before);
    expect(await fixture.numberObservationCount(id)).toBe(observations);
    await ok(id, MANAGER, 'certificate-data', {
      texts: TEXTS,
      agreedOn: '2026-10-21',
      agreementAttachmentId: await attach(id, 'certificate_data'),
      reason: 'New signed form with identical texts',
    });
    const stale = await read(id);
    expect(record(stale.release)).toMatchObject({
      outdated: true,
      issuanceBlockers: expect.arrayContaining(['draft_outdated']),
    });
    const refused = await post(id, APPROVER, 'certificate', {
      number: 'RELEASE-AGREED',
      issuedOn: '2026-11-06',
      attachmentId: await attach(id, 'certificate'),
      independenceAttested: true,
    });
    expect(refused.status).toBe(409);
    expect(record(await refused.json()).code).toBe(
      'CERTIFICATION_CERTIFICATE_APPROVAL_REQUIRED',
    );
  });
  it('keeps a same-clock later Company issuance out of the earlier clean draft history and preserves accepted pairs', async () => {
    const local = await granted();
    await draft(local, 'HISTORY-LATER');
    const first = await read(local);
    const firstDraft = records(record(first.release).drafts)[0];
    if (!firstDraft) throw new Error('Draft required');
    const manual = await ok(local, MANAGER, 'discrepancies', {
      verdict: 'to_clarify',
      subject: 'Presentation note',
      left: {
        value: 'Draft',
        attachmentId: record(firstDraft.value).attachmentId,
        location: null,
      },
      right: {
        value: 'Agreed data',
        attachmentId: record(record(first.certificateData).value)
          .agreementAttachmentId,
        location: null,
      },
      note: null,
    });
    const discrepancy = records(record(manual.consistency).open).find(
      (entry) => entry.origin === 'manual',
    );
    if (!discrepancy) throw new Error('Manual discrepancy required');
    await ok(local, MANAGER, 'discrepancy-resolutions', {
      discrepancyId: discrepancy.id,
      resolution: 'accepted',
      reason: 'The agreed form prevails.',
    });
    const clean = await read(local);
    expect(
      records(record(clean.consistency).open).filter(
        (entry) => entry.rule === 'R13',
      ),
    ).toEqual([]);
    const issuer = await approved('HISTORY-LATER');
    await issue(issuer, 'HISTORY-LATER');
    const collision = await read(local);
    const raised = records(record(collision.consistency).open).filter(
      (entry) => entry.rule === 'R13',
    );
    expect(raised).toMatchObject([
      { openedRevision: clean.revision, opened: null },
    ]);
    expect(collision.revision).toBe(clean.revision);
    await draft(local, 'HISTORY-CORRECTED', 'Use an unissued number');
    const corrected = await read(local);
    expect(
      records(record(corrected.consistency).open).filter(
        (entry) => entry.rule === 'R13',
      ),
    ).toEqual([]);
    expect(
      records(record(corrected.consistency).resolved).filter(
        (entry) => entry.rule === 'R13',
      ),
    ).toMatchObject([
      {
        openedRevision: clean.revision,
        opened: null,
        endedRevision: corrected.revision,
        resolution: { kind: 'corrected', reason: 'Use an unissued number' },
      },
    ]);
    expect(
      records(record(corrected.consistency).resolved).find(
        (entry) => entry.id === discrepancy.id,
      ),
    ).toMatchObject({
      resolution: { kind: 'accepted', reason: 'The agreed form prevails.' },
    });
  });

  it('attributes a same-clock already-issued number to the new draft that first states it', async () => {
    const issuer = await approved('HISTORY-EARLIER');
    await issue(issuer, 'HISTORY-EARLIER');
    const local = await granted();
    const drafted = await draft(local, 'HISTORY-EARLIER');
    const raised = records(record(drafted.consistency).open).filter(
      (entry) => entry.rule === 'R13',
    );
    expect(raised).toMatchObject([
      {
        openedRevision: drafted.revision,
        opened: { by: { workspaceMembershipId: fixture.membership(MANAGER) } },
      },
    ]);
  });
  it('reapproves a corrected opinion on the same business date while a still-valid approval remains a no-op', async () => {
    const id = await approved('RELEASE-REAPPROVE');
    const approvedState = await read(id);
    const draftVersionId = record(approvedState.release).currentDraftId;
    await ok(id, MANAGER, 'client-opinion', {
      draftVersionId,
      outcome: 'skipped',
      skipReason: 'texts_already_agreed',
      note: 'Corrected reference to the agreed form.',
      businessDate: '2026-11-06',
      reason: 'Correct the client opinion reference.',
    });
    const changed = await read(id);
    expect(record(changed.release).issuanceBlockers).toContain(
      'approval_missing',
    );
    const value = {
      draftVersionId,
      approvedOn: '2026-11-06',
      textsConfirmed: true,
      numberConfirmed: true,
      validityConfirmed: true,
      independenceAttested: true,
    };
    const unexplained = await post(
      id,
      APPROVER,
      'certificate-draft-approval',
      value,
    );
    expect(record(await unexplained.json()).code).toBe(
      'CERTIFICATION_CORRECTION_REASON',
    );
    const before = await fixture.eventCount(id);
    const observations = await fixture.numberObservationCount(id);
    const body = {
      expectedRevision: changed.revision,
      ...value,
      reason: 'Approve the same draft after the corrected opinion.',
    };
    const key = randomUUID();
    const response = await fixture.call(
      APPROVER,
      `${base(id)}/certificate-draft-approval`,
      { method: 'POST', body, key },
    );
    expect(response.status, await response.clone().text()).toBe(201);
    const confirmed = record(await response.json());
    expect(record(confirmed.release).approvals).toMatchObject([
      { version: 1 },
      {
        version: 2,
        value: { approvedOn: '2026-11-06' },
        reason: 'Approve the same draft after the corrected opinion.',
      },
    ]);
    expect(record(confirmed.release).issuanceBlockers).toEqual([]);
    expect(await fixture.eventCount(id)).toBe(before + 1);
    expect(await fixture.numberObservationCount(id)).toBe(observations + 1);
    const unchanged = await post(id, APPROVER, 'certificate-draft-approval', {
      ...value,
      reason: 'No context changed.',
    });
    expect(record(await unchanged.json()).code).toBe(
      'CERTIFICATION_CORRECTION_UNCHANGED',
    );
    expect(
      await fixture.created(
        await fixture.call(APPROVER, `${base(id)}/certificate-draft-approval`, {
          method: 'POST',
          body,
          key,
        }),
      ),
    ).toEqual(confirmed);
    const stale = await fixture.call(
      APPROVER,
      `${base(id)}/certificate-draft-approval`,
      { method: 'POST', body, key: randomUUID() },
    );
    expect(stale.status).toBe(409);
    expect(await fixture.eventCount(id)).toBe(before + 1);
    expect(await fixture.numberObservationCount(id)).toBe(observations + 1);
  });
});
