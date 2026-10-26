import { prepareReportedSigning } from './reported-contract-signing.test-support.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import { PDF_A } from '../documents/mission-document.test-support.js';
import { revokeModelContractFixtureGrant } from './model-contract.test-fixture.js';
import { receivedContractEffects } from '../documents/received-contract.test-support.js';
import {
  ESTIMATE_OFFER_WORKSPACE,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Reported Contract signing public REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });

  const ready = () => prepareReportedSigning(fixture);
  async function effects() {
    const found = await receivedContractEffects(fixture.pool);
    for (const table of [
      'contracts',
      'contract_versions',
      'contract_commands',
      'contract_quality_runs',
      'contract_signing_declarations',
      'contract_events',
      'offer_client_responses',
    ]) {
      const result = await fixture.pool.query<{ facts: unknown }>(
        `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) facts FROM ${table} t`,
      );
      found[table] = result.rows[0]?.facts;
    }
    return found;
  }

  it('conserves one unverified declaration from an exact received PDF without accepting the Offer', async () => {
    const { f, body, path, target, documentVersionId } = await ready();
    const key = randomUUID();
    const recorded = await fixture.command({ ...target, path, body, key });
    expect(recorded).toMatchObject({
      evidenceKind: 'DECLARED_RECEIVED_PDF',
      provenance: 'COMPANY_MODEL_OFFER',
      provisional: true,
      caseAcceptance: 'DECLARED',
      revision: 3,
      providerSignatory: body.providerSignatory,
      clientSignatory: body.clientSignatory,
    });
    await fixture.restart();
    expect(await fixture.command({ ...target, path, body, key })).toEqual(
      recorded,
    );
    const current = responseRecord(
      await fixture.read({ ...target, path: f.ready.path }),
    );
    expect(responseRecord(current.contract)).toMatchObject({
      revision: 3,
      version: { executionState: 'EXECUTED', signature: recorded },
    });
    const offer = responseRecord(
      await fixture.read({ ...target, path: f.ready.flow.path }),
    );
    expect(responseRecord(responseRecord(offer.offer).version)).toMatchObject({
      clientResponseState: 'PENDING',
      clientResponse: null,
    });
    expect(
      Buffer.from(
        await (
          await f.call(`/versions/${documentVersionId}/content`)
        ).arrayBuffer(),
      ),
    ).toEqual(PDF_A);
  });
  it('withholds only PDF facts after independent rights loss and denies conserved mutation replay', async () => {
    const { f, body, path, target } = await ready();
    const key = randomUUID();
    const recorded = responseRecord(
      await fixture.command({ ...target, path, body, key }),
    );
    for (const route of [
      '/company-contract-signature-declarer-assignments',
      '/company-document-content-reader-assignments',
    ])
      await revokeModelContractFixtureGrant(
        fixture,
        route,
        target.companyId,
        f.ready.source.preparerMembershipId,
      );
    const current = responseRecord(
      responseRecord(await fixture.read({ ...target, path: f.ready.path }))
        .contract,
    );
    expect(responseRecord(responseRecord(current.version).signature)).toEqual({
      ...recorded,
      pdf: { access: 'denied' },
    });
    expect((await fixture.post({ ...target, path, body, key })).status).toBe(
      403,
    );
    for (const route of [
      '/company-contract-signature-declarer-assignments',
      '/company-document-content-reader-assignments',
    ])
      await fixture.grant({
        path: route,
        companyId: target.companyId,
        membershipId: f.ready.source.preparerMembershipId,
      });
    expect(await fixture.command({ ...target, path, body, key })).toEqual(
      recorded,
    );
  });

  it('requires ordinary signature and the new opt-in grant without borrowing model approval authority', async () => {
    const { f, body, path, target } = await ready();
    for (const route of [
      '/company-contract-model-editor-assignments',
      '/company-contract-model-approver-assignments',
      '/company-contract-preparer-assignments',
    ])
      await revokeModelContractFixtureGrant(
        fixture,
        route,
        target.companyId,
        f.ready.source.preparerMembershipId,
      );
    await fixture.pool.query(
      "UPDATE company_role_assignments SET permission_set_version='v1' WHERE workspace_id=$1 AND company_id=$2 AND workspace_membership_id=$3 AND bundle='company_contract_approver' AND revoked_at IS NULL",
      [
        ESTIMATE_OFFER_WORKSPACE,
        target.companyId,
        f.ready.source.preparerMembershipId,
      ],
    );
    expect(await fixture.command({ ...target, path, body })).toMatchObject({
      evidenceKind: 'DECLARED_RECEIVED_PDF',
    });
  });

  it('refuses malformed, partial, future, invalid-Unicode and redundant fields without any effects', async () => {
    const { body, path, target } = await ready();
    const before = await effects();
    const variants: unknown[] = [
      {},
      { ...body, extra: true },
      { ...body, expectedContractRevision: 0 },
      { ...body, expectedContractRevision: 1.5 },
      { ...body, expectedContractRevision: Number.MAX_SAFE_INTEGER + 1 },
      { ...body, documentId: 'foreign' },
      {
        ...body,
        acknowledgedWarningCodes: [
          'MODEL_WORDING_REVIEWED',
          'MODEL_WORDING_REVIEWED',
        ],
      },
      { ...body, acknowledgedWarningCodes: ['UNKNOWN'] },
      { ...body, providerSignatory: null },
      { ...body, providerSignatory: { label: 'Partial' } },
      ...['', ' ', 'a'.repeat(201), 'bad\u0000', 'bad\uD800', 'bad\uDC00'].map(
        (label) => ({
          ...body,
          providerSignatory: { ...body.providerSignatory, label },
        }),
      ),
      ...['2026-10-25', '2026-02-30', '0000-01-01', '2026-1-01', 42].map(
        (signedOn) => ({
          ...body,
          providerSignatory: { ...body.providerSignatory, signedOn },
        }),
      ),
      ...[
        {},
        { kind: 'VERIFIED' },
        { kind: 'UNKNOWN', basis: 'Forbidden' },
        { kind: 'DECLARED_UNVERIFIED', basis: ' ' },
        { kind: 'DECLARED_UNVERIFIED', basis: 'a'.repeat(2001) },
      ].map((mandate) => ({
        ...body,
        clientSignatory: { ...body.clientSignatory, mandate },
      })),
      ...['concordanceBasis', 'acceptanceBasis'].flatMap((field) =>
        ['', 'a'.repeat(2001), 'bad\uD800'].map((value) => ({
          ...body,
          [field]: value,
        })),
      ),
    ];
    for (const candidate of variants)
      expect({
        candidate,
        status: (await fixture.post({ ...target, path, body: candidate }))
          .status,
      }).toMatchObject({ status: 400 });
    expect(await effects()).toEqual(before);
    expect(
      (
        await fixture.post({
          ...target,
          path,
          body: { ...body, acknowledgedWarningCodes: [] },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await fixture.post({
          ...target,
          path,
          body: { ...body, documentVersionId: randomUUID() },
        })
      ).status,
    ).toBe(404);
    expect(await effects()).toEqual(before);
  });

  it('conserves terminal evidence and original creation receipts with no second statement or post-execution successor', async () => {
    const { f, body, path, target } = await ready();
    const original = await fixture.pool.query<{ idempotency_key: string }>(
      "SELECT idempotency_key FROM contract_commands WHERE result_contract_id=$1 AND kind='CREATE'",
      [f.contractId],
    );
    const creationKey = original.rows[0]?.idempotency_key;
    if (!creationKey) throw new Error('Missing original public creation key.');
    const creation = await fixture.command({
      ...target,
      path: f.ready.path + '/from-approved-model',
      body: f.ready.intent,
      key: creationKey,
    });
    const key = randomUUID();
    const recorded = await fixture.command({ ...target, path, body, key });
    const before = await effects();
    expect(
      (
        await fixture.post({
          ...target,
          path,
          body: { ...body, acceptanceBasis: 'Different intent' },
          key,
        })
      ).status,
    ).toBe(409);
    expect((await fixture.post({ ...target, path, body })).status).toBe(409);
    expect(
      (
        await fixture.post({
          ...target,
          path: f.ready.path + '/versions/from-approved-model',
          body: { ...f.ready.intent, expectedContractRevision: 3 },
        })
      ).status,
    ).toBe(409);
    expect(await fixture.command({ ...target, path, body, key })).toEqual(
      recorded,
    );
    expect(
      await fixture.command({
        ...target,
        path: f.ready.path + '/from-approved-model',
        body: f.ready.intent,
        key: creationKey,
      }),
    ).toEqual(creation);
    expect(await effects()).toEqual(before);
    await expect(
      fixture.pool.query(
        "UPDATE contract_signing_declarations SET statement=jsonb_set(statement,'{acceptanceBasis}','\"replacement\"'::jsonb) WHERE contract_id=$1",
        [f.contractId],
      ),
    ).rejects.toHaveProperty('code', '23514');
    await expect(
      fixture.pool.query(
        'DELETE FROM contract_signing_declarations WHERE contract_id=$1',
        [f.contractId],
      ),
    ).rejects.toHaveProperty('code', '23514');
  });

  it('rolls back declaration, fresh checks, revision, Client fence, receipt and event after final event failure', async () => {
    const { body, path, target } = await ready();
    const before = await effects();
    await fixture.pool.query(
      "CREATE FUNCTION fail_signing_event_for_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='contract_version.signing_declared' THEN RAISE EXCEPTION 'Synthetic final event failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_signing_event_for_test BEFORE INSERT ON contract_events FOR EACH ROW EXECUTE FUNCTION fail_signing_event_for_test()",
    );
    expect((await fixture.post({ ...target, path, body })).status).toBe(500);
    expect(await effects()).toEqual(before);
    await fixture.pool.query(
      'DROP TRIGGER fail_signing_event_for_test ON contract_events; DROP FUNCTION fail_signing_event_for_test()',
    );
    expect((await fixture.post({ ...target, path, body })).status).toBe(201);
  });

  it('independently refuses a forged execution flag and preserves formerly official received PDF selection', async () => {
    const { f, body, path, target, documentVersionId } = await ready();
    const before = await effects();
    await expect(
      fixture.pool.query(
        "UPDATE contract_versions SET execution_state='EXECUTED' WHERE id=$1",
        [f.contractVersionId],
      ),
    ).rejects.toHaveProperty('code', '23514');
    expect(await effects()).toEqual(before);
    const next = responseRecord(
      await (await f.mutate('/versions', { expectedRevision: 3 })).json(),
    );
    const nextId = responseString(next, 'versionId');
    expect((await f.upload(nextId, 4, PDF_A)).status).toBe(201);
    expect(
      (
        await f.mutate(`/versions/${nextId}/official-designation`, {
          expectedRevision: 5,
        })
      ).status,
    ).toBe(200);
    const candidates = responseRecord(
      await fixture.read({ ...target, path: path + '/pdf-candidates' }),
    );
    expect(candidates.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ documentVersionId, status: 'superseded' }),
      ]),
    );
    expect(await fixture.command({ ...target, path, body })).toMatchObject({
      pdf: {
        access: 'granted',
        reference: { documentVersionId, status: 'superseded' },
      },
    });
  });

  it('links the existing thirteen-Task pilot after restart without live declaration or PDF grants and conserves original receipts', async () => {
    const { f, body, path, target } = await ready();
    for (const route of [
      '/company-project-template-user-assignments',
      '/company-project-assignments',
      '/company-task-manager-assignments',
    ])
      await fixture.grant({
        path: route,
        companyId: target.companyId,
        membershipId: f.ready.source.preparerMembershipId,
      });
    const project = responseRecord(
      await fixture.command({
        ...target,
        path: '/projects/from-template',
        body: {
          title: 'Representative pilot DEMO',
          clientAccountId: f.ready.source.clientId,
          templateKey: 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE',
          templateVersion: 1,
        },
      }),
    );
    const projectId = responseString(project, 'id');
    const plan = await fixture.read({
      ...target,
      path: `/projects/${projectId}/template`,
    });
    expect(
      responseRecord(responseRecord(plan).template).activities,
    ).toHaveLength(13);
    const tasks = await fixture.read({
      ...target,
      path: `/projects/${projectId}/tasks`,
    });
    expect(responseRecord(tasks).tasks).toHaveLength(13);
    const key = randomUUID();
    const recorded = await fixture.command({ ...target, path, body, key });
    await fixture.restart();
    for (const route of [
      '/company-contract-signature-declarer-assignments',
      '/company-document-content-reader-assignments',
      '/company-received-contract-access-assignments',
    ])
      await revokeModelContractFixtureGrant(
        fixture,
        route,
        target.companyId,
        f.ready.source.preparerMembershipId,
      );
    expect(
      responseRecord(
        await fixture.read({
          ...target,
          path: f.ready.path + '/project-candidates',
        }),
      ).items,
    ).toEqual([
      expect.objectContaining({ id: projectId, alreadyLinked: false }),
    ]);
    const linkKey = randomUUID(),
      linkBody = { expectedContractRevision: 3, projectId };
    const link = await fixture.command({
      ...target,
      path: f.ready.path + '/projects',
      body: linkBody,
      key: linkKey,
    });
    expect(link).toMatchObject({
      contractId: f.contractId,
      projectId,
      revision: 4,
      created: false,
    });
    await fixture.restart();
    expect(
      await fixture.command({
        ...target,
        path: f.ready.path + '/projects',
        body: linkBody,
        key: linkKey,
      }),
    ).toEqual(link);
    const current = responseRecord(
      responseRecord(await fixture.read({ ...target, path: f.ready.path }))
        .contract,
    );
    expect(current).toMatchObject({
      revision: 4,
      linkedProjects: [expect.objectContaining({ id: projectId })],
      version: {
        executionState: 'EXECUTED',
        signature: {
          evidenceKind: 'DECLARED_RECEIVED_PDF',
          pdf: { access: 'denied' },
        },
      },
    });
    expect(
      await fixture.read({ ...target, path: `/projects/${projectId}/tasks` }),
    ).toEqual(tasks);
    expect(
      await fixture.read({
        ...target,
        path: `/projects/${projectId}/template`,
      }),
    ).toEqual(plan);
    expect(
      (
        await fixture.pool.query<{ count: number }>(
          'SELECT count(*)::int count FROM projects WHERE company_id=$1',
          [target.companyId],
        )
      ).rows[0]?.count,
    ).toBe(1);
    for (const route of [
      '/company-contract-signature-declarer-assignments',
      '/company-document-content-reader-assignments',
      '/company-received-contract-access-assignments',
    ])
      await fixture.grant({
        path: route,
        companyId: target.companyId,
        membershipId: f.ready.source.preparerMembershipId,
      });
    expect(await fixture.command({ ...target, path, body, key })).toEqual(
      recorded,
    );
  });

  it('retains ordinary create-and-link candidate acknowledgement and its original receipt after a qualifying declaration', async () => {
    const { f, body, path, target } = await ready();
    await fixture.grant({
      path: '/company-project-assignments',
      companyId: target.companyId,
      membershipId: f.ready.source.preparerMembershipId,
    });
    await fixture.command({ ...target, path, body });
    const createPath = f.ready.path + '/projects/create',
      key = randomUUID();
    const intent = {
      expectedContractRevision: 3,
      title: 'Deliberately created second test Project DEMO',
      acknowledgedCandidateProjectIds: [],
    };
    expect(
      (
        await fixture.post({
          ...target,
          path: createPath,
          body: { ...intent, acknowledgedCandidateProjectIds: [randomUUID()] },
        })
      ).status,
    ).toBe(409);
    const receipt = await fixture.command({
      ...target,
      path: createPath,
      body: intent,
      key,
    });
    expect(receipt).toMatchObject({
      project: { title: intent.title },
      link: { contractId: f.contractId, revision: 4, created: true },
    });
    await fixture.restart();
    expect(
      await fixture.command({ ...target, path: createPath, body: intent, key }),
    ).toEqual(receipt);
    expect(
      (
        await fixture.pool.query<{ count: number }>(
          'SELECT count(*)::int count FROM projects WHERE company_id=$1',
          [target.companyId],
        )
      ).rows[0]?.count,
    ).toBe(1);
  });
});
