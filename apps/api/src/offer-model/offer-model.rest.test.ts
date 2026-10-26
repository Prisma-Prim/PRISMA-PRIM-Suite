import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import { createPostgresRestTestHarness } from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const workspaceId = '00000000-0000-4000-8000-000000000847';
const modelPath = '/offer-models/consulting-ro';

const content = {
  sourceKind: 'ILLUSTRATIVE',
  sourceDescription:
    ' Synthetic model for the representative consulting journey ',
  issuer: {
    legalName: 'Furnizor demonstrativ',
    taxId: 'SYNTHETIC-847',
    legalAddress: 'Adresă demonstrativă',
    contactDetails: null,
  },
  serviceTitle: 'Consultanță pentru un sistem integrat demonstrativ',
  frameworks: [{ name: 'Cadru demonstrativ', edition: 'Ediție sintetică 1' }],
  sections: {
    introduction: ' Introducere demonstrativă\n<script>literal()</script> ',
    providerProfile: 'Profil demonstrativ',
    scope: 'Domeniu demonstrativ',
    objectives: 'Obiective demonstrative',
    assessmentGuidance: 'Date declarate pentru exemplul sintetic',
    methodology: 'Metodologie demonstrativă',
    deliverables: 'Rezultate planificate demonstrative',
    realizationConditions: 'Condiții demonstrative de realizare',
    paymentConditions: 'Text demonstrativ, fără scadențe sau sume reale',
    closingRationale: 'Încheiere demonstrativă',
  },
  stages: Array.from({ length: 18 }, (_, index) => ({
    title: `Etapă demonstrativă ${index + 1}`,
    plannedActivity: `Activitate planificată demonstrativă ${index + 1}`,
    intendedResult: `Rezultat intenționat demonstrativ ${index + 1}`,
  })),
};

