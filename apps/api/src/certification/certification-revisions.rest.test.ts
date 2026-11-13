import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  compactPdfText,
  inspectCommercialPdf,
} from '../commercial-pdf/pdf-inspection.test-support.mjs';
import {
  CERTIFICATION_APPROVER as APPROVER,
  CERTIFICATION_AUDITOR as AUDITOR,
  CERTIFICATION_OWNER as MANAGER,
  CERTIFICATION_READER as READER,
  openCertificationFixture,
  record,
  text,
} from './certification.test-support.js';
import { certificateReleaseCommands } from './certification-release.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Certificate Revisions', { timeout: 60_000 }, () => {
  let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;
  const commands = certificateReleaseCommands(() => fixture);
  const { read, post, ok, attach, approved, issue, records, base } = commands;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    fixture = await openCertificationFixture({
      databaseUrl,
      namePrefix: 'revisions1295',
      workspaceId: '00000000-0000-4000-8000-000000001295',
    });
  }, 240_000);
  afterAll(async () => fixture?.close());
  async function issued(number: string) {
    const id = await approved(number);
    await issue(id, number);
    return id;
  }
  function correction(attachmentId: string, revisionMarked = true) {
    return {
      reason: 'Correct the fictional English city.',
      revisedOn: '2026-11-07',
      attachmentId,
      revisionMarked,
      independenceAttested: true,
    };
  }
  async function pdf(id: string, language = 'en') {
    const response = await fixture.call(
      READER,
      `${base(id)}/register?language=${language}`,
    );
    expect(response.status).toBe(200);
    return compactPdfText(
      (await inspectCommercialPdf(new Uint8Array(await response.arrayBuffer())))
        .map((page) => page.text)
        .join('\n'),
    );
  }

  it('records an explicit false mark answer and shows the warning beside its revision in the real register PDF', async () => {
    const id = await issued('REVISION-NOT-MARKED');
    const attachmentId = await attach(id, 'certificate');
    const before = await fixture.eventCount(id);
    await ok(
      id,
      APPROVER,
      'certificate-revisions',
      correction(attachmentId, false),
    );
    expect(records(record((await read(id)).release).revisions)).toMatchObject([
      { index: 1, revisionMarked: false },
    ]);
    expect(await fixture.eventCount(id)).toBe(before + 1);
    const content = await pdf(id);
    for (const expected of [
      'Revision 1',
      'revision not marked on the Certificate',
      'Correct the fictional English city.',
      'REVISION-NOT-MARKED',
    ])
      expect(content).toContain(compactPdfText(expected));
  });

  it('keeps every exact PDF readable and assigns a separate sent client exchange to each revision', async () => {
    const id = await issued('REVISION-HISTORY');
    const original = record((await read(id)).certificate);
    const firstPdf = await attach(id, 'certificate');
    await ok(id, APPROVER, 'certificate-revisions', correction(firstPdf));
    const secondPdf = await attach(id, 'certificate');
    await ok(id, APPROVER, 'certificate-revisions', correction(secondPdf));
    const send = (attachmentId: unknown, channel = 'email') =>
      ok(id, MANAGER, 'exchanges', {
        direction: 'sent',
        itemKind: 'certificate',
        attachmentIds: [attachmentId],
        counterpart: { kind: 'client', name: 'Lactis Demo SRL' },
        businessDate: '2026-11-07',
        channel,
      });
    await send(original.attachmentId, 'courier');
    expect(
      records(record((await read(id)).release).revisions).map(
        (entry) => entry.transmission,
      ),
    ).toEqual([null, null]);
    await send(firstPdf);
    const firstSent = records(record((await read(id)).release).revisions);
    expect(record(firstSent[0]?.transmission).channel).toBe('email');
    expect(firstSent[1]?.transmission).toBeNull();
    await send(secondPdf);
    const release = record((await read(id)).release);
    expect(release.currentRevisionIndex).toBe(2);
    const revisions = records(release.revisions);
    expect(record(revisions[0]?.transmission).sequence).not.toBe(
      record(revisions[1]?.transmission).sequence,
    );
    expect(record(release.transmission).channel).toBe('courier');
    expect(
      (await fixture.call(READER, `${base(id)}/documents/${firstPdf}/content`))
        .status,
    ).toBe(403);
    for (const path of [
      '/company-document-registrar-assignments',
      '/company-received-audit-source-access-assignments',
      '/company-document-content-reader-assignments',
    ])
      await fixture.grant(READER, path);
    for (const attachmentId of [original.attachmentId, firstPdf, secondPdf]) {
      const response = await fixture.call(
        READER,
        `${base(id)}/documents/${attachmentId}/content`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/pdf');
    }
    const content = await pdf(id);
    for (const expected of [
      'Revision 0',
      'Revision 1',
      'Revision 2',
      'Superseded',
      'Current',
    ])
      expect(content).toContain(compactPdfText(expected));
  });

  it('refuses changed fixed fields, absent answers, reused Versions and foreign or wrong-role PDFs without an event', async () => {
    const id = await issued('REVISION-REFUSALS');
    const original = record((await read(id)).certificate);
    const attachmentId = await attach(id, 'certificate');
    const wrongRole = await attach(id, 'evidence');
    const other = await approved('REVISION-OTHER');
    const foreignPdf = await attach(other, 'certificate');
    const valid = correction(attachmentId);
    const before = await read(id);
    const count = await fixture.eventCount(id);
    for (const fields of [
      { number: 'CHANGED' },
      { validFrom: '2026-01-01' },
      { validUntil: '2030-01-01' },
      { firstSurveillanceBy: '2030-01-01' },
      { clientLegalEntityId: randomUUID() },
      { index: 2 },
      { texts: [] },
      { reason: undefined },
      { reason: ' ' },
      { revisionMarked: undefined },
      { revisionMarked: null },
      { revisionMarked: 'no' },
      { independenceAttested: false },
      { revisedOn: '2026-02-30' },
    ])
      expect(
        (
          await post(id, APPROVER, 'certificate-revisions', {
            ...valid,
            ...fields,
          })
        ).status,
      ).toBe(400);
    for (const fields of [
      { revisedOn: '2026-11-08' },
      { attachmentId: original.attachmentId },
      { attachmentId: wrongRole },
      { attachmentId: foreignPdf },
      {
        onBehalf: {
          actedBy: 'AUDITOR DÉMO',
          actedByFunction: 'Approver',
          actedOn: '2026-11-07',
        },
      },
      {
        onBehalf: {
          actedBy: 'Independent',
          actedByFunction: 'Approver',
          actedOn: '2026-11-08',
        },
      },
    ])
      expect(
        (
          await post(id, APPROVER, 'certificate-revisions', {
            ...valid,
            ...fields,
          })
        ).status,
      ).toBe(409);
    expect(await read(id)).toEqual(before);
    expect(await fixture.eventCount(id)).toBe(count);
    await ok(id, APPROVER, 'certificate-revisions', valid);
    expect(
      (await post(id, APPROVER, 'certificate-revisions', valid)).status,
    ).toBe(409);
    expect(await fixture.eventCount(id)).toBe(count + 1);
  });

  it('fixes all non-text Decision facts after issuance and refuses mismatched or unchanged corrections', async () => {
    const id = await issued('REVISION-FIXED-DECISION');
    const before = await read(id);
    const decision = record(record(before.decision).value);
    const count = await fixture.eventCount(id);
    for (const fields of [
      { decidedOn: '2026-11-05' },
      { decidedBy: 'Another independent person' },
      { decidedByFunction: 'New function' },
      { decisionFormAttachmentId: randomUUID() },
      { rationale: 'Different rationale' },
      { additionalInformation: 'New information' },
      { decision: 'refused', grantedTexts: null },
      {
        grantedTexts: [
          {
            language: 'en',
            holderName: 'Lactis Demo SRL',
            address: 'Different',
            scope: 'Milk',
          },
        ],
      },
      {},
    ])
      expect(
        (
          await post(id, APPROVER, 'decision', {
            ...decision,
            reason: 'Attempted correction',
            ...fields,
          })
        ).status,
      ).toBe(409);
    expect(await fixture.eventCount(id)).toBe(count);
    expect(await read(id)).toEqual(before);
  });

  it('requires independent live approver authority, validates an act on behalf, and gives hidden Cases the missing denial', async () => {
    const id = await issued('REVISION-AUTHORITY');
    const attachmentId = await attach(id, 'certificate');
    const actForm = await attach(id, 'evidence');
    const valid = correction(attachmentId);
    const count = await fixture.eventCount(id);
    for (const actor of [READER, MANAGER, AUDITOR] as const)
      expect(
        (await post(id, actor, 'certificate-revisions', valid)).status,
      ).toBe(403);
    await fixture.grant(AUDITOR, '/company-certification-approver-assignments');
    expect(
      (await post(id, AUDITOR, 'certificate-revisions', valid)).status,
    ).toBe(409);
    const company = text(
      (
        await fixture.created(
          await fixture.call(MANAGER, '/companies', {
            method: 'POST',
            company: null,
            body: { displayName: 'Other revision Company' },
          }),
        )
      ).id,
    );
    for (const path of [
      '/company-context-assignments',
      '/company-director-client-assignments',
      '/company-project-assignments',
      '/company-certification-reader-assignments',
      '/company-certification-approver-assignments',
    ])
      await fixture.created(
        await fixture.call(MANAGER, path, {
          method: 'POST',
          company: null,
          body: {
            companyId: company,
            workspaceMembershipId: fixture.membership(APPROVER),
          },
        }),
      );
    const missing = randomUUID();
    for (const path of ['', '/register']) {
      const hidden = await fixture.call(APPROVER, `${base(id)}${path}`, {
        company,
      });
      const absent = await fixture.call(APPROVER, `${base(missing)}${path}`, {
        company,
      });
      expect(hidden.status).toBe(404);
      expect(await hidden.json()).toEqual(await absent.json());
    }
    const hidden = await fixture.call(
      APPROVER,
      `${base(id)}/certificate-revisions`,
      { company, method: 'POST', body: { expectedRevision: 1, ...valid } },
    );
    const absent = await fixture.call(
      APPROVER,
      `${base(missing)}/certificate-revisions`,
      { company, method: 'POST', body: { expectedRevision: 1, ...valid } },
    );
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toEqual(await absent.json());
    expect(await fixture.eventCount(id)).toBe(count);
    const onBehalf = {
      actedBy: 'Independent Body Approver',
      actedByFunction: 'Head',
      actedOn: '2026-11-07',
      formAttachmentId: actForm,
    };
    await ok(id, APPROVER, 'certificate-revisions', { ...valid, onBehalf });
    expect(
      records(record((await read(id)).release).revisions)[0],
    ).toMatchObject({
      onBehalf,
      recordedBy: { workspaceMembershipId: fixture.membership(APPROVER) },
    });
    const events = (await fixture.eventMetadata(id)).filter(
      (event) => event.action === 'certification_case.certificate_revised',
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toEqual({
      revision: (await read(id)).revision,
      index: 1,
    });
  });

  it('serializes index races and replays the exact first response after later revisions without new events', async () => {
    const id = await issued('REVISION-RACES');
    const attachmentId = await attach(id, 'certificate');
    const body = {
      expectedRevision: (await read(id)).revision,
      ...correction(attachmentId),
    };
    const key = randomUUID();
    const hold = await fixture.holdTable('certification_cases');
    const first = fixture.call(APPROVER, `${base(id)}/certificate-revisions`, {
      method: 'POST',
      key,
      body,
    });
    const second = fixture.call(APPROVER, `${base(id)}/certificate-revisions`, {
      method: 'POST',
      key,
      body,
    });
    try {
      await expect.poll(() => hold.waiting(), { timeout: 10_000 }).toBe(true);
    } finally {
      await hold.release();
    }
    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const response = await responses[0]?.json();
    expect(await responses[1]?.json()).toEqual(response);
    const nextPdf = await attach(id, 'certificate');
    const next = {
      expectedRevision: (await read(id)).revision,
      ...correction(nextPdf),
    };
    const nextKey = randomUUID();
    const race = await Promise.all([
      fixture.call(APPROVER, `${base(id)}/certificate-revisions`, {
        method: 'POST',
        key: nextKey,
        body: next,
      }),
      fixture.call(APPROVER, `${base(id)}/certificate-revisions`, {
        method: 'POST',
        key: randomUUID(),
        body: next,
      }),
    ]);
    expect(race.map((result) => result.status).sort()).toEqual([201, 409]);
    const count = await fixture.eventCount(id);
    const observations = await fixture.numberObservationCount(id);
    expect(
      await fixture.created(
        await fixture.call(APPROVER, `${base(id)}/certificate-revisions`, {
          method: 'POST',
          key,
          body,
        }),
      ),
    ).toEqual(response);
    expect(
      (
        await fixture.call(APPROVER, `${base(id)}/certificate-revisions`, {
          method: 'POST',
          key: randomUUID(),
          body,
        })
      ).status,
    ).toBe(409);
    expect(
      records(record((await read(id)).release).revisions).map(
        (entry) => entry.index,
      ),
    ).toEqual([1, 2]);
    expect(await fixture.eventCount(id)).toBe(count);
    expect(await fixture.numberObservationCount(id)).toBe(observations);
  });

  it('rolls back revision, Case head and receipt when the final event fails, then retries the same key once', async () => {
    const id = await issued('REVISION-ROLLBACK');
    const attachmentId = await attach(id, 'certificate');
    const before = await read(id);
    const body = {
      expectedRevision: before.revision,
      ...correction(attachmentId),
    };
    const key = randomUUID();
    const count = await fixture.eventCount(id);
    const observations = await fixture.numberObservationCount(id);
    await fixture.databasePool.query(
      "ALTER TABLE certification_events ADD CONSTRAINT revision1295_failure CHECK (action <> 'certification_case.certificate_revised') NOT VALID",
    );
    try {
      expect(
        (
          await fixture.call(APPROVER, `${base(id)}/certificate-revisions`, {
            method: 'POST',
            key,
            body,
          })
        ).status,
      ).toBe(500);
      expect(await read(id)).toEqual(before);
      expect(await fixture.eventCount(id)).toBe(count);
      expect(await fixture.numberObservationCount(id)).toBe(observations);
    } finally {
      await fixture.databasePool.query(
        'ALTER TABLE certification_events DROP CONSTRAINT revision1295_failure',
      );
    }
    await fixture.created(
      await fixture.call(APPROVER, `${base(id)}/certificate-revisions`, {
        method: 'POST',
        key,
        body,
      }),
    );
    expect(await fixture.eventCount(id)).toBe(count + 1);
  });

  it('denies revision and receipt replay when revocation commits before the live grant check', async () => {
    const id = await issued('REVISION-REVOKED');
    const attachmentId = await attach(id, 'certificate');
    const body = {
      expectedRevision: (await read(id)).revision,
      ...correction(attachmentId),
    };
    const key = randomUUID();
    await fixture.created(
      await fixture.call(APPROVER, `${base(id)}/certificate-revisions`, {
        method: 'POST',
        key,
        body,
      }),
    );
    const count = await fixture.eventCount(id);
    const hold = await fixture.holdTable('company_role_assignments');
    const replay = fixture.call(APPROVER, `${base(id)}/certificate-revisions`, {
      method: 'POST',
      key,
      body,
    });
    try {
      await expect.poll(() => hold.waiting(), { timeout: 10_000 }).toBe(true);
      await hold.write(
        "UPDATE company_role_assignments SET revoked_at=clock_timestamp() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_certification_approver'",
        [fixture.companyId, fixture.membership(APPROVER)],
      );
    } finally {
      await hold.release();
    }
    try {
      expect((await replay).status).toBe(403);
      expect(
        (
          await post(
            id,
            APPROVER,
            'certificate-revisions',
            correction(attachmentId),
          )
        ).status,
      ).toBe(403);
      expect(await fixture.eventCount(id)).toBe(count);
    } finally {
      await fixture.grant(
        APPROVER,
        '/company-certification-approver-assignments',
      );
    }
  });

  it('finds a revision transmission beyond 200 exchanges and re-evaluates the current corrected exchange', async () => {
    const id = await issued('REVISION-PAGED-TRANSMISSION');
    const attachmentId = await attach(id, 'certificate');
    await ok(id, APPROVER, 'certificate-revisions', correction(attachmentId));
    let expectedRevision = (await read(id)).revision;
    for (let index = 1; index <= 201; index++) {
      const response = await fixture.created(
        await fixture.call(MANAGER, `${base(id)}/exchanges`, {
          method: 'POST',
          body: {
            expectedRevision,
            direction: 'received',
            itemKind: 'other',
            attachmentIds: [attachmentId],
            counterpart: { kind: 'client', name: 'Lactis Demo SRL' },
            businessDate: '2026-11-07',
            channel: 'email',
          },
        }),
      );
      expectedRevision = response.revision;
    }
    await ok(id, MANAGER, 'exchanges', {
      direction: 'sent',
      itemKind: 'certificate',
      attachmentIds: [attachmentId],
      counterpart: { kind: 'other', name: 'Fictional carrier' },
      businessDate: '2026-11-07',
      channel: 'email',
    });
    expect(
      records(record((await read(id)).release).revisions)[0]?.transmission,
    ).toBeNull();
    await ok(id, MANAGER, 'exchanges', {
      direction: 'sent',
      itemKind: 'certificate',
      attachmentIds: [attachmentId],
      counterpart: { kind: 'client', name: 'Lactis Demo SRL' },
      businessDate: '2026-11-07',
      channel: 'email',
    });
    const current = await read(id);
    const transmission = record(
      records(record(current.release).revisions)[0]?.transmission,
    );
    expect(transmission.sequence).toBe(203);
    expect(record(current.exchanges).total).toBe(203);
    await ok(id, MANAGER, 'exchanges/203', {
      reason: 'The declared transmission was actually a received record.',
      direction: 'received',
      itemKind: 'certificate',
      attachmentIds: [attachmentId],
      counterpart: { kind: 'client', name: 'Lactis Demo SRL' },
      businessDate: '2026-11-07',
      channel: 'email',
    });
    expect(
      records(record((await read(id)).release).revisions)[0]?.transmission,
    ).toBeNull();
  }, 120_000);
});
