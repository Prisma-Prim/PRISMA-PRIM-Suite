import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ActorContext } from '../access/access.types.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  documentCorrectionCommands,
  documentProjectEvents,
  documentRegistrationEvents,
  documentVersionCommands,
  receivedContractDocumentRelations,
  workingDocuments,
} from '../database/schema/index.js';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { registerReceivedContract } from './received-contract.test-support.js';

type Source = 'registration' | 'correction' | 'version' | 'association';
const sources: Source[] = [
  'registration',
  'correction',
  'version',
  'association',
];
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

withPostgres('Activity-readable Documents through real PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let received: Awaited<ReturnType<typeof registerReceivedContract>>;
  let actor: ActorContext;
  let companyId: string;
  let clientId: string;
  let projectId: string;
  let ordinary: Record<string, unknown>;
  let mission: Record<string, unknown>;
  const queries: { sql: string; params: unknown[] }[] = [];
  const db = () => drizzle(fixture.pool);
  const service = () =>
    new AccountabilityService(
      new DatabaseContext(
        drizzle({
          client: fixture.pool,
          logger: { logQuery: (sql, params) => queries.push({ sql, params }) },
        }),
      ),
    );
  const read = (path: string) =>
    fixture.read({ path, companyId, headers: ESTIMATE_OFFER_PREPARER });
  const grant = (path: string) =>
    fixture.grant({
      path,
      companyId,
      membershipId: actor.workspaceMembershipId,
    });
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture();
  });
  afterAll(async () => fixture?.close());
  beforeEach(async () => {
    await fixture.reset();
    received = await registerReceivedContract(fixture);
    ({ companyId, clientId } = received.ready.source);
    const resolved = responseRecord(await read('/access/current-actor'));
    actor = {
      internalUserId: responseString(resolved, 'internalUserId'),
      workspaceMembershipId: responseString(resolved, 'workspaceMembershipId'),
      workspaceId: responseString(resolved, 'workspaceId'),
      workspaceName: responseString(resolved, 'workspaceName'),
      displayName: responseString(resolved, 'displayName'),
      email: responseString(resolved, 'email'),
      active: true,
      workspacePermissions: [],
      activeCompany: {
        id: companyId,
        displayName: 'Synthetic internal Offer Company',
        clientPermissions: ['client.read'],
        documentPermissions: [
          'document.read',
          'document.mission_deliverable.access',
          'document.received_contract.access',
        ],
        projectPermissions: ['project.read'],
      },
    };
    for (const path of [
      '/company-mission-deliverable-access-assignments',
      '/company-project-assignments',
      '/company-document-project-organizer-assignments',
    ])
      await grant(path);
    const captured = responseRecord(
      responseRecord(await read('/access/current-actor')).activeCompany,
    );
    if (!actor.activeCompany) throw new Error('Expected selected Company.');
    actor.activeCompany = {
      ...actor.activeCompany,
      missionDeliverableAccessAssignmentId: responseString(
        captured,
        'missionDeliverableAccessAssignmentId',
      ),
      missionDeliverableAccessPermissionSetVersion: 'v1',
      receivedContractAccessAssignmentId: responseString(
        captured,
        'receivedContractAccessAssignmentId',
      ),
      receivedContractAccessPermissionSetVersion: 'v1',
    };
    const create = async (body: unknown) =>
      responseRecord(
        await fixture.command({
          path: '/documents',
          companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body,
        }),
      );
    ordinary = await create({
      clientId,
      title: 'Visible questionnaire DEMO',
      purpose: 'Private ordinary purpose',
      url: 'https://example.test/private-reference',
    });
    mission = await create({
      type: 'mission-deliverable',
      clientId,
      title: 'Hidden mission DEMO',
      purpose: 'Private mission purpose',
    });
    projectId = responseString(
      responseRecord(
        await fixture.command({
          path: '/projects',
          companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: { clientAccountId: clientId, title: 'Historical Project DEMO' },
        }),
      ),
      'id',
    );
    queries.length = 0;
  });

  // Native read fixtures keep all constraints/triggers enabled. These are not
  // claims that bulk rows were produced by public mutation commands.
  async function seedEvents(input: {
    source: Source;
    document: Record<string, unknown>;
    count: number;
    time: string;
  }) {
    const documentId = responseString(input.document, 'id');
    const [document] = await db()
      .select()
      .from(workingDocuments)
      .where(eq(workingDocuments.id, documentId));
    if (!document) throw new Error('Missing native read fixture Document.');
    const common = {
      workspaceId: actor.workspaceId,
      companyId,
      documentId,
      actorMembershipId: actor.workspaceMembershipId,
      occurredAt: new Date(input.time),
    };
    const ids = Array.from({ length: input.count }, () => randomUUID());
    if (input.source === 'registration') {
      const [relation] = await db()
        .select()
        .from(receivedContractDocumentRelations)
        .where(eq(receivedContractDocumentRelations.documentId, documentId));
      await db().transaction(async (transaction) => {
        for (const id of ids) {
          const targetId = randomUUID();
          await transaction.insert(workingDocuments).values({
            ...document,
            id: targetId,
            idempotencyKey: targetId,
          });
          if (relation)
            await transaction
              .insert(receivedContractDocumentRelations)
              .values({ ...relation, documentId: targetId });
          await transaction
            .insert(documentRegistrationEvents)
            .values({ ...common, id, documentId: targetId });
        }
      });
    } else if (input.source === 'correction') {
      await db()
        .insert(documentCorrectionCommands)
        .values(
          ids.map(
            (id, index): typeof documentCorrectionCommands.$inferInsert => ({
              ...common,
              id,
              idempotencyKey: id,
              requestFingerprint: id,
              expectedRevision: index + 1,
              revision: index + 2,
              outcome: 'corrected',
              beforeTitle: 'Private previous title',
              afterTitle: 'Private corrected title',
              beforePurpose: 'Private previous purpose',
              afterPurpose: 'Private corrected purpose',
              beforeUrl:
                document.type === 'questionnaire'
                  ? 'https://example.test/before'
                  : null,
              afterUrl:
                document.type === 'questionnaire'
                  ? 'https://example.test/after'
                  : null,
            }),
          ),
        );
    } else if (input.source === 'version') {
      const versionId = responseString(
        responseRecord(input.document.version),
        'id',
      );
      await db()
        .insert(documentVersionCommands)
        .values(
          ids.map((id, index): typeof documentVersionCommands.$inferInsert => ({
            ...common,
            id,
            idempotencyKey: id,
            requestFingerprint: id,
            expectedRevision: index + 1,
            revision: index + 2,
            action: 'representation_added',
            versionId,
            versionNumber: 1,
            representationId: randomUUID(),
            representationForm: 'other',
            appendedAfterDesignation: false,
          })),
        );
    } else {
      await db()
        .insert(documentProjectEvents)
        .values(
          ids.map((id, index): typeof documentProjectEvents.$inferInsert => ({
            ...common,
            id,
            idempotencyKey: id,
            expectedRevision: index,
            revision: index + 1,
            projectId,
            action: index % 2 ? 'unlink' : 'link',
          })),
        );
    }
    return ids.sort((left, right) => right.localeCompare(left));
  }
  async function revokeFamilies() {
    for (const path of [
      '/company-mission-deliverable-access-assignments',
      '/company-received-contract-access-assignments',
    ]) {
      const response = await fixture.request({
        path: `${path}/${actor.workspaceMembershipId}/${companyId}`,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': randomUUID() },
        },
      });
      expect(response.status).toBe(200);
    }
  }
  it.each(sources)(
    'qualifies %s before the event limit and keeps distinct events',
    async (source) => {
      const visibleIds = await seedEvents({
        source,
        document: ordinary,
        count: 50,
        time: '2030-01-01T00:00:00.123Z',
      });
      const hiddenIds = [];
      for (const document of [mission, received.document])
        hiddenIds.push(
          ...(await seedEvents({
            source,
            document,
            count: 51,
            time: '2030-01-02T00:00:00.456Z',
          })),
        );
      // Supported captures initially admit the newer family events.
      const before = responseRecord(await read('/activity-log'));
      expect(Array.isArray(before.events) && before.events.length).toBe(50);
      expect(JSON.stringify(before)).not.toContain(visibleIds[0]);
      await revokeFamilies();
      const page = responseRecord(await read('/activity-log'));
      if (!Array.isArray(page.events))
        throw new Error('Expected Activity events.');
      const events = page.events.map(responseRecord);
      expect(events.map((event) => event.id)).toEqual(visibleIds);
      expect(await service().listForActor(actor)).toEqual(page);
      for (const event of events) {
        expect(Object.keys(event).sort()).toEqual([
          'action',
          'actor',
          'id',
          'metadata',
          'occurredAt',
          'target',
        ]);
        const target = responseRecord(event.target);
        expect(Object.keys(target).sort()).toEqual(
          source === 'association'
            ? [
                'companyId',
                'documentId',
                'documentTitle',
                'projectId',
                'projectTitle',
                'type',
              ]
            : source === 'correction'
              ? ['companyId', 'documentId', 'type']
              : ['companyId', 'documentId', 'documentTitle', 'type'],
        );
        if (source === 'association') {
          expect([
            'document.project.linked',
            'document.project.unlinked',
          ]).toContain(event.action);
          expect(target.projectId).toBe(projectId);
        } else {
          expect(event.action).toBe(
            source === 'registration'
              ? 'document.registered'
              : source === 'correction'
                ? 'document.corrected'
                : 'document.representation.added',
          );
        }
        expect(event.occurredAt).toBe('2030-01-01T00:00:00.123Z');
        expect(event.actor).toEqual({
          internalUserId: actor.internalUserId,
          displayName: actor.displayName,
        });
        expect(event.metadata).toEqual(
          source === 'version'
            ? {
                versionNumber: 1,
                form: 'other',
                appendedAfterDesignation: false,
              }
            : {},
        );
      }
      const serialized = JSON.stringify(page);
      for (const hidden of [
        ...hiddenIds,
        'Hidden mission DEMO',
        'Received Contract DEMO',
        'Private ordinary purpose',
        'example.test',
      ])
        expect(serialized).not.toContain(hidden);
      if (source === 'registration') {
        queries.length = 0;
        expect(
          (await service().documentEvents(actor)).map((event) => event.id),
        ).toEqual(visibleIds);
        expect(queries).toHaveLength(1);
      }
    },
  );

  it('preserves supplied-Actor admission and the Workspace Client alternative', async () => {
    const company = actor.activeCompany;
    if (!company) throw new Error('Expected the selected test Company.');
    const denied: ActorContext[] = [
      { ...actor, active: false },
      { ...actor, activeCompany: undefined },
      { ...actor, activeCompany: { ...company, documentPermissions: [] } },
      { ...actor, activeCompany: { ...company, clientPermissions: [] } },
    ];
    for (const supplied of denied) {
      queries.length = 0;
      expect(await service().documentEvents(supplied)).toEqual([]);
      expect(queries).toHaveLength(0);
    }
    const companyReader = await service().documentEvents(actor);
    queries.length = 0;
    expect(
      await service().documentEvents({
        ...actor,
        workspacePermissions: ['client.manage'],
        activeCompany: { ...company, clientPermissions: [] },
      }),
    ).toEqual(companyReader);
    expect(queries).toHaveLength(1);
    // Ordinary admission is deliberately the supplied context, not a new
    // Registrar lookup; family authority is independently live in SQL.
    const revoked = await fixture.request({
      path: `/company-document-registrar-assignments/${actor.workspaceMembershipId}/${companyId}`,
      init: { method: 'DELETE', headers: { 'idempotency-key': randomUUID() } },
    });
    expect(revoked.status).toBe(200);
    expect(await service().documentEvents(actor)).toEqual(companyReader);
    expect(JSON.stringify(await read('/activity-log'))).not.toContain(
      responseString(ordinary, 'id'),
    );
    expect(
      await service().documentEvents({ ...actor, workspaceId: randomUUID() }),
    ).toEqual([]);
    expect(
      await service().documentEvents({
        ...actor,
        activeCompany: { ...company, id: randomUUID() },
      }),
    ).toEqual([]);
  });

  it('keeps live family revocation and regrant semantics for the unchanged Actor', async () => {
    const original = await service().documentEvents(actor);
    expect(original).toHaveLength(3);
    await revokeFamilies();
    const ordinaryOnly = await service().documentEvents(actor);
    expect(ordinaryOnly.map((event) => event.target.documentId)).toEqual([
      responseString(ordinary, 'id'),
    ]);
    const missionGrant = await grant(
      '/company-mission-deliverable-access-assignments',
    );
    const receivedGrant = await grant(
      '/company-received-contract-access-assignments',
    );
    expect(responseString(responseRecord(missionGrant), 'id')).not.toBe(
      actor.activeCompany?.missionDeliverableAccessAssignmentId,
    );
    expect(responseString(responseRecord(receivedGrant), 'id')).not.toBe(
      actor.activeCompany?.receivedContractAccessAssignmentId,
    );
    expect(await service().documentEvents(actor)).toEqual(original);
  });

  it.each([null, 'v999'])(
    'hides every family source for unsupported live capture %s with the Actor unchanged',
    async (capture) => {
      const initial = await service().documentEvents(actor);
      const hiddenIds = initial
        .filter(
          (event) => event.target.documentId !== responseString(ordinary, 'id'),
        )
        .map((event) => event.id);
      const visibleIds: string[] = [];
      for (const source of sources) {
        visibleIds.push(
          ...(await seedEvents({
            source,
            document: ordinary,
            count: 1,
            time: '2030-01-01T00:00:00.123Z',
          })),
        );
        for (const document of [mission, received.document])
          hiddenIds.push(
            ...(await seedEvents({
              source,
              document,
              count: 1,
              time: '2030-01-02T00:00:00.456Z',
            })),
          );
      }
      const before = await service().listForActor(actor);
      // Same future-capture seam as the existing family access suites. Current
      // writes prohibit these states; restore the native CHECK after the probe.
      const definition = await fixture.pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
      );
      const check = definition.rows[0]?.definition;
      if (!check?.startsWith('CHECK ('))
        throw new Error('Missing captured-version CHECK.');
      await fixture.pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        await fixture.pool.query(
          "UPDATE company_role_assignments SET permission_set_version=$1 WHERE company_id=$2 AND workspace_membership_id=$3 AND bundle IN ('company_mission_deliverable_access','company_received_contract_access')",
          [capture, companyId, actor.workspaceMembershipId],
        );
        expect(await service().listForActor(actor)).toEqual({
          events: before.events.filter(
            (event) => !('id' in event) || !hiddenIds.includes(event.id),
          ),
        });
        expect(
          (await service().documentEvents(actor)).map(
            (event) => event.target.documentId,
          ),
        ).toContain(responseString(ordinary, 'id'));
        const publicPage = JSON.stringify(await read('/activity-log'));
        for (const id of hiddenIds) expect(publicPage).not.toContain(id);
        for (const id of visibleIds) expect(publicPage).toContain(id);
      } finally {
        await fixture.pool.query(
          "UPDATE company_role_assignments SET permission_set_version='v1' WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle IN ('company_mission_deliverable_access','company_received_contract_access')",
          [companyId, actor.workspaceMembershipId],
        );
        await fixture.pool.query(
          'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
            check,
        );
      }
      expect(await service().listForActor(actor)).toEqual(before);
    },
  );

  it('reads recorded link and unlink after removal, with exact original Client and both endpoint rights', async () => {
    const ids = await seedEvents({
      source: 'association',
      document: ordinary,
      count: 2,
      time: '2030-01-01T00:00:00.123Z',
    });
    const page = responseRecord(await read('/activity-log'));
    if (!Array.isArray(page.events)) throw new Error('Expected events.');
    expect(
      page.events.slice(0, 2).map((event: unknown) => responseRecord(event).id),
    ).toEqual(ids);
    const [stored] = await db()
      .select()
      .from(workingDocuments)
      .where(eq(workingDocuments.id, responseString(ordinary, 'id')));
    expect(stored?.projectId).toBeNull();
    const company = actor.activeCompany;
    if (!company) throw new Error('Expected selected Company.');
    const documentOnly = await service().listForActor({
      ...actor,
      activeCompany: { ...company, projectPermissions: [] },
    });
    for (const id of [...ids, projectId, 'Historical Project DEMO'])
      expect(JSON.stringify(documentOnly)).not.toContain(id);
    // There is no public archive endpoint. Native parent transitions exercise
    // the existing read boundary; no Document identity is changed.
    await fixture.pool.query(
      "UPDATE client_accounts SET status='superseded' WHERE id=$1",
      [clientId],
    );
    expect(await read('/activity-log')).toEqual(page);
    await fixture.pool.query(
      "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1 AND company_id=$2",
      [clientId, companyId],
    );
    for (const id of ids)
      expect(JSON.stringify(await read('/activity-log'))).not.toContain(id);
    await fixture.pool.query(
      "UPDATE client_company_relationships SET status='active' WHERE client_account_id=$1 AND company_id=$2",
      [clientId, companyId],
    );
    expect(await read('/activity-log')).toEqual(page);
    await fixture.pool.query(
      "UPDATE client_accounts SET status='archived' WHERE id=$1",
      [clientId],
    );
    for (const id of ids)
      expect(JSON.stringify(await read('/activity-log'))).not.toContain(id);
  });

  it('rejects a recorded Project with another original Client or foreign scope', async () => {
    const otherClient = responseRecord(
      await fixture.command({
        path: '/clients',
        companyId,
        body: { displayName: 'Other original Client DEMO' },
      }),
    );
    const otherProject = responseRecord(
      await fixture.command({
        path: '/projects',
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          clientAccountId: responseString(otherClient, 'id'),
          title: 'Hidden other-original Project DEMO',
        },
      }),
    );
    const eventId = randomUUID();
    await db()
      .insert(documentProjectEvents)
      .values({
        id: eventId,
        workspaceId: actor.workspaceId,
        companyId,
        documentId: responseString(ordinary, 'id'),
        projectId: responseString(otherProject, 'id'),
        actorMembershipId: actor.workspaceMembershipId,
        action: 'link',
        expectedRevision: 0,
        revision: 1,
        idempotencyKey: eventId,
        occurredAt: new Date('2030-01-01T00:00:00.123Z'),
      });
    const direct = await service().listForActor(actor);
    expect(JSON.stringify(direct)).not.toContain(eventId);
    expect(JSON.stringify(await read('/activity-log'))).not.toContain(eventId);
    const company = actor.activeCompany;
    if (!company) throw new Error('Expected selected Company.');
    const foreignCompany = responseRecord(
      await fixture.command({
        path: '/companies',
        body: { displayName: 'Foreign scope Company DEMO' },
      }),
    );
    for (const supplied of [
      { ...actor, workspaceId: randomUUID() },
      {
        ...actor,
        activeCompany: { ...company, id: responseString(foreignCompany, 'id') },
      },
    ]) {
      expect(await service().documentEvents(supplied)).toEqual([]);
      const hidden = JSON.stringify(await service().listForActor(supplied));
      for (const id of [eventId, responseString(ordinary, 'id'), projectId])
        expect(hidden).not.toContain(id);
    }
  });
});