withPostgres('Company consulting Offer model public REST', () => {
  let database: Awaited<ReturnType<typeof createIsolatedPostgresTestDatabase>>;
  let harness: Awaited<ReturnType<typeof createPostgresRestTestHarness>>;

  function startHarness() {
    return createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock: { now: () => new Date('2026-10-24T12:00:00.000Z') },
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'model-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Offer model Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          ['model-editor', 'model-reviewer'].map((subject) => ({
            provider: 'deterministic-test',
            subject,
            workspaceId,
          })),
        ),
      },
    });
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'offer_model847',
    });
    try {
      harness = await startHarness();
    } catch (error) {
      await database.close();
      throw error;
    }
  });

  beforeEach(async () => {
    await harness.pool.query('TRUNCATE workspaces, internal_users CASCADE');
  });

  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  async function request({
    path,
    subject = 'model-owner',
    companyId,
    body,
    key = randomUUID(),
    method,
    workspaceContextId = workspaceId,
  }: {
    path: string;
    subject?: string;
    companyId?: string;
    body?: unknown;
    key?: string;
    method?: 'GET' | 'POST' | 'DELETE';
    workspaceContextId?: string;
  }) {
    const requestMethod = method ?? (body === undefined ? 'GET' : 'POST');
    return fetch(`${harness.origin}/api${path}`, {
      method: requestMethod,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-email': `${subject}@example.test`,
        'x-test-display-name': subject,
        'x-workspace-context-id': workspaceContextId,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        ...(requestMethod === 'GET' ? {} : { 'idempotency-key': key }),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function success(input: Parameters<typeof request>[0]) {
    const response = await request(input);
    const value: unknown = await response.json();
    expect({ path: input.path, status: response.status, value }).toMatchObject({
      status: input.body === undefined ? 200 : 201,
    });
    return record(value);
  }

  async function prepared(displayName = 'Synthetic model Company') {
    const company = await success({
      path: '/companies',
      body: { displayName },
    });
    const companyId = string(company, 'id');
    for (const [subject, assignment] of [
      ['model-editor', '/company-offer-model-editor-assignments'],
      ['model-reviewer', '/company-offer-model-approver-assignments'],
    ]) {
      if (!subject || !assignment) throw new Error('Missing fixture identity.');
      const actor = await success({ path: '/access/current-actor', subject });
      const workspaceMembershipId = string(actor, 'workspaceMembershipId');
      for (const path of ['/company-context-assignments', assignment])
        await success({ path, body: { workspaceMembershipId, companyId } });
    }
    return companyId;
  }

  it('configures and separately approves exact complete content without needing Client, Opportunity or Offer authority', async () => {
    const companyId = await prepared();
    expect(
      await success({ path: modelPath, subject: 'model-editor', companyId }),
    ).toEqual({ model: null });
    const created = record(
      (
        await success({
          path: `${modelPath}/versions`,
          subject: 'model-editor',
          companyId,
          body: { expectedModelRevision: 0, content },
        })
      ).model,
    );
    const head = record(created.head);
    const versionId = string(head, 'id');
    expect(created).toMatchObject({
      code: 'INTEGRATED_MANAGEMENT_CONSULTING_RO',
      language: 'ro',
      revision: 1,
      activeVersion: null,
      head: { versionNumber: 1, content, decision: null },
    });
    const approved = await success({
      path: `${modelPath}/versions/${versionId}/decision`,
      subject: 'model-reviewer',
      companyId,
      body: {
        versionNumber: 1,
        expectedModelRevision: 1,
        outcome: 'APPROVE',
        basis: ' Exact complete synthetic content reviewed ',
      },
    });
    expect(approved).toMatchObject({
      model: {
        revision: 2,
        activeVersion: { id: versionId, versionNumber: 1 },
        head: {
          id: versionId,
          content,
          decision: {
            outcome: 'APPROVE',
            basis: ' Exact complete synthetic content reviewed ',
            recordedAt: '2026-10-24T12:00:00.000Z',
            actor: { displayName: 'model-reviewer' },
          },
        },
      },
    });
    expect(
      await success({ path: modelPath, subject: 'model-editor', companyId }),
    ).toEqual(approved);
  });
  it.each([
    {
      name: 'unknown source kind',
      content: { ...content, sourceKind: 'APPROVED' },
    },
    { name: 'null source kind', content: { ...content, sourceKind: null } },
    {
      name: 'blank source description',
      content: { ...content, sourceDescription: ' \n ' },
    },
    {
      name: 'missing issuer identity',
      content: { ...content, issuer: { ...content.issuer, legalName: '' } },
    },
    {
      name: 'unsupported issuer field',
      content: {
        ...content,
        issuer: { ...content.issuer, inventedAuthority: true },
      },
    },
    {
      name: 'missing edition',
      content: { ...content, frameworks: [{ name: 'Synthetic framework' }] },
    },
    { name: 'empty frameworks', content: { ...content, frameworks: [] } },
    {
      name: 'too many frameworks',
      content: {
        ...content,
        frameworks: Array.from({ length: 11 }, () => ({
          name: 'Synthetic framework',
          edition: 'Synthetic edition',
        })),
      },
    },
    {
      name: 'missing sections',
      content: { ...content, sections: { introduction: 'Only one section' } },
    },
    {
      name: 'extra section',
      content: {
        ...content,
        sections: {
          ...content.sections,
          guaranteeOfCertification: 'Unsupported',
        },
      },
    },
    {
      name: 'oversized narrative',
      content: {
        ...content,
        sections: { ...content.sections, scope: 'x'.repeat(4_001) },
      },
    },
    {
      name: 'seventeen stage rows',
      content: { ...content, stages: content.stages.slice(1) },
    },
    {
      name: 'nineteen stage rows',
      content: {
        ...content,
        stages: [
          ...content.stages,
          {
            title: 'Extra synthetic stage',
            plannedActivity: 'Extra planned activity',
            intendedResult: 'Extra intended result',
          },
        ],
      },
    },
    {
      name: 'missing intended result',
      content: {
        ...content,
        stages: content.stages.map((row, index) =>
          index === 0 ? { ...row, intendedResult: ' ' } : row,
        ),
      },
    },
    {
      name: 'aggregate above64KiB',
      content: {
        ...content,
        sections: Object.fromEntries(
          Object.keys(content.sections).map((key) => [key, 'x'.repeat(4_000)]),
        ),
        stages: content.stages.map((row) => ({
          ...row,
          plannedActivity: 'x'.repeat(1_000),
          intendedResult: 'x'.repeat(1_000),
        })),
      },
    },
    {
      name: 'NUL text',
      content: { ...content, serviceTitle: 'Unrecordable\u0000title' },
    },
    {
      name: 'lone surrogate',
      content: { ...content, serviceTitle: 'Unrecordable\ud800title' },
    },
  ])(
    'rejects $name without creating a model or echoing its body',
    async ({ content: invalidContent }) => {
      const companyId = await prepared();
      const response = await request({
        path: `${modelPath}/versions`,
        subject: 'model-editor',
        companyId,
        body: { expectedModelRevision: 0, content: invalidContent },
      });
      expect(response.status).toBe(400);
      const error: unknown = await response.json();
      expect(JSON.stringify(error)).not.toContain(
        'Synthetic model for the representative',
      );
      expect(
        await success({ path: modelPath, subject: 'model-editor', companyId }),
      ).toEqual({ model: null });
    },
  );

  it('preserves valid Unicode and literal markup as content', async () => {
    const companyId = await prepared();
    const literalContent = {
      ...content,
      serviceTitle: '🙂 <script>literal()</script> Șțî',
    };
    expect(
      await success({
        path: `${modelPath}/versions`,
        subject: 'model-editor',
        companyId,
        body: { expectedModelRevision: 0, content: literalContent },
      }),
    ).toMatchObject({ model: { head: { content: literalContent } } });
  });

  it('projects complete captured model grants without giving the Workspace owner implicit model authority', async () => {
    const companyId = await prepared();
    const editor = await success({
      path: '/access/current-actor',
      companyId,
      subject: 'model-editor',
    });
    expect(record(editor.activeCompany).offerModelGrants).toEqual([
      {
        bundle: 'company_offer_model_editor',
        assignmentId: expect.any(String),
        permissionSetVersion: 'v1',
        permissions: [
          'commercial.offer.model.read',
          'commercial.offer.model.version.create',
        ],
      },
    ]);
    const reviewer = await success({
      path: '/access/current-actor',
      companyId,
      subject: 'model-reviewer',
    });
    expect(record(reviewer.activeCompany).offerModelGrants).toEqual([
      {
        bundle: 'company_offer_model_approver',
        assignmentId: expect.any(String),
        permissionSetVersion: 'v1',
        permissions: [
          'commercial.offer.model.read',
          'commercial.offer.model.decide',
          'commercial.offer.model.withdraw',
        ],
      },
    ]);
    const owner = await success({ path: '/access/current-actor', companyId });
    expect(record(owner.activeCompany)).not.toHaveProperty('offerModelGrants');
    expect((await request({ path: modelPath, companyId })).status).toBe(403);
  });

  it('keeps editing, approval and Company context independent and hides foreign exact content/history', async () => {
    const companyId = await prepared();
    expect(
      (
        await request({
          path: `${modelPath}/versions`,
          companyId,
          subject: 'model-reviewer',
          body: { expectedModelRevision: 0, content },
        })
      ).status,
    ).toBe(403);
    const first = await success({
      path: `${modelPath}/versions`,
      companyId,
      subject: 'model-editor',
      body: { expectedModelRevision: 0, content },
    });
    const firstId = string(record(record(first.model).head), 'id');
    expect(
      (
        await request({
          path: `${modelPath}/versions/${firstId}/decision`,
          companyId,
          subject: 'model-editor',
          body: {
            expectedModelRevision: 1,
            versionNumber: 1,
            outcome: 'APPROVE',
            basis: 'No independent approval grant',
          },
        })
      ).status,
    ).toBe(403);
    const editor = await success({
      path: '/access/current-actor',
      subject: 'model-editor',
    });
    const membershipId = string(editor, 'workspaceMembershipId');
    await success({
      path: `/company-context-assignments/${membershipId}/${companyId}`,
      method: 'DELETE',
    });
    expect(
      (await request({ path: modelPath, companyId, subject: 'model-editor' }))
        .status,
    ).toBe(403);
    await success({
      path: '/company-context-assignments',
      body: { workspaceMembershipId: membershipId, companyId },
    });
    const secondCompanyId = await prepared('Synthetic second model Company');
    const unavailable = await request({
      path: `${modelPath}/versions/${firstId}`,
      companyId: secondCompanyId,
      subject: 'model-editor',
    });
    expect(unavailable.status).toBe(404);
    expect(JSON.stringify(await unavailable.json())).not.toContain(firstId);
    expect(
      await success({
        path: `${modelPath}/versions`,
        companyId: secondCompanyId,
        subject: 'model-editor',
      }),
    ).toEqual({ versions: [], nextCursor: null });
    expect(
      await success({ path: modelPath, companyId, subject: 'model-editor' }),
    ).toEqual(first);
  });

  it('rejects non-head, stale and repeated decisions while preserving the old active approval after a rejected successor', async () => {
    const companyId = await prepared();
    const first = await success({
      path: `${modelPath}/versions`,
      companyId,
      subject: 'model-editor',
      body: { expectedModelRevision: 0, content },
    });
    const firstId = string(record(record(first.model).head), 'id');
    await success({
      path: `${modelPath}/versions/${firstId}/decision`,
      companyId,
      subject: 'model-reviewer',
      body: {
        expectedModelRevision: 1,
        versionNumber: 1,
        outcome: 'APPROVE',
        basis: 'First synthetic review',
      },
    });
    const second = await success({
      path: `${modelPath}/versions`,
      companyId,
      subject: 'model-editor',
      body: {
        expectedModelRevision: 2,
        content: {
          ...content,
          serviceTitle: 'Synthetic revision awaiting review',
        },
      },
    });
    const secondId = string(record(record(second.model).head), 'id');
    for (const body of [
      {
        expectedModelRevision: 2,
        versionNumber: 2,
        outcome: 'REJECT',
        basis: 'Stale intent',
      },
      {
        expectedModelRevision: 3,
        versionNumber: 1,
        outcome: 'REJECT',
        basis: 'Wrong displayed number',
      },
    ])
      expect(
        (
          await request({
            path: `${modelPath}/versions/${secondId}/decision`,
            companyId,
            subject: 'model-reviewer',
            body,
          })
        ).status,
      ).toBe(409);
    expect(
      (
        await request({
          path: `${modelPath}/versions/${firstId}/decision`,
          companyId,
          subject: 'model-reviewer',
          body: {
            expectedModelRevision: 3,
            versionNumber: 1,
            outcome: 'APPROVE',
            basis: 'Superseded source',
          },
        })
      ).status,
    ).toBe(409);
    const rejected = await success({
      path: `${modelPath}/versions/${secondId}/decision`,
      companyId,
      subject: 'model-reviewer',
      body: {
        expectedModelRevision: 3,
        versionNumber: 2,
        outcome: 'REJECT',
        basis: ' Exact rejection reason ',
      },
    });
    expect(rejected).toMatchObject({
      model: {
        revision: 4,
        activeVersion: { id: firstId },
        head: {
          decision: {
            outcome: 'REJECT',
            basis: ' Exact rejection reason ',
            actor: { displayName: 'model-reviewer' },
          },
        },
      },
    });
    expect(
      (
        await request({
          path: `${modelPath}/versions/${secondId}/decision`,
          companyId,
          subject: 'model-reviewer',
          body: {
            expectedModelRevision: 4,
            versionNumber: 2,
            outcome: 'APPROVE',
            basis: 'Forbidden replacement of rejection',
          },
        })
      ).status,
    ).toBe(409);
    expect(
      await success({ path: modelPath, companyId, subject: 'model-editor' }),
    ).toEqual(rejected);
  });

  it('replays the exact old result after a successor and restart, conflicts across command kinds and checks current authority before receipts', async () => {
    const companyId = await prepared();
    const editor = await success({
      path: '/access/current-actor',
      subject: 'model-editor',
    });
    const workspaceMembershipId = string(editor, 'workspaceMembershipId');
    await success({
      path: '/company-offer-model-approver-assignments',
      body: { companyId, workspaceMembershipId },
    });
    const key = randomUUID();
    const originalIntent = { expectedModelRevision: 0, content };
    const created = await success({
      path: `${modelPath}/versions`,
      subject: 'model-editor',
      companyId,
      key,
      body: originalIntent,
    });
    const firstId = string(record(record(created.model).head), 'id');
    const changed = await success({
      path: `${modelPath}/versions`,
      subject: 'model-editor',
      companyId,
      body: {
        expectedModelRevision: 1,
        content: { ...content, serviceTitle: 'Synthetic successor' },
      },
    });
    const secondId = string(record(record(changed.model).head), 'id');
    await harness.close();
    harness = await startHarness();
    expect(
      await success({
        path: `${modelPath}/versions`,
        subject: 'model-editor',
        companyId,
        key,
        body: originalIntent,
      }),
    ).toEqual(created);
    expect(
      await success({ path: modelPath, subject: 'model-editor', companyId }),
    ).toMatchObject({
      model: {
        revision: 2,
        head: { id: secondId, predecessorVersionId: firstId },
      },
    });
    expect(
      (
        await request({
          path: `${modelPath}/versions`,
          subject: 'model-editor',
          companyId,
          key,
          body: {
            expectedModelRevision: 0,
            content: { ...content, serviceTitle: 'Changed intent' },
          },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request({
          path: `${modelPath}/versions/${secondId}/decision`,
          subject: 'model-editor',
          companyId,
          key,
          body: {
            expectedModelRevision: 2,
            versionNumber: 2,
            outcome: 'APPROVE',
            basis: 'Different kind under the original key',
          },
        })
      ).status,
    ).toBe(409);
    await success({
      path: `/company-offer-model-editor-assignments/${workspaceMembershipId}/${companyId}`,
      method: 'DELETE',
    });
    expect(
      (
        await request({
          path: `${modelPath}/versions`,
          subject: 'model-editor',
          companyId,
          key,
          body: originalIntent,
        })
      ).status,
    ).toBe(403);
    await success({
      path: '/company-offer-model-editor-assignments',
      body: { workspaceMembershipId, companyId },
    });
    expect(
      await success({
        path: `${modelPath}/versions`,
        subject: 'model-editor',
        companyId,
        key,
        body: originalIntent,
      }),
    ).toEqual(created);
    const history = await success({
      path: `${modelPath}/versions`,
      subject: 'model-editor',
      companyId,
    });
    expect(history.versions).toHaveLength(2);
    expect(
      record(
        record(
          (
            await success({
              path: modelPath,
              subject: 'model-editor',
              companyId,
            })
          ).model,
        ).head,
      ).decision,
    ).toBeNull();
  });

  it('pages exact history and preserves approval while a successor is pending, then records withdrawal without rewriting the decision', async () => {
    const companyId = await prepared();
    const first = await success({
      path: `${modelPath}/versions`,
      subject: 'model-editor',
      companyId,
      body: { expectedModelRevision: 0, content },
    });
    const firstId = string(record(record(first.model).head), 'id');
    await success({
      path: `${modelPath}/versions/${firstId}/decision`,
      subject: 'model-reviewer',
      companyId,
      body: {
        expectedModelRevision: 1,
        versionNumber: 1,
        outcome: 'APPROVE',
        basis: 'Synthetic first content reviewed',
      },
    });
    const successorContent = {
      ...content,
      sourceKind: 'COMPANY_SUPPLIED',
      serviceTitle: 'Titlu demonstrativ corectat',
    };
    const second = await success({
      path: `${modelPath}/versions`,
      subject: 'model-editor',
      companyId,
      body: { expectedModelRevision: 2, content: successorContent },
    });
    const secondId = string(record(record(second.model).head), 'id');
    expect(second).toMatchObject({
      model: {
        revision: 3,
        head: {
          id: secondId,
          versionNumber: 2,
          predecessorVersionId: firstId,
          content: successorContent,
          decision: null,
        },
        activeVersion: {
          id: firstId,
          versionNumber: 1,
          sourceKind: 'ILLUSTRATIVE',
        },
      },
    });
    const page = await success({
      path: `${modelPath}/versions?limit=1`,
      subject: 'model-editor',
      companyId,
    });
    expect(page.versions).toMatchObject([
      { id: secondId, versionNumber: 2, sourceKind: 'COMPANY_SUPPLIED' },
    ]);
    const nextCursor = string(page, 'nextCursor');
    const older = await success({
      path: `${modelPath}/versions?limit=1&cursor=${encodeURIComponent(nextCursor)}`,
      subject: 'model-editor',
      companyId,
    });
    expect(older).toMatchObject({
      versions: [{ id: firstId, versionNumber: 1, sourceKind: 'ILLUSTRATIVE' }],
      nextCursor: null,
    });
    const withdrawal = await success({
      path: `${modelPath}/versions/${firstId}/withdrawal`,
      subject: 'model-reviewer',
      companyId,
      body: {
        expectedModelRevision: 3,
        versionNumber: 1,
        reason: ' Exact synthetic withdrawal reason ',
      },
    });
    expect(withdrawal).toMatchObject({
      model: {
        revision: 4,
        activeVersion: null,
        head: { id: secondId, decision: null },
      },
    });
    expect(
      await success({
        path: `${modelPath}/versions/${firstId}`,
        subject: 'model-editor',
        companyId,
      }),
    ).toMatchObject({
      version: {
        id: firstId,
        content,
        decision: {
          outcome: 'APPROVE',
          basis: 'Synthetic first content reviewed',
        },
        withdrawal: {
          reason: ' Exact synthetic withdrawal reason ',
          actor: { displayName: 'model-reviewer' },
          recordedAt: '2026-10-24T12:00:00.000Z',
        },
      },
      currentSelection: { activeVersionId: null },
    });
    expect(
      await success({
        path: `${modelPath}/versions/${secondId}/decision`,
        subject: 'model-reviewer',
        companyId,
        body: {
          expectedModelRevision: 4,
          versionNumber: 2,
          outcome: 'APPROVE',
          basis: 'Second exact synthetic content reviewed',
        },
      }),
    ).toMatchObject({
      model: { revision: 5, activeVersion: { id: secondId } },
    });
  });
  async function effects() {
    const result = await harness.pool.query(`SELECT
      (SELECT count(*)::int FROM offer_models) AS models,
      (SELECT count(*)::int FROM offer_model_versions) AS versions,
      (SELECT count(*)::int FROM offer_model_decisions) AS decisions,
      (SELECT count(*)::int FROM offer_model_withdrawals) AS withdrawals,
      (SELECT count(*)::int FROM offer_model_commands) AS commands,
      (SELECT count(*)::int FROM offer_model_events) AS events`);
    return result.rows;
  }
  async function waitForBlocked(pid: number, count = 1) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await harness.pool.query<{ count: number }>(
        `WITH RECURSIVE waiting AS (
        SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
      ), chain AS (
        SELECT pid FROM waiting WHERE $1 = ANY(blockers)
        UNION SELECT w.pid FROM waiting w JOIN chain c ON c.pid = ANY(w.blockers)
      ) SELECT count(*)::int AS count FROM chain`,
        [pid],
      );
      if ((result.rows[0]?.count ?? 0) >= count) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error(`Expected ${count} requests at the database barrier.`);
  }
  async function orderedCommands(
    companyId: string,
    inputs: [Parameters<typeof request>[0], Parameters<typeof request>[0]],
  ) {
    const barrier = await harness.pool.connect();
    const requests: Promise<Response>[] = [];
    try {
      await barrier.query('BEGIN');
      const pid = (
        await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]?.pid;
      if (!pid) throw new Error('Missing barrier identity.');
      await barrier.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [
          JSON.stringify([
            'offer-model',
            workspaceId,
            companyId,
            'INTEGRATED_MANAGEMENT_CONSULTING_RO',
          ]),
        ],
      );
      requests.push(request(inputs[0]));
      await waitForBlocked(pid);
      requests.push(request(inputs[1]));
      await waitForBlocked(pid, 2);
      await barrier.query('COMMIT');
      return await Promise.all(requests);
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      await Promise.allSettled(requests);
    }
  }

  it.each([true, false])(
    'serializes concurrent first submissions (same key: %s) without duplicate roots, versions or events',
    async (sameKey) => {
      const companyId = await prepared();
      const command = {
        path: `${modelPath}/versions`,
        companyId,
        subject: 'model-editor',
        key: 'first-command',
        body: { expectedModelRevision: 0, content },
      };
      const [first, second] = await orderedCommands(companyId, [
        command,
        { ...command, key: sameKey ? command.key : 'other-command' },
      ]);
      expect([first?.status, second?.status]).toEqual([
        201,
        sameKey ? 201 : 409,
      ]);
      if (sameKey) expect(await first?.json()).toEqual(await second?.json());
      expect(await effects()).toEqual([
        {
          models: 1,
          versions: 1,
          decisions: 0,
          withdrawals: 0,
          commands: 1,
          events: 1,
        },
      ]);
    },
  );

  it.each(['decision', 'successor'] as const)(
    'serializes a pending-head decision against a successor with %s first',
    async (firstKind) => {
      const companyId = await prepared();
      const created = record(
        (
          await success({
            path: `${modelPath}/versions`,
            companyId,
            subject: 'model-editor',
            body: { expectedModelRevision: 0, content },
          })
        ).model,
      );
      const headId = string(record(created.head), 'id');
      const decision = {
        path: `${modelPath}/versions/${headId}/decision`,
        companyId,
        subject: 'model-reviewer',
        body: {
          expectedModelRevision: 1,
          versionNumber: 1,
          outcome: 'APPROVE',
          basis: 'Synthetic concurrent review',
        },
      };
      const successor = {
        path: `${modelPath}/versions`,
        companyId,
        subject: 'model-editor',
        body: {
          expectedModelRevision: 1,
          content: { ...content, serviceTitle: 'Succesor concurent' },
        },
      };
      const results = await orderedCommands(
        companyId,
        firstKind === 'decision'
          ? [decision, successor]
          : [successor, decision],
      );
      expect(results.map((result) => result.status)).toEqual([201, 409]);
      expect(
        await success({ path: modelPath, companyId, subject: 'model-editor' }),
      ).toMatchObject({
        model: {
          revision: 2,
          head: { versionNumber: firstKind === 'decision' ? 1 : 2 },
          activeVersion: firstKind === 'decision' ? { id: headId } : null,
        },
      });
    },
  );

  it.each(['approval', 'withdrawal'] as const)(
    'serializes approval of a successor against withdrawal of the older active model with %s first',
    async (firstKind) => {
      const companyId = await prepared();
      const first = record(
        (
          await success({
            path: `${modelPath}/versions`,
            companyId,
            subject: 'model-editor',
            body: { expectedModelRevision: 0, content },
          })
        ).model,
      );
      const firstId = string(record(first.head), 'id');
      await success({
        path: `${modelPath}/versions/${firstId}/decision`,
        companyId,
        subject: 'model-reviewer',
        body: {
          expectedModelRevision: 1,
          versionNumber: 1,
          outcome: 'APPROVE',
          basis: 'First exact synthetic review',
        },
      });
      const successor = record(
        (
          await success({
            path: `${modelPath}/versions`,
            companyId,
            subject: 'model-editor',
            body: { expectedModelRevision: 2, content },
          })
        ).model,
      );
      const secondId = string(record(successor.head), 'id');
      const approval = {
        path: `${modelPath}/versions/${secondId}/decision`,
        companyId,
        subject: 'model-reviewer',
        body: {
          expectedModelRevision: 3,
          versionNumber: 2,
          outcome: 'APPROVE',
          basis: 'Second exact synthetic review',
        },
      };
      const withdrawal = {
        path: `${modelPath}/versions/${firstId}/withdrawal`,
        companyId,
        subject: 'model-reviewer',
        body: {
          expectedModelRevision: 3,
          versionNumber: 1,
          reason: 'Withdraw first synthetic version',
        },
      };
      const results = await orderedCommands(
        companyId,
        firstKind === 'approval'
          ? [approval, withdrawal]
          : [withdrawal, approval],
      );
      expect(results.map((result) => result.status)).toEqual([201, 409]);
      expect(
        await success({ path: modelPath, companyId, subject: 'model-editor' }),
      ).toMatchObject({
        model: {
          revision: 4,
          activeVersion: firstKind === 'approval' ? { id: secondId } : null,
        },
      });
      expect(
        await success({
          path: `${modelPath}/versions/${firstId}`,
          companyId,
          subject: 'model-editor',
        }),
      ).toMatchObject({
        version: {
          decision: {
            outcome: 'APPROVE',
            basis: 'First exact synthetic review',
          },
          withdrawal:
            firstKind === 'withdrawal'
              ? { reason: 'Withdraw first synthetic version' }
              : null,
        },
      });
    },
  );

  const authorityChanges = [
    {
      name: 'editor revocation',
      lock: "SELECT id FROM company_role_assignments WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle::text = 'company_offer_model_editor' FOR UPDATE",
      change:
        "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle::text = 'company_offer_model_editor'",
    },
    {
      name: 'context revocation',
      lock: "SELECT id FROM company_role_assignments WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle::text = 'company_context_access' FOR UPDATE",
      change:
        "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle::text = 'company_context_access'",
    },
    {
      name: 'membership suspension',
      lock: 'SELECT id FROM workspace_memberships WHERE id = $2 AND workspace_id = (SELECT workspace_id FROM companies WHERE id = $1) FOR UPDATE',
      change:
        "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $2 AND workspace_id = (SELECT workspace_id FROM companies WHERE id = $1)",
    },
    {
      name: 'Company suspension',
      lock: 'SELECT id FROM companies WHERE id = $1 AND workspace_id = (SELECT workspace_id FROM workspace_memberships WHERE id = $2) FOR UPDATE',
      change:
        "UPDATE companies SET status = 'inactive' WHERE id = $1 AND workspace_id = (SELECT workspace_id FROM workspace_memberships WHERE id = $2)",
    },
  ];
  it.each(authorityChanges)(
    'refuses creation waiting behind committed $name',
    async (change) => {
      const companyId = await prepared();
      const member = await success({
        path: '/access/current-actor',
        subject: 'model-editor',
      });
      const values = [companyId, string(member, 'workspaceMembershipId')];
      const before = await effects();
      const barrier = await harness.pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = (
          await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (!pid) throw new Error('Missing barrier.');
        await barrier.query(change.lock, values);
        pending = request({
          path: `${modelPath}/versions`,
          companyId,
          subject: 'model-editor',
          body: { expectedModelRevision: 0, content },
        });
        await waitForBlocked(pid);
        await barrier.query(change.change, values);
        await barrier.query('COMMIT');
        expect((await pending).status).toBe(403);
        expect(await effects()).toEqual(before);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        if (pending) await Promise.allSettled([pending]);
      }
    },
  );
  it.each(authorityChanges)(
    'commits the protected command before queued $name, then denies replay and content',
    async (change) => {
      const companyId = await prepared();
      const member = await success({
        path: '/access/current-actor',
        subject: 'model-editor',
      });
      const values = [companyId, string(member, 'workspaceMembershipId')];
      const command = {
        path: `${modelPath}/versions`,
        companyId,
        subject: 'model-editor',
        key: 'protected-commit',
        body: { expectedModelRevision: 0, content },
      };
      const barrier = await harness.pool.connect();
      let pending: Promise<Response> | undefined;
      let mutation: Promise<unknown> | undefined;
      try {
        await harness.pool
          .query(`CREATE FUNCTION test_pause_offer_model() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(847847); RETURN NEW; END $$;
      CREATE TRIGGER test_pause_offer_model BEFORE INSERT ON offer_model_events FOR EACH ROW EXECUTE FUNCTION test_pause_offer_model()`);
        await barrier.query('BEGIN');
        const pid = (
          await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (!pid) throw new Error('Missing barrier.');
        await barrier.query('SELECT pg_advisory_xact_lock(847847)');
        pending = request(command);
        await waitForBlocked(pid);
        mutation = harness.pool.query(change.change, values);
        await waitForBlocked(pid, 2);
        await barrier.query('COMMIT');
        expect((await pending).status).toBe(201);
        await mutation;
        expect((await request(command)).status).toBe(403);
        expect(
          (
            await request({
              path: modelPath,
              companyId,
              subject: 'model-editor',
            })
          ).status,
        ).toBe(403);
        expect(await effects()).toEqual([
          {
            models: 1,
            versions: 1,
            decisions: 0,
            withdrawals: 0,
            commands: 1,
            events: 1,
          },
        ]);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled([
          ...(pending ? [pending] : []),
          ...(mutation ? [mutation] : []),
        ]);
        await harness.pool.query(
          'DROP TRIGGER IF EXISTS test_pause_offer_model ON offer_model_events; DROP FUNCTION IF EXISTS test_pause_offer_model()',
        );
      }
    },
  );

  it('rolls back content, root, numbering, receipt and restricted event on final event failure, then permits a fresh first intent under the unconsumed key', async () => {
    const companyId = await prepared();
    const before = await effects();
    try {
      await harness.pool
        .query(`CREATE FUNCTION test_fail_model_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private event failure'; END $$;
      CREATE TRIGGER test_fail_model_event AFTER INSERT ON offer_model_events FOR EACH ROW EXECUTE FUNCTION test_fail_model_event()`);
      const failed = await request({
        path: `${modelPath}/versions`,
        companyId,
        subject: 'model-editor',
        key: 'rolled-back',
        body: { expectedModelRevision: 0, content },
      });
      expect(failed.status).toBe(500);
      const diagnostic = JSON.stringify(await failed.json());
      expect(diagnostic).not.toContain(content.issuer.legalName);
      expect(diagnostic).not.toContain('synthetic private event failure');
      expect(await effects()).toEqual(before);
      expect(
        await success({ path: modelPath, companyId, subject: 'model-editor' }),
      ).toEqual({ model: null });
    } finally {
      await harness.pool.query(
        'DROP TRIGGER IF EXISTS test_fail_model_event ON offer_model_events; DROP FUNCTION IF EXISTS test_fail_model_event()',
      );
    }
    expect(
      await success({
        path: `${modelPath}/versions`,
        companyId,
        subject: 'model-editor',
        key: 'rolled-back',
        body: {
          expectedModelRevision: 0,
          content: { ...content, serviceTitle: 'Fresh after rollback' },
        },
      }),
    ).toMatchObject({
      model: {
        revision: 1,
        head: {
          versionNumber: 1,
          content: { serviceTitle: 'Fresh after rollback' },
        },
      },
    });
  });

  it('keeps all persisted history immutable, rejects foreign Company model references and leaves model events out of public Activity', async () => {
    const companyId = await prepared();
    const foreignCompanyId = await prepared('Foreign synthetic Company');
    const created = record(
      (
        await success({
          path: `${modelPath}/versions`,
          companyId,
          subject: 'model-editor',
          body: { expectedModelRevision: 0, content },
        })
      ).model,
    );
    const versionId = string(record(created.head), 'id');
    await success({
      path: `${modelPath}/versions/${versionId}/decision`,
      companyId,
      subject: 'model-reviewer',
      body: {
        expectedModelRevision: 1,
        versionNumber: 1,
        outcome: 'APPROVE',
        basis: 'Synthetic immutable review',
      },
    });
    const withdrawn = await success({
      path: `${modelPath}/versions/${versionId}/withdrawal`,
      companyId,
      subject: 'model-reviewer',
      body: {
        expectedModelRevision: 2,
        versionNumber: 1,
        reason: 'Synthetic immutable withdrawal',
      },
    });
    for (const query of [
      "UPDATE offer_model_versions SET content = '{}'::jsonb",
      'DELETE FROM offer_model_versions',
      "UPDATE offer_model_decisions SET basis = 'changed'",
      'DELETE FROM offer_model_decisions',
      "UPDATE offer_model_withdrawals SET reason = 'changed'",
      'DELETE FROM offer_model_withdrawals',
      "UPDATE offer_model_commands SET result = '{}'::jsonb",
      'DELETE FROM offer_model_commands',
      'UPDATE offer_model_events SET revision = revision + 1',
      'DELETE FROM offer_model_events',
      'DELETE FROM offer_models',
      'UPDATE offer_models SET revision = revision + 2',
    ])
      await expect(harness.pool.query(query)).rejects.toMatchObject({
        code: '23514',
      });
    await expect(
      harness.pool.query(
        `INSERT INTO offer_model_commands (workspace_id,company_id,model_id,actor_membership_id,actor_internal_user_id,key,kind,fingerprint,result,recorded_at)
      SELECT workspace_id,$1,model_id,actor_membership_id,actor_internal_user_id,'foreign-company',kind,fingerprint,result,recorded_at FROM offer_model_commands LIMIT 1`,
        [foreignCompanyId],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    expect(
      await success({ path: modelPath, companyId, subject: 'model-editor' }),
    ).toEqual(withdrawn);
    const activity = await success({ path: '/activity-log' });
    expect(JSON.stringify(activity)).not.toContain('offer_model.version.');
    expect(JSON.stringify(activity)).not.toContain(content.issuer.legalName);
    const events = await harness.pool.query(
      'SELECT action,version_number AS "versionNumber",revision FROM offer_model_events ORDER BY revision',
    );
    expect(events.rows).toEqual([
      { action: 'offer_model.version.created', versionNumber: 1, revision: 1 },
      { action: 'offer_model.version.approved', versionNumber: 1, revision: 2 },
      {
        action: 'offer_model.version.withdrawn',
        versionNumber: 1,
        revision: 3,
      },
    ]);
  });

  it.each([
    'limit=0',
    'limit=51',
    'limit=1.5',
    'limit=2&limit=3',
    'cursor=not-a-cursor',
    'search=secret',
    'limit=2&unknown=true',
  ])(
    'refuses malformed history query %s without disclosing content or writing',
    async (query) => {
      const companyId = await prepared();
      const before = await effects();
      const result = await request({
        path: `${modelPath}/versions?${query}`,
        companyId,
        subject: 'model-editor',
      });
      expect(result.status).toBe(400);
      expect(await effects()).toEqual(before);
      expect(JSON.stringify(await result.json())).not.toContain(
        content.serviceTitle,
      );
    },
  );
  it.each(['decision', 'withdrawal'] as const)(
    'rolls back a final-event failure during %s without altering prior content or consuming its key',
    async (kind) => {
      const companyId = await prepared();
      const first = record(
        (
          await success({
            path: `${modelPath}/versions`,
            companyId,
            subject: 'model-editor',
            body: { expectedModelRevision: 0, content },
          })
        ).model,
      );
      const id = string(record(first.head), 'id');
      if (kind === 'withdrawal')
        await success({
          path: `${modelPath}/versions/${id}/decision`,
          companyId,
          subject: 'model-reviewer',
          body: {
            expectedModelRevision: 1,
            versionNumber: 1,
            outcome: 'APPROVE',
            basis: 'Prior review remains immutable',
          },
        });
      const before = await success({
        path: modelPath,
        companyId,
        subject: 'model-reviewer',
      });
      const counts = await effects();
      const command = {
        path: `${modelPath}/versions/${id}/${kind}`,
        companyId,
        subject: 'model-reviewer',
        key: 'final-write-failure',
        body:
          kind === 'decision'
            ? {
                expectedModelRevision: 1,
                versionNumber: 1,
                outcome: 'APPROVE',
                basis: 'New review',
              }
            : {
                expectedModelRevision: 2,
                versionNumber: 1,
                reason: 'Deliberate withdrawal',
              },
      };
      try {
        await harness.pool
          .query(`CREATE FUNCTION test_fail_model_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic final failure'; END $$;
        CREATE TRIGGER test_fail_model_mutation AFTER INSERT ON offer_model_events FOR EACH ROW EXECUTE FUNCTION test_fail_model_mutation()`);
        expect((await request(command)).status).toBe(500);
        expect(
          await success({
            path: modelPath,
            companyId,
            subject: 'model-reviewer',
          }),
        ).toEqual(before);
        expect(await effects()).toEqual(counts);
      } finally {
        await harness.pool.query(
          'DROP TRIGGER IF EXISTS test_fail_model_mutation ON offer_model_events; DROP FUNCTION IF EXISTS test_fail_model_mutation()',
        );
      }
      expect((await request(command)).status).toBe(201);
    },
  );

  it('keeps exact content and receipts inside their Workspace even for the same Internal User with explicit model grants in both', async () => {
    const companyId = await prepared();
    const first = record(
      (
        await success({
          path: `${modelPath}/versions`,
          companyId,
          subject: 'model-editor',
          key: 'private-workspace-key',
          body: { expectedModelRevision: 0, content },
        })
      ).model,
    );
    const versionId = string(record(first.head), 'id');
    const editor = await success({
      path: '/access/current-actor',
      subject: 'model-editor',
    });
    const foreignWorkspace = '01000000-0000-4000-8000-000000000847';
    const foreignMember = '31000000-0000-4000-8000-000000000847';
    await harness.pool.query(
      'INSERT INTO workspaces (id,name) VALUES ($1,$2)',
      [foreignWorkspace, 'Other synthetic Workspace'],
    );
    await harness.pool.query(
      'INSERT INTO workspace_memberships (id,workspace_id,internal_user_id) VALUES ($1,$2,$3)',
      [foreignMember, foreignWorkspace, string(editor, 'internalUserId')],
    );
    await harness.pool.query(
      "INSERT INTO workspace_permission_grants (workspace_id,workspace_membership_id,permission) VALUES ($1,$2,'company.manage'),($1,$2,'company.assignment.manage')",
      [foreignWorkspace, foreignMember],
    );
    const foreignCompany = await success({
      path: '/companies',
      subject: 'model-editor',
      workspaceContextId: foreignWorkspace,
      body: { displayName: 'Other Workspace Company' },
    });
    const foreignCompanyId = string(foreignCompany, 'id');
    await success({
      path: '/company-offer-model-editor-assignments',
      subject: 'model-editor',
      workspaceContextId: foreignWorkspace,
      body: {
        companyId: foreignCompanyId,
        workspaceMembershipId: foreignMember,
      },
    });
    expect(
      (
        await request({
          path: `${modelPath}/versions/${versionId}`,
          subject: 'model-editor',
          workspaceContextId: foreignWorkspace,
          companyId: foreignCompanyId,
        })
      ).status,
    ).toBe(404);
    const foreign = await success({
      path: `${modelPath}/versions`,
      companyId: foreignCompanyId,
      subject: 'model-editor',
      workspaceContextId: foreignWorkspace,
      key: 'private-workspace-key',
      body: {
        expectedModelRevision: 0,
        content: {
          ...content,
          serviceTitle: 'Independent foreign Workspace content',
        },
      },
    });
    expect(foreign).toMatchObject({
      model: {
        workspaceId: foreignWorkspace,
        companyId: foreignCompanyId,
        head: {
          versionNumber: 1,
          content: { serviceTitle: 'Independent foreign Workspace content' },
        },
      },
    });
    expect(string(record(foreign.model), 'id')).not.toBe(string(first, 'id'));
    expect(
      (
        await request({
          path: `${modelPath}/versions/${string(record(record(foreign.model).head), 'id')}`,
          companyId,
          subject: 'model-editor',
        })
      ).status,
    ).toBe(404);
    expect(
      await success({ path: modelPath, companyId, subject: 'model-editor' }),
    ).toEqual({ model: first });
  });
});

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected a response object.');
  return Object.fromEntries(Object.entries(value));
}

function string(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== 'string') throw new Error(`Missing response ${key}.`);
  return result;
}
