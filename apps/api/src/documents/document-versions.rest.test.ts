import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000400';
const OWNER_SUBJECT = 'version-owner';
/** Members of the demonstration, each with an own identity and grants. */
const MEMBERS = {
  registrar: 'Document Registrar',
  approver: 'Document Approver',
  'second-approver': 'Second Approver',
  'second-registrar': 'Second Registrar',
  colleague: 'Registrar Colleague',
  'approver-only': 'Approver Without Registrar',
  'no-client-read': 'Registrar Without Client Read',
  outsider: 'BIC Director',
} as const;
type Member = keyof typeof MEMBERS;
type Caller = Member | 'owner';
const DEMO = {
  title: 'Chestionar de evaluare inițială — GRUP Demo SA',
  purpose: 'Evaluate the initial situation of GRUP Demo SA',
  url: 'https://example.test/demo/chestionar-v1.docx',
};

function headersOf(caller: Caller): Record<string, string> {
  const subject = caller === 'owner' ? OWNER_SUBJECT : `version-${caller}`;
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': subject,
    'x-test-display-name':
      caller === 'owner' ? 'Workspace Owner' : MEMBERS[caller],
    'x-test-email': `${subject}@example.test`,
  };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected an array.');
  return value;
}
async function json(response: Response): Promise<Record<string, unknown>> {
  return record(await response.json());
}

withPostgres('Official Document Versions REST contract', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let companyId: string;
  let bicId: string;
  let clientId: string;
  const memberships = new Map<Caller, string>();

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'document_versions',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: OWNER_SUBJECT,
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Official Document Versions',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          Object.keys(MEMBERS).map((member) => ({
            provider: 'deterministic-test',
            subject: `version-${member}`,
            workspaceId: WORKSPACE_ID,
          })),
        ),
      },
    });
  });
  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });
  beforeEach(async () => {
    await harness.pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
    memberships.clear();
    companyId = await createCompany('PRISMA-PRIM');
    bicId = await createCompany('BIC');
    // The owner administers; Director Client Access lets it confirm a union.
    await grant('owner', '/company-director-client-assignments', companyId);
    clientId = text(
      (
        await json(
          await call('/clients', {
            method: 'POST',
            body: { displayName: 'GRUP Demo SA' },
          }),
        )
      ).id,
    );
    expect(
      (
        await call(`/clients/${clientId}/active-company-relationship`, {
          method: 'PUT',
          company: bicId,
        })
      ).status,
    ).toBe(200);
    // Registrar v3 prepares drafts; the approver holds Registrar v1 and the
    // opt-in Approver, like the first-tenant configuration; the colleague
    // holds Registrar v2.
    await grant('registrar', '/company-director-client-assignments');
    await grant('registrar', '/company-document-registrar-assignments');
    await grant('approver', '/company-director-client-assignments');
    await insertRegistrar('approver', 'v1');
    await grant('approver', '/company-document-approver-assignments');
    await grant('colleague', '/company-director-client-assignments');
    await insertRegistrar('colleague', 'v2');
  });

  function call(
    path: string,
    options: {
      as?: Caller;
      company?: string | null;
      method?: string;
      body?: unknown;
      key?: string | null;
      workspace?: string;
    } = {},
  ): Promise<Response> {
    const company = options.company === undefined ? companyId : options.company;
    return fetch(`${harness.origin}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...headersOf(options.as ?? 'owner'),
        ...(company ? { 'x-company-context-id': company } : {}),
        ...(options.workspace
          ? { 'x-workspace-context-id': options.workspace }
          : {}),
        'content-type': 'application/json',
        ...(options.key === null
          ? {}
          : { 'idempotency-key': options.key ?? randomUUID() }),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  }
  async function createCompany(displayName: string): Promise<string> {
    return text(
      (
        await json(
          await call('/companies', {
            method: 'POST',
            company: null,
            body: { displayName },
          }),
        )
      ).id,
    );
  }
  async function membershipOf(caller: Caller): Promise<string> {
    const known = memberships.get(caller);
    if (known) return known;
    const actor = await json(
      await call('/access/current-actor', { as: caller, company: null }),
    );
    const membershipId = text(actor.workspaceMembershipId);
    memberships.set(caller, membershipId);
    return membershipId;
  }
  async function grant(
    caller: Caller,
    path: string,
    company = companyId,
  ): Promise<Record<string, unknown>> {
    const response = await call(path, {
      method: 'POST',
      company: null,
      body: {
        workspaceMembershipId: await membershipOf(caller),
        companyId: company,
      },
    });
    expect(response.status, `${path} for ${caller}`).toBe(201);
    return json(response);
  }
  async function revoke(caller: Caller, path: string, company = companyId) {
    const response = await call(
      `${path}/${await membershipOf(caller)}/${company}`,
      { method: 'DELETE', company: null },
    );
    expect(response.status, `${path} revoke for ${caller}`).toBe(200);
  }
  /** Legacy captured versions cannot be granted any more; they are seeded. */
  async function insertRegistrar(
    caller: Caller,
    version: 'v1' | 'v2',
    company = companyId,
  ): Promise<void> {
    await harness.pool.query(
      `INSERT INTO company_role_assignments
         (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version)
       VALUES ($1, $2, $3, 'company_document_registrar', $4)`,
      [WORKSPACE_ID, company, await membershipOf(caller), version],
    );
  }
  async function register(
    title = DEMO.title,
    client = clientId,
  ): Promise<string> {
    const response = await call('/documents', {
      as: 'registrar',
      method: 'POST',
      body: { clientId: client, title, purpose: DEMO.purpose, url: DEMO.url },
    });
    expect(response.status).toBe(201);
    return text((await json(response)).id);
  }
  function readVersions(documentId: string, as: Caller = 'registrar') {
    return call(`/documents/${documentId}/versions`, { as });
  }
  async function versionsOf(
    documentId: string,
    as: Caller = 'registrar',
  ): Promise<{
    workingRevision: unknown;
    mutable: unknown;
    versions: Record<string, unknown>[];
  }> {
    const response = await readVersions(documentId, as);
    expect(response.status).toBe(200);
    const value = await json(response);
    return {
      workingRevision: value.workingRevision,
      mutable: value.mutable,
      versions: list(value.versions).map(record),
    };
  }
  async function versionIdOf(documentId: string, number: number) {
    const version = (await versionsOf(documentId)).versions.find(
      (row) => row.number === number,
    );
    return text(version?.id);
  }
  function designate(
    documentId: string,
    versionId: string,
    expectedRevision: number,
    options: { as?: Caller; key?: string | null; body?: unknown } = {},
  ) {
    return call(
      `/documents/${documentId}/versions/${versionId}/official-designation`,
      {
        as: options.as ?? 'approver',
        method: 'POST',
        body: options.body ?? { expectedRevision },
        key: options.key,
      },
    );
  }
  function startDraft(
    documentId: string,
    expectedRevision: number,
    options: { as?: Caller; key?: string | null; body?: unknown } = {},
  ) {
    return call(`/documents/${documentId}/versions`, {
      as: options.as ?? 'registrar',
      method: 'POST',
      body: options.body ?? { expectedRevision },
      key: options.key,
    });
  }
  function addReference(
    documentId: string,
    versionId: string,
    expectedRevision: number,
    form: 'editable' | 'rendered' | 'signed' | 'other',
    url: string,
    options: { as?: Caller; key?: string; body?: unknown } = {},
  ) {
    return call(
      `/documents/${documentId}/versions/${versionId}/representations`,
      {
        as: options.as ?? 'registrar',
        method: 'POST',
        body: options.body ?? { expectedRevision, form, url },
        key: options.key,
      },
    );
  }
  function removeReference(
    documentId: string,
    versionId: string,
    representationId: string,
    expectedRevision: number,
    options: { as?: Caller; key?: string } = {},
  ) {
    return call(
      `/documents/${documentId}/versions/${versionId}/representations/${representationId}/removal`,
      {
        as: options.as ?? 'registrar',
        method: 'POST',
        body: { expectedRevision },
        key: options.key,
      },
    );
  }
  function correct(
    documentId: string,
    body: Record<string, unknown>,
    as: Caller = 'registrar',
  ) {
    return call(`/documents/${documentId}`, { as, method: 'PATCH', body });
  }
  async function detail(documentId: string, as: Caller = 'registrar') {
    const response = await call(`/documents/${documentId}`, { as });
    expect(response.status).toBe(200);
    return json(response);
  }
  /** The original Client's operational-use fence. */
  async function clientVersion(client = clientId): Promise<number> {
    const { rows } = await harness.pool.query<{ version: number }>(
      'SELECT version FROM client_accounts WHERE id = $1',
      [client],
    );
    const version = rows[0]?.version;
    if (version === undefined) throw new Error('Expected the Client.');
    return version;
  }
  /** Every durable effect a refused or replayed command must leave unchanged. */
  async function persisted(documentId: string, client = clientId) {
    const { rows } = await harness.pool.query(
      `SELECT
         (SELECT working_revision FROM working_documents WHERE id = $1) AS revision,
         (SELECT json_agg(json_build_object('number', number, 'status', status) ORDER BY number)
            FROM document_versions WHERE document_id = $1) AS versions,
         (SELECT count(*)::int FROM document_version_commands) AS commands,
         (SELECT count(*)::int FROM document_representations) AS "references",
         (SELECT count(*)::int FROM document_correction_commands) AS corrections,
         (SELECT version FROM client_accounts WHERE id = $2) AS "clientVersion"`,
      [documentId, client],
    );
    return rows[0];
  }
  async function versionEvents(as: Caller = 'registrar', company = companyId) {
    const response = await call('/activity-log', { as, company });
    expect(response.status).toBe(200);
    return list((await json(response)).events)
      .map(record)
      .filter((event) =>
        /^document\.(?:version|representation)\./u.test(text(event.action)),
      );
  }
  async function conflictCode(response: Response): Promise<unknown> {
    expect(response.status).toBe(409);
    return (await json(response)).code;
  }

  it('lets the Approver designate the registered draft as official Version 1', async () => {
    const documentId = await register();
    const registered = await versionsOf(documentId);
    expect(registered).toEqual({
      workingRevision: 1,
      mutable: true,
      versions: [
        {
          id: expect.any(String),
          number: 1,
          status: 'draft',
          createdAt: expect.any(String),
          createdBy: { displayName: MEMBERS.registrar },
          pdfContent: { state: 'absent' },
          representations: [
            {
              id: expect.any(String),
              kind: 'external-reference',
              verification: 'unverified',
              position: 1,
              form: 'other',
              primary: true,
              appendedAfterDesignation: false,
              addedAt: expect.any(String),
              addedBy: { displayName: MEMBERS.registrar },
              access: 'granted',
              url: DEMO.url,
            },
          ],
        },
      ],
    });
    const versionId = await versionIdOf(documentId, 1);

    const response = await designate(documentId, versionId, 1);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      documentId,
      workingRevision: 2,
      action: 'designated_official',
      versionId,
      versionNumber: 1,
      supersededVersionNumber: null,
    });
    const designated = await versionsOf(documentId);
    expect(designated).toMatchObject({ workingRevision: 2, mutable: true });
    expect(designated.versions).toEqual([
      {
        ...record(registered.versions[0]),
        status: 'official',
        designatedAt: expect.any(String),
        designatedBy: { displayName: MEMBERS.approver },
        frozen: { title: DEMO.title, purpose: DEMO.purpose },
      },
    ]);
    const official = record(designated.versions[0]);
    expect(Date.parse(text(official.designatedAt))).toBeGreaterThanOrEqual(
      Date.parse(text(official.createdAt)),
    );
    const events = await versionEvents();
    expect(events).toEqual([
      expect.objectContaining({
        action: 'document.version.designated_official',
        actor: expect.objectContaining({ displayName: MEMBERS.approver }),
        target: {
          type: 'document',
          documentId,
          documentTitle: DEMO.title,
          companyId,
        },
        metadata: { versionNumber: 1, supersededVersionNumber: null },
      }),
    ]);
    expect(JSON.stringify(events)).not.toMatch(/example\.test|Evaluate/u);
    // The detail now shows the official working Version, correction read-only.
    expect(await detail(documentId)).toMatchObject({
      workingRevision: 2,
      correction: 'read-only',
      version: { id: versionId, status: 'official' },
    });
  });

  it('adds a rendered reference to the draft through the shared revision seam', async () => {
    const documentId = await register();
    const versionId = await versionIdOf(documentId, 1);
    const url = 'https://example.test/demo/chestionar-v1.pdf';

    const response = await addReference(
      documentId,
      versionId,
      1,
      'rendered',
      url,
    );

    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({
      documentId,
      workingRevision: 2,
      action: 'representation_added',
      versionId,
      versionNumber: 1,
      representationId: expect.any(String),
      appendedAfterDesignation: false,
    });
    const read = await versionsOf(documentId);
    expect(read.workingRevision).toBe(2);
    expect(record(read.versions[0]).representations).toEqual([
      expect.objectContaining({ position: 1, form: 'other', primary: true }),
      expect.objectContaining({
        position: 2,
        form: 'rendered',
        primary: false,
        appendedAfterDesignation: false,
        url,
      }),
    ]);
    const events = await harness.pool.query<{ action: string }>(
      `SELECT action FROM document_version_commands WHERE document_id = $1 ORDER BY occurred_at`,
      [documentId],
    );
    expect(events.rows).toEqual([{ action: 'representation_added' }]);
    const [activity] = await versionEvents();
    expect(activity).toMatchObject({
      action: 'document.representation.added',
      target: {
        type: 'document',
        documentId,
        documentTitle: DEMO.title,
        companyId,
      },
    });
    const metadata = record(activity?.metadata);
    expect(metadata).toEqual({
      versionNumber: 1,
      form: 'rendered',
      appendedAfterDesignation: false,
    });
    expect(JSON.stringify(metadata)).not.toMatch(/chestionar|https|project/iu);
  });

  it('keeps official appends on their exact Version and promotes the next draft primary reference', async () => {
    const documentId = await register();
    const versionOneId = await versionIdOf(documentId, 1);
    const renderedUrl = 'https://example.test/demo/chestionar-v1.pdf';
    expect(
      (await addReference(documentId, versionOneId, 1, 'rendered', renderedUrl))
        .status,
    ).toBe(201);
    expect((await designate(documentId, versionOneId, 2)).status).toBe(200);
    const signed = await addReference(
      documentId,
      versionOneId,
      3,
      'signed',
      'https://example.test/demo/chestionar-v1-semnat.pdf',
    );
    expect(signed.status).toBe(201);
    const signedReceipt = await json(signed);
    expect(signedReceipt.appendedAfterDesignation).toBe(true);
    expect(
      await conflictCode(
        await removeReference(
          documentId,
          versionOneId,
          text(signedReceipt.representationId),
          4,
        ),
      ),
    ).toBe('document_version_state_invalid');

    expect((await startDraft(documentId, 4)).status).toBe(201);
    const drafted = await versionsOf(documentId);
    const versionTwo = drafted.versions.find((row) => row.number === 2);
    const copied = list(versionTwo?.representations).map(record);
    expect(copied).toHaveLength(2);
    expect(copied.map((row) => row.form)).toEqual(['other', 'rendered']);
    expect(copied.some((row) => row.form === 'signed')).toBe(false);
    const removedReferenceId = text(copied[0]?.id);
    const removal = await removeReference(
      documentId,
      text(versionTwo?.id),
      removedReferenceId,
      5,
    );
    expect(removal.status).toBe(200);
    expect(
      (
        await harness.pool.query<{
          appended_after_designation: boolean | null;
        }>(
          `SELECT appended_after_designation
             FROM document_version_commands
            WHERE document_id = $1 AND action = 'representation_removed'`,
          [documentId],
        )
      ).rows,
    ).toEqual([{ appended_after_designation: false }]);
    const removalEvent = (await versionEvents()).find(
      (event) => event.action === 'document.representation.removed',
    );
    expect(record(removalEvent?.metadata)).toEqual({
      versionNumber: 2,
      form: 'other',
      appendedAfterDesignation: false,
    });
    const afterRemoval = await versionsOf(documentId);
    const current = afterRemoval.versions.find((row) => row.number === 2);
    expect(list(current?.representations).map(record)).toEqual([
      expect.objectContaining({
        position: 2,
        form: 'rendered',
        primary: true,
      }),
    ]);
    expect(
      (
        await correct(documentId, {
          expectedRevision: 6,
          url: 'https://example.test/demo/chestionar-v2.pdf',
        })
      ).status,
    ).toBe(200);
    expect((await designate(documentId, text(current?.id), 7)).status).toBe(
      200,
    );
    const final = await versionsOf(documentId);
    expect(final.workingRevision).toBe(8);
    expect(
      list(final.versions.find((row) => row.number === 1)?.representations)
        .map(record)
        .some((row) => row.form === 'signed'),
    ).toBe(true);
  });

  it('validates typed references, current capacity, replay and immutable official removals', async () => {
    const documentId = await register();
    const versionId = await versionIdOf(documentId, 1);
    const initial = await persisted(documentId);
    for (const body of [
      { expectedRevision: 1, form: 'unknown', url: 'https://example.test/x' },
      {
        expectedRevision: 1,
        form: 'rendered',
        url: 'https://user:secret@example.test/x',
      },
      {
        expectedRevision: 1,
        form: 'rendered',
        url: 'https://example.test/x',
        note: 'extra',
      },
    ])
      expect(
        (
          await addReference(
            documentId,
            versionId,
            1,
            'rendered',
            'https://example.test/x',
            { body },
          )
        ).status,
      ).toBe(400);
    expect(await persisted(documentId)).toEqual(initial);
    const initialRead = await versionsOf(documentId);
    const initialReferences = list(initialRead.versions[0]?.representations);
    const initialReference = text(record(initialReferences[0]).id);
    expect(
      await conflictCode(
        await removeReference(documentId, versionId, initialReference, 1),
      ),
    ).toBe('document_version_state_invalid');
    expect(await persisted(documentId)).toEqual(initial);
    expect(
      (
        await addReference(
          documentId,
          versionId,
          1,
          'rendered',
          'https://example.test/v1-2.pdf',
          { as: 'colleague' },
        )
      ).status,
    ).toBe(403);

    const key = randomUUID();
    const firstAddition = await addReference(
      documentId,
      versionId,
      1,
      'rendered',
      'https://example.test/v1-2.pdf',
      { key },
    );
    expect(firstAddition.status).toBe(201);
    const firstReceipt = await json(firstAddition);
    for (let position = 3; position <= 5; position += 1)
      expect(
        (
          await addReference(
            documentId,
            versionId,
            position - 1,
            'other',
            `https://example.test/v1-${position}`,
          )
        ).status,
      ).toBe(201);
    const replayed = await addReference(
      documentId,
      versionId,
      1,
      'rendered',
      'https://example.test/v1-2.pdf',
      { key },
    );
    expect(replayed.status).toBe(201);
    expect(await json(replayed)).toEqual(firstReceipt);
    const reused = await addReference(
      documentId,
      versionId,
      1,
      'signed',
      'https://example.test/changed',
      { key },
    );
    expect(reused.status).toBe(409);
    expect(await json(reused)).toMatchObject({
      message: 'Idempotency-Key was already used for another Version command.',
    });
    const capacity = await addReference(
      documentId,
      versionId,
      5,
      'signed',
      'https://example.test/sixth',
    );
    expect(await conflictCode(capacity)).toBe(
      'document_representation_capacity_exceeded',
    );

    const fullDraft = await versionsOf(documentId);
    const references = list(fullDraft.versions[0]?.representations).map(record);
    expect(references).toHaveLength(5);
    expect(
      (await removeReference(documentId, versionId, text(references[0]?.id), 5))
        .status,
    ).toBe(200);
    expect(
      (
        await addReference(
          documentId,
          versionId,
          6,
          'editable',
          'https://example.test/replacement',
        )
      ).status,
    ).toBe(201);
    const afterReplacement = await versionsOf(documentId);
    expect(
      list(afterReplacement.versions[0]?.representations).map(
        (value) => record(value).position,
      ),
    ).toEqual([2, 3, 4, 5, 6]);

    expect((await designate(documentId, versionId, 7)).status).toBe(200);
    for (let append = 1; append <= 5; append += 1)
      expect(
        (
          await addReference(
            documentId,
            versionId,
            7 + append,
            'signed',
            `https://example.test/signed-${append}`,
          )
        ).status,
      ).toBe(201);
    expect(
      await conflictCode(
        await addReference(
          documentId,
          versionId,
          13,
          'signed',
          'https://example.test/eleventh',
        ),
      ),
    ).toBe('document_representation_capacity_exceeded');
    expect(
      await conflictCode(
        await removeReference(
          documentId,
          versionId,
          text(firstReceipt.representationId),
          13,
        ),
      ),
    ).toBe('document_version_state_invalid');
  }, 60_000);

  it('runs the lifecycle on one working revision: new draft, correction, designation and supersession', async () => {
    const documentId = await register();
    const first = await versionIdOf(documentId, 1);
    const fence = await clientVersion();
    expect((await designate(documentId, first, 1)).status).toBe(200);
    expect(await clientVersion()).toBe(fence + 1);

    // 1. With no draft the working correction is refused after the stale check.
    const before = await persisted(documentId);
    const stale = await correct(documentId, {
      expectedRevision: 1,
      title: 'Stale',
    });
    expect(stale.status).toBe(409);
    expect(await json(stale)).toMatchObject({
      message: 'The working Document changed. Reload before correcting it.',
    });
    expect(
      await conflictCode(
        await correct(documentId, { expectedRevision: 2, title: 'No draft' }),
      ),
    ).toBe('document_version_state_invalid');
    expect(await persisted(documentId)).toEqual(before);

    // 2. The registrar starts Version 2 holding a copy of the Version 1 reference.
    const drafted = await startDraft(documentId, 2);
    expect(drafted.status).toBe(201);
    const draftReceipt = await json(drafted);
    expect(draftReceipt).toEqual({
      documentId,
      workingRevision: 3,
      action: 'drafted',
      versionId: expect.any(String),
      versionNumber: 2,
      sourceVersionNumber: 1,
    });
    const second = text(draftReceipt.versionId);
    expect(await clientVersion()).toBe(fence + 2);
    const withDraft = await versionsOf(documentId);
    expect(withDraft.versions.map((row) => [row.number, row.status])).toEqual([
      [2, 'draft'],
      [1, 'official'],
    ]);
    const [draftRow, officialRow] = withDraft.versions;
    expect(record(draftRow).createdBy).toEqual({
      displayName: MEMBERS.registrar,
    });
    const draftReference = record(list(record(draftRow).representations)[0]);
    const officialReference = record(
      list(record(officialRow).representations)[0],
    );
    expect(draftReference.url).toBe(DEMO.url);
    expect(draftReference.id).not.toBe(officialReference.id);
    expect(await detail(documentId)).toMatchObject({
      workingRevision: 3,
      correction: 'allowed',
      version: {
        id: second,
        status: 'draft',
        representation: { id: draftReference.id, url: DEMO.url },
      },
    });

    // 3. The registrar corrects the title and URL of Version 2 only.
    const correctedTitle = 'Chestionar de evaluare — GRUP Demo SA (v2)';
    const correctedUrl = 'https://example.test/demo/chestionar-v2.docx';
    const corrected = await correct(documentId, {
      expectedRevision: 3,
      title: correctedTitle,
      url: correctedUrl,
    });
    expect(corrected.status).toBe(200);
    expect(await json(corrected)).toEqual({
      documentId,
      revision: 4,
      outcome: 'corrected',
    });
    expect(await clientVersion()).toBe(fence + 3);

    // 4. The Approver designates Version 2; Version 1 is superseded intact.
    const designated = await designate(documentId, second, 4);
    expect(designated.status).toBe(200);
    expect(await json(designated)).toEqual({
      documentId,
      workingRevision: 5,
      action: 'designated_official',
      versionId: second,
      versionNumber: 2,
      supersededVersionNumber: 1,
    });
    expect(await clientVersion()).toBe(fence + 4);
    const final = await versionsOf(documentId);
    expect(final.workingRevision).toBe(5);
    expect(final.versions).toEqual([
      expect.objectContaining({
        id: second,
        number: 2,
        status: 'official',
        frozen: { title: correctedTitle, purpose: DEMO.purpose },
        designatedBy: { displayName: MEMBERS.approver },
        representations: [expect.objectContaining({ url: correctedUrl })],
      }),
      expect.objectContaining({
        id: first,
        number: 1,
        status: 'superseded',
        frozen: { title: DEMO.title, purpose: DEMO.purpose },
        designatedBy: { displayName: MEMBERS.approver },
        supersededAt: expect.any(String),
        supersededByVersionNumber: 2,
        representations: [expect.objectContaining({ url: DEMO.url })],
      }),
    ]);
    expect(await detail(documentId)).toMatchObject({
      title: correctedTitle,
      workingRevision: 5,
      correction: 'read-only',
      version: { id: second, status: 'official' },
    });

    // Exactly one event per committed command, newest first.
    expect(
      (await versionEvents()).map((event) => [event.action, event.metadata]),
    ).toEqual([
      [
        'document.version.designated_official',
        { versionNumber: 2, supersededVersionNumber: 1 },
      ],
      [
        'document.version.drafted',
        { versionNumber: 2, sourceVersionNumber: 1 },
      ],
      [
        'document.version.designated_official',
        { versionNumber: 1, supersededVersionNumber: null },
      ],
    ]);
    const { rows: commands } = await harness.pool.query(
      `SELECT action, expected_revision, revision FROM document_version_commands
        WHERE document_id = $1 ORDER BY revision`,
      [documentId],
    );
    expect(commands).toEqual([
      { action: 'designated_official', expected_revision: 1, revision: 2 },
      { action: 'drafted', expected_revision: 2, revision: 3 },
      { action: 'designated_official', expected_revision: 4, revision: 5 },
    ]);
    // The correction history stays `document.corrected`-only.
    const history = await json(
      await call(`/documents/${documentId}/correction-history`, {
        as: 'registrar',
      }),
    );
    expect(
      list(history.corrections).map((row) => record(row).revision),
    ).toEqual([4]);
  }, 60_000);

  it('refuses malformed commands, wrong states and a 51st Version without writing', async () => {
    const documentId = await register();
    const other = await register('Other questionnaire');
    const first = await versionIdOf(documentId, 1);
    const otherVersion = await versionIdOf(other, 1);
    const before = await persisted(documentId);

    for (const response of [
      await designate(documentId, first, 1, { key: null }),
      await startDraft(documentId, 1, { key: null }),
      await designate(documentId, first, 1, {
        body: { expectedRevision: 1, note: 'approved' },
      }),
      await designate(documentId, first, 1, { body: { expectedRevision: 0 } }),
      await designate(documentId, first, 1, {
        body: { expectedRevision: '1' },
      }),
      await designate(documentId, first, 1, { body: [] }),
      await startDraft(documentId, 1, { body: {} }),
      await startDraft(documentId, 1, {
        body: { expectedRevision: 2147483647 },
      }),
      await designate('not-a-document', first, 1),
      await designate(documentId, 'not-a-version', 1),
      await startDraft('not-a-document', 1),
      await call('/documents/not-a-document/versions', { as: 'registrar' }),
    ])
      expect(response.status).toBe(400);

    // A Version of another Document is the detail read's safe not-found.
    const foreignVersion = await designate(documentId, otherVersion, 1);
    const unknownDocument = await call(`/documents/${randomUUID()}`, {
      as: 'approver',
    });
    expect(foreignVersion.status).toBe(404);
    expect(await foreignVersion.json()).toEqual(await unknownDocument.json());
    expect((await designate(randomUUID(), first, 1)).status).toBe(404);
    expect((await startDraft(randomUUID(), 1)).status).toBe(404);

    // No official Version yet: nothing to start a draft from.
    expect(await conflictCode(await startDraft(documentId, 1))).toBe(
      'document_version_state_invalid',
    );
    // A stale revision conflicts before any state check.
    expect(await conflictCode(await designate(documentId, first, 2))).toBe(
      'document_revision_conflict',
    );
    expect(await persisted(documentId)).toEqual(before);

    expect((await designate(documentId, first, 1)).status).toBe(200);
    // Designating a Version that is no longer the draft.
    expect(await conflictCode(await designate(documentId, first, 2))).toBe(
      'document_version_state_invalid',
    );
    expect((await startDraft(documentId, 2)).status).toBe(201);
    // Starting a draft while one exists.
    expect(await conflictCode(await startDraft(documentId, 3))).toBe(
      'document_version_state_invalid',
    );

    // Versions 2..50 then refuse the 51st.
    let revision = 3;
    for (let number = 2; number <= 50; number += 1) {
      const draftId = await versionIdOf(documentId, number);
      expect((await designate(documentId, draftId, revision)).status).toBe(200);
      revision += 1;
      if (number < 50) {
        expect((await startDraft(documentId, revision)).status).toBe(201);
        revision += 1;
      }
    }
    const full = await persisted(documentId);
    expect(record(full).revision).toBe(revision);
    const capacity = await startDraft(documentId, revision);
    expect(capacity.status).toBe(409);
    const capacityBody = await json(capacity);
    expect(capacityBody.code).toBe('document_version_capacity_exceeded');
    expect(JSON.stringify(capacityBody)).not.toMatch(/50|51|official|https/u);
    expect(await persisted(documentId)).toEqual(full);
    expect((await versionsOf(documentId)).versions).toHaveLength(50);
  }, 180_000);

  it('enforces Registrar v3, the Approver, the detail read boundary and replay revalidation', async () => {
    const documentId = await register();
    const first = await versionIdOf(documentId, 1);
    const refusal = async (response: Response) => ({
      status: response.status,
      body: await response.json(),
    });

    // Registrar v3 without the Approver cannot designate.
    expect(
      (await designate(documentId, first, 1, { as: 'registrar' })).status,
    ).toBe(403);
    // The Approver without any Registrar gets the detail denial.
    await grant('approver-only', '/company-director-client-assignments');
    await grant('approver-only', '/company-document-approver-assignments');
    const approverOnlyDetail = await refusal(
      await call(`/documents/${documentId}`, { as: 'approver-only' }),
    );
    expect(approverOnlyDetail.status).toBe(403);
    expect(
      await refusal(
        await designate(documentId, first, 1, { as: 'approver-only' }),
      ),
    ).toEqual(approverOnlyDetail);
    expect(
      await refusal(await readVersions(documentId, 'approver-only')),
    ).toEqual(approverOnlyDetail);
    // Without Client read, neither reads nor commands are possible.
    await grant('no-client-read', '/company-document-registrar-assignments');
    await grant('no-client-read', '/company-document-approver-assignments');
    const noClientRead = await refusal(
      await call(`/documents/${documentId}`, { as: 'no-client-read' }),
    );
    expect(noClientRead.status).toBe(403);
    expect(
      await refusal(await readVersions(documentId, 'no-client-read')),
    ).toEqual(noClientRead);
    expect(
      await refusal(
        await designate(documentId, first, 1, { as: 'no-client-read' }),
      ),
    ).toEqual(noClientRead);

    // The approver designates; Registrar v1 and v2 cannot start a draft.
    const key = randomUUID();
    const designated = await designate(documentId, first, 1, { key });
    expect(designated.status).toBe(200);
    const receipt = await json(designated);
    expect((await startDraft(documentId, 2, { as: 'approver' })).status).toBe(
      403,
    );
    expect((await startDraft(documentId, 2, { as: 'colleague' })).status).toBe(
      403,
    );
    // The Registrar v2 colleague reads every Version but holds no command.
    expect((await versionsOf(documentId, 'colleague')).versions).toHaveLength(
      1,
    );

    // Exact replay revalidates live authority before answering.
    const settled = await persisted(documentId);
    await revoke('approver', '/company-document-approver-assignments');
    expect((await designate(documentId, first, 1, { key })).status).toBe(403);
    await grant('approver', '/company-document-approver-assignments');
    const replayed = await designate(documentId, first, 1, { key });
    expect(replayed.status).toBe(200);
    expect(await json(replayed)).toEqual(receipt);
    expect(await persisted(documentId)).toEqual(settled);
    // A member holding both bundles may prepare and designate; every command
    // shares one key space per actor and Workspace.
    await grant('registrar', '/company-document-approver-assignments');
    const draftKey = randomUUID();
    expect((await startDraft(documentId, 2, { key: draftKey })).status).toBe(
      201,
    );
    const second = await versionIdOf(documentId, 2);
    const another = await register('Another questionnaire');
    const anotherVersion = await versionIdOf(another, 1);
    const reusedKey = (response: Response) =>
      json(response).then((body) => ({ status: response.status, body }));
    const keyReuse = {
      status: 409,
      body: expect.objectContaining({
        message:
          'Idempotency-Key was already used for another Version command.',
      }),
    };
    const beforeReuse = await persisted(documentId);
    // Another body, action or Document under the same key.
    expect(
      await reusedKey(await designate(documentId, first, 2, { key })),
    ).toEqual(keyReuse);
    expect(
      await reusedKey(await designate(another, anotherVersion, 1, { key })),
    ).toEqual(keyReuse);
    expect(
      await reusedKey(await startDraft(documentId, 3, { key: draftKey })),
    ).toEqual(keyReuse);
    expect(
      await reusedKey(
        await designate(documentId, second, 3, {
          key: draftKey,
          as: 'registrar',
        }),
      ),
    ).toEqual(keyReuse);
    expect(
      await reusedKey(await startDraft(another, 1, { key: draftKey })),
    ).toEqual(keyReuse);
    expect(await persisted(documentId)).toEqual(beforeReuse);

    // Registrar v2 still corrects the draft.
    expect(
      (
        await correct(
          documentId,
          { expectedRevision: 3, title: 'By v2' },
          'colleague',
        )
      ).status,
    ).toBe(200);

    // Another Company, another Workspace and no Company context refuse
    // exactly like the detail read.
    await grant('outsider', '/company-director-client-assignments', bicId);
    await grant('outsider', '/company-document-registrar-assignments', bicId);
    await grant('outsider', '/company-document-approver-assignments', bicId);
    const foreignWorkspace = randomUUID();
    await harness.pool.query(
      'INSERT INTO workspaces(id, name) VALUES ($1, $2)',
      [foreignWorkspace, 'Hidden Workspace'],
    );
    for (const [name, options] of [
      ['another Company', { as: 'outsider', company: bicId }],
      ['another Workspace', { as: 'approver', workspace: foreignWorkspace }],
      ['no Company context', { as: 'approver', company: null }],
    ] as const) {
      const expected = await refusal(
        await call(`/documents/${documentId}`, options),
      );
      expect(expected.status, name).not.toBe(200);
      expect(
        await refusal(await call(`/documents/${documentId}/versions`, options)),
        name,
      ).toEqual(expected);
      expect(
        await refusal(
          await call(
            `/documents/${documentId}/versions/${second}/official-designation`,
            { ...options, method: 'POST', body: { expectedRevision: 4 } },
          ),
        ),
        name,
      ).toEqual(expected);
      expect(JSON.stringify(expected.body)).not.toMatch(
        /draft|official|https/u,
      );
    }
  }, 90_000);

  it('records Approver grants and revocations once per actual change and captures Registrar v3', async () => {
    const approverMembership = await membershipOf('second-approver');
    const count = async (action: string) =>
      (
        await harness.pool.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM activity_log_events WHERE action = $1`,
          [action],
        )
      ).rows[0]?.count;
    const granted = await grant(
      'second-approver',
      '/company-document-approver-assignments',
    );
    expect(granted).toMatchObject({
      workspaceMembershipId: approverMembership,
      companyId,
      bundle: 'Company Document Approver',
      permissionSetVersion: 'v1',
      active: true,
    });
    await grant('second-approver', '/company-document-approver-assignments');
    expect(await count('company_document_approver_assignment.granted')).toBe(2);
    const { rows: metadata } = await harness.pool.query(
      `SELECT metadata FROM activity_log_events
        WHERE action = 'company_document_approver_assignment.granted'
          AND target_workspace_membership_id = $1`,
      [approverMembership],
    );
    expect(metadata).toEqual([
      { metadata: { bundle: 'Company Document Approver' } },
    ]);
    await revoke('second-approver', '/company-document-approver-assignments');
    await revoke('second-approver', '/company-document-approver-assignments');
    expect(await count('company_document_approver_assignment.revoked')).toBe(1);

    // The Approver alone contributes designation only, never Company context
    // or Document read; the administration read reports its captured v1.
    const administration = await json(
      await call('/company-context-assignments/administration', {
        company: null,
      }),
    );
    expect(list(administration.assignments)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceMembershipId: await membershipOf('approver'),
          bundle: 'Company Document Approver',
          permissionSetVersion: 'v1',
        }),
        expect.objectContaining({
          workspaceMembershipId: await membershipOf('registrar'),
          bundle: 'Company Document Registrar',
          permissionSetVersion: 'v3',
        }),
        expect.objectContaining({
          workspaceMembershipId: await membershipOf('colleague'),
          bundle: 'Company Document Registrar',
          permissionSetVersion: 'v2',
        }),
      ]),
    );
    const approver = record(
      (await json(await call('/access/current-actor', { as: 'approver' })))
        .activeCompany,
    );
    expect(approver).toMatchObject({
      documentPermissions: expect.arrayContaining([
        'document.read',
        'document.version.designate_official',
      ]),
      documentPermissionSetVersion: 'v1',
      documentApproverPermissionSetVersion: 'v1',
    });
    expect(approver.documentPermissions).not.toContain('document.correct');
    const registrar = record(
      (await json(await call('/access/current-actor', { as: 'registrar' })))
        .activeCompany,
    );
    expect(registrar).toMatchObject({
      documentPermissionSetVersion: 'v3',
      documentPermissions: [
        'document.read',
        'document.register',
        'document.reference.read',
        'document.correct',
        'document.version.manage',
      ],
    });
    // No backfill, other bundle or Workspace ownership confers either.
    const { rows } = await harness.pool.query(
      `SELECT count(*)::int AS count FROM company_role_assignments
        WHERE workspace_membership_id = $1
          AND bundle::text IN ('company_document_registrar', 'company_document_approver')`,
      [await membershipOf('owner')],
    );
    expect(rows).toEqual([{ count: 0 }]);
  });

  it('fails closed for null or unknown captured Registrar and Approver versions', async () => {
    const documentId = await register();
    const first = await versionIdOf(documentId, 1);
    const assignmentOf = async (caller: Caller, bundle: string) => {
      const { rows } = await harness.pool.query<{ id: string }>(
        `SELECT id FROM company_role_assignments
          WHERE workspace_membership_id = $1 AND bundle::text = $2
            AND revoked_at IS NULL`,
        [await membershipOf(caller), bundle],
      );
      return text(rows[0]?.id);
    };
    /**
     * Current migrations prevent unsupported versions. Temporarily admit this
     * future-version fixture in this isolated database to prove fail-closed
     * authority, as the Project responsible suite does.
     */
    const withVersion = async (
      assignmentId: string,
      version: string | null,
      work: () => Promise<void>,
    ) => {
      const { rows } = await harness.pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'company_role_assignments_permission_set_version_check'",
      );
      const definition = text(rows[0]?.definition);
      const previous = await harness.pool.query<{ version: string }>(
        'SELECT permission_set_version AS version FROM company_role_assignments WHERE id = $1',
        [assignmentId],
      );
      await harness.pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        await harness.pool.query(
          'UPDATE company_role_assignments SET permission_set_version = $1 WHERE id = $2',
          [version, assignmentId],
        );
        await work();
      } finally {
        await harness.pool.query(
          'UPDATE company_role_assignments SET permission_set_version = $1 WHERE id = $2',
          [previous.rows[0]?.version, assignmentId],
        );
        await harness.pool.query(
          `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${definition}`,
        );
      }
    };
    const before = await persisted(documentId);
    const approver = await assignmentOf(
      'approver',
      'company_document_approver',
    );
    for (const version of [null, 'v2'])
      await withVersion(approver, version, async () => {
        const actor = record(
          (await json(await call('/access/current-actor', { as: 'approver' })))
            .activeCompany,
        );
        expect(actor.documentPermissions).not.toContain(
          'document.version.designate_official',
        );
        expect(actor.documentApproverPermissionSetVersion).toBeUndefined();
        expect((await designate(documentId, first, 1)).status).toBe(403);
      });
    const registrar = await assignmentOf(
      'registrar',
      'company_document_registrar',
    );
    for (const version of [null, 'v4'])
      await withVersion(registrar, version, async () => {
        expect((await readVersions(documentId)).status).toBe(403);
        expect((await startDraft(documentId, 1)).status).toBe(403);
      });
    expect(await persisted(documentId)).toEqual(before);
  }, 60_000);

  it('keeps a superseded original Client readable and every Version command refused', async () => {
    // A Client related to this Company only, so one Company confirms its union.
    const original = text(
      (
        await json(
          await call('/clients', {
            method: 'POST',
            body: { displayName: 'GRUP Demo SA duplicate' },
          }),
        )
      ).id,
    );
    const documentId = await register(DEMO.title, original);
    const first = await versionIdOf(documentId, 1);
    expect((await designate(documentId, first, 1)).status).toBe(200);
    const canonical = text(
      (
        await json(
          await call('/clients', {
            method: 'POST',
            body: {
              displayName: 'GRUP Demo SA canonical',
              taxId: 'CANONICAL-400',
            },
          }),
        )
      ).id,
    );
    await harness.pool.query(
      "UPDATE client_accounts SET tax_id = 'DOCUMENT-400' WHERE id = ANY($1::uuid[])",
      [[original, canonical]],
    );
    const review = await json(
      await call(`/clients/${original}/union-reviews`, {
        method: 'POST',
        body: {},
      }),
    );
    expect(review.outcome).toBe('comparison');
    expect(
      (
        await call(
          `/client-union-reviews/${text(review.reviewReference)}/confirm`,
          {
            method: 'POST',
            body: {
              canonicalClientId: canonical,
              fields: {
                displayName: original,
                taxId: original,
                address: original,
                telephone: original,
                generalEmail: original,
                businessActivity: original,
              },
              companyIds: [companyId],
              reviewedDifferences: true,
              reason: 'Duplicate synthetic Client identity.',
            },
          },
        )
      ).status,
    ).toBe(201);

    const read = await versionsOf(documentId);
    expect(read).toMatchObject({ workingRevision: 2, mutable: false });
    expect(read.versions).toHaveLength(1);
    const before = await persisted(documentId, original);
    expect((await startDraft(documentId, 2)).status).toBe(404);
    expect((await designate(documentId, first, 2)).status).toBe(404);
    expect(await persisted(documentId, original)).toEqual(before);
  }, 60_000);

  it('projects Version events only in the recording Company and pages corrections across Version revisions', async () => {
    const documentId = await register();
    await grant('outsider', '/company-director-client-assignments', bicId);
    await grant('outsider', '/company-document-registrar-assignments', bicId);
    let revision = 1;
    const cycle = async (corrections: number) => {
      const draftId = (await versionsOf(documentId)).versions.find(
        (row) => row.status === 'draft',
      )?.id;
      expect(
        (await designate(documentId, text(draftId), revision)).status,
      ).toBe(200);
      revision += 1;
      expect((await startDraft(documentId, revision)).status).toBe(201);
      revision += 1;
      for (let index = 0; index < corrections; index += 1) {
        expect(
          (
            await correct(documentId, {
              expectedRevision: revision,
              title: `Revision ${revision + 1}`,
            })
          ).status,
        ).toBe(200);
        revision += 1;
      }
    };
    // Revisions 2-3 and 15-16 are Version commands; 4-14 and 17-27 corrections.
    await cycle(11);
    await cycle(11);
    expect(revision).toBe(27);
    const page = async (query = '') =>
      json(
        await call(`/documents/${documentId}/correction-history${query}`, {
          as: 'registrar',
        }),
      );
    const firstPage = await page();
    const firstRevisions = list(firstPage.corrections).map(
      (row) => record(row).revision,
    );
    expect(firstRevisions).toEqual([
      27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 14, 13, 12, 11, 10, 9, 8, 7,
      6,
    ]);
    expect(firstPage.nextBeforeRevision).toBe(6);
    const secondPage = await page('?beforeRevision=6');
    expect(
      list(secondPage.corrections).map((row) => record(row).revision),
    ).toEqual([5, 4]);
    expect(secondPage.nextBeforeRevision).toBeNull();

    const recorded = await versionEvents();
    expect(recorded.map((event) => event.action)).toEqual([
      'document.version.drafted',
      'document.version.designated_official',
      'document.version.drafted',
      'document.version.designated_official',
    ]);
    for (const event of recorded) {
      expect(record(event.target).companyId).toBe(companyId);
      expect(Object.keys(record(event.metadata)).sort()).toEqual(
        event.action === 'document.version.drafted'
          ? ['sourceVersionNumber', 'versionNumber']
          : ['supersededVersionNumber', 'versionNumber'],
      );
      expect(JSON.stringify(event.metadata)).not.toMatch(
        /https|Revision|Evaluate|project/iu,
      );
    }
    // BIC's reader sees no PRISMA-PRIM Document and none of its events.
    expect(await versionEvents('outsider', bicId)).toEqual([]);
    expect(
      await (
        await call('/documents', { as: 'outsider', company: bicId })
      ).json(),
    ).toEqual([]);
    // A Workspace manager without Document read sees none either.
    expect(await versionEvents('owner')).toEqual([]);
  }, 120_000);

  describe('concurrent commands on one observed revision', () => {
    /**
     * Holds the original Client row `FOR SHARE` from a test connection. Each
     * command then waits on its Client lock, after its authority, visibility
     * and replay checks, until both contenders are observed waiting.
     */
    async function holdClientRow(): Promise<{
      blockerPid: number;
      connection: PoolClient;
      release: () => Promise<void>;
    }> {
      const connection = await harness.pool.connect();
      await connection.query('BEGIN');
      await connection.query(
        'SELECT id FROM client_accounts WHERE id = $1 FOR SHARE',
        [clientId],
      );
      const { rows } = await connection.query<{ pid: number }>(
        'SELECT pg_backend_pid()::int AS pid',
      );
      const blockerPid = rows[0]?.pid;
      if (blockerPid === undefined)
        throw new Error('Expected the barrier backend PID.');
      let released = false;
      return {
        blockerPid,
        connection,
        release: async () => {
          if (released) return;
          released = true;
          await connection.query('COMMIT');
          connection.release();
        },
      };
    }
    /** Waits until `count` contenders are blocked by the held Client row. */
    async function waitForLockWaiters(
      blockerPid: number,
      count: number,
    ): Promise<void> {
      let observed: Array<{ pid: number; blockers: number[] }> = [];
      for (let attempt = 0; attempt < 400; attempt += 1) {
        const { rows } = await harness.pool.query<{
          pid: number;
          blockers: number[];
        }>(
          `SELECT DISTINCT activity.pid, pg_blocking_pids(activity.pid) AS blockers
             FROM pg_locks AS lock
             JOIN pg_stat_activity AS activity ON activity.pid = lock.pid
            WHERE NOT lock.granted
              AND activity.datname = current_database()`,
        );
        observed = rows;
        const blockedPids = new Set([blockerPid]);
        let added = true;
        while (added) {
          added = false;
          for (const waiter of observed) {
            if (
              !blockedPids.has(waiter.pid) &&
              waiter.blockers.some((pid) => blockedPids.has(pid))
            ) {
              blockedPids.add(waiter.pid);
              added = true;
            }
          }
        }
        if (
          observed.filter(
            (waiter) =>
              waiter.pid !== blockerPid && blockedPids.has(waiter.pid),
          ).length === count
        )
          return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(
        `The contenders did not reach the Client lock: ${JSON.stringify(observed)}`,
      );
    }
    async function contend(
      commands: ReadonlyArray<() => Promise<Response>>,
    ): Promise<Array<{ status: number; body: Record<string, unknown> }>> {
      const barrier = await holdClientRow();
      try {
        const pending = commands.map((command) => command());
        await waitForLockWaiters(barrier.blockerPid, commands.length);
        await barrier.release();
        return Promise.all(
          (await Promise.all(pending)).map(async (response) => ({
            status: response.status,
            body: await json(response),
          })),
        );
      } finally {
        await barrier.release();
      }
    }
    const statuses = (results: ReadonlyArray<{ status: number }>): number[] =>
      results
        .map((result) => result.status)
        .sort((left, right) => left - right);
    async function concurrentEvents(observer: Caller) {
      const response = await call('/activity-log', { as: observer });
      expect(response.status).toBe(200);
      return list((await json(response)).events)
        .map(record)
        .filter((event) =>
          /^document\.(?:corrected|version\.|representation\.)/u.test(
            text(event.action),
          ),
        );
    }
    async function concurrencyState(documentId: string, observer: Caller) {
      const stored = record(await persisted(documentId));
      return {
        revision: Number(stored.revision),
        versionReceipts: Number(stored.commands),
        correctionReceipts: Number(stored.corrections),
        events: (await concurrentEvents(observer)).length,
        fence: await clientVersion(),
      };
    }
    const versionRevisionConflict = {
      code: 'document_revision_conflict',
      message: 'The Document changed. Reload it before changing its Versions.',
    };
    async function expectOneCommit(
      results: ReadonlyArray<{
        status: number;
        body: Record<string, unknown>;
      }>,
      before: Awaited<ReturnType<typeof concurrencyState>>,
      documentId: string,
      observer: Caller,
      conflictBodies: ReadonlyArray<Record<string, unknown>> = results.map(
        () => versionRevisionConflict,
      ),
    ): Promise<Record<string, unknown>> {
      const committed = results.filter(
        (result) => result.status === 200 || result.status === 201,
      );
      const refused = results.filter((result) => result.status === 409);
      expect(committed).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect(conflictBodies).toHaveLength(results.length);
      for (const [index, result] of results.entries()) {
        if (result.status === 409)
          expect(result.body).toEqual(conflictBodies[index]);
      }
      const after = await concurrencyState(documentId, observer);
      expect(after.revision).toBe(before.revision + 1);
      const versionReceiptDelta =
        after.versionReceipts - before.versionReceipts;
      const correctionReceiptDelta =
        after.correctionReceipts - before.correctionReceipts;
      expect(versionReceiptDelta).toBeGreaterThanOrEqual(0);
      expect(correctionReceiptDelta).toBeGreaterThanOrEqual(0);
      expect(versionReceiptDelta + correctionReceiptDelta).toBe(1);
      expect(after.events).toBe(before.events + 1);
      expect(after.fence).toBe(before.fence + 1);
      const receipt = committed[0]?.body;
      if (!receipt) throw new Error('Expected one committed receipt.');
      return receipt;
    }
    function version(
      state: Awaited<ReturnType<typeof versionsOf>>,
      number: number,
    ): Record<string, unknown> {
      const found = state.versions.find(
        (candidate) => candidate.number === number,
      );
      if (!found) throw new Error(`Expected Version ${number}.`);
      return found;
    }
    function references(
      state: Awaited<ReturnType<typeof versionsOf>>,
      number: number,
    ): Record<string, unknown>[] {
      return list(version(state, number).representations).map(record);
    }

    it('commits one of two designations by different Approvers', async () => {
      await grant('second-approver', '/company-director-client-assignments');
      await insertRegistrar('second-approver', 'v1');
      await grant('second-approver', '/company-document-approver-assignments');
      const documentId = await register();
      const first = await versionIdOf(documentId, 1);
      const fence = await clientVersion();
      const results = await contend([
        () => designate(documentId, first, 1),
        () => designate(documentId, first, 1, { as: 'second-approver' }),
      ]);
      expect(statuses(results)).toEqual([200, 409]);
      expect(results.find((result) => result.status === 409)?.body.code).toBe(
        'document_revision_conflict',
      );
      expect(await persisted(documentId)).toMatchObject({
        revision: 2,
        commands: 1,
        versions: [{ number: 1, status: 'official' }],
      });
      expect(await clientVersion()).toBe(fence + 1);
      expect(await versionEvents()).toHaveLength(1);
    });

    it('commits one of a designation and a working correction', async () => {
      const documentId = await register();
      const first = await versionIdOf(documentId, 1);
      const results = await contend([
        () => designate(documentId, first, 1),
        () => correct(documentId, { expectedRevision: 1, title: 'Racing' }),
      ]);
      expect(statuses(results)).toEqual([200, 409]);
      const state = record(await persisted(documentId));
      expect(state.revision).toBe(2);
      expect(Number(state.commands) + Number(state.corrections)).toBe(1);
    });

    it('commits one of two new drafts by different Registrar v3 members', async () => {
      await grant('second-registrar', '/company-director-client-assignments');
      await grant(
        'second-registrar',
        '/company-document-registrar-assignments',
      );
      const documentId = await register();
      const first = await versionIdOf(documentId, 1);
      expect((await designate(documentId, first, 1)).status).toBe(200);
      const results = await contend([
        () => startDraft(documentId, 2),
        () => startDraft(documentId, 2, { as: 'second-registrar' }),
      ]);
      expect(statuses(results)).toEqual([201, 409]);
      expect(results.find((result) => result.status === 409)?.body.code).toBe(
        'document_revision_conflict',
      );
      expect(await persisted(documentId)).toMatchObject({
        revision: 3,
        commands: 2,
        versions: [
          { number: 1, status: 'official' },
          { number: 2, status: 'draft' },
        ],
      });
    });

    it('keeps the draft capacity bound when two Registrar v3 members add the fifth reference', async () => {
      await grant('second-registrar', '/company-director-client-assignments');
      await grant(
        'second-registrar',
        '/company-document-registrar-assignments',
      );
      const documentId = await register();
      const first = await versionIdOf(documentId, 1);
      const preparatoryReferences: ReadonlyArray<readonly [number, string]> = [
        [1, 'second'],
        [2, 'third'],
        [3, 'fourth'],
      ];
      for (const [revision, suffix] of preparatoryReferences) {
        expect(
          (
            await addReference(
              documentId,
              first,
              revision,
              'other',
              `https://example.test/demo/${suffix}.pdf`,
            )
          ).status,
        ).toBe(201);
      }
      const observer: Caller = 'colleague';
      const before = await concurrencyState(documentId, observer);
      const contenders = [
        'https://example.test/demo/capacity-a.pdf',
        'https://example.test/demo/capacity-b.pdf',
      ];
      const results = await contend([
        () => addReference(documentId, first, 4, 'rendered', contenders[0]),
        () =>
          addReference(documentId, first, 4, 'signed', contenders[1], {
            as: 'second-registrar',
          }),
      ]);
      await expectOneCommit(results, before, documentId, observer);
      const current = references(await versionsOf(documentId, observer), 1);
      expect(current).toHaveLength(5);
      expect(
        current.filter((reference) => contenders.includes(text(reference.url))),
      ).toHaveLength(1);
      expect(new Set(current.map((reference) => text(reference.id))).size).toBe(
        5,
      );
    });

    it('commits one of a draft reference addition and its designation by different members', async () => {
      const documentId = await register();
      const first = await versionIdOf(documentId, 1);
      const observer: Caller = 'colleague';
      const before = await concurrencyState(documentId, observer);
      const addedUrl = 'https://example.test/demo/designation-race.pdf';
      const results = await contend([
        () => addReference(documentId, first, 1, 'rendered', addedUrl),
        () => designate(documentId, first, 1, { as: 'approver' }),
      ]);
      const receipt = await expectOneCommit(
        results,
        before,
        documentId,
        observer,
      );
      const state = await versionsOf(documentId, observer);
      const current = version(state, 1);
      const currentReferences = references(state, 1);
      if (receipt.action === 'representation_added') {
        expect(current.status).toBe('draft');
        expect(currentReferences.map((reference) => reference.url)).toContain(
          addedUrl,
        );
        expect(currentReferences).toHaveLength(2);
      } else {
        expect(receipt.action).toBe('designated_official');
        expect(current.status).toBe('official');
        expect(
          currentReferences.map((reference) => reference.url),
        ).not.toContain(addedUrl);
        expect(currentReferences).toHaveLength(1);
      }
      expect(
        new Set(currentReferences.map((reference) => text(reference.id))).size,
      ).toBe(currentReferences.length);
    });

    it('never copies an official append when it races with starting a new draft', async () => {
      await grant('second-registrar', '/company-director-client-assignments');
      await grant(
        'second-registrar',
        '/company-document-registrar-assignments',
      );
      const documentId = await register();
      const first = await versionIdOf(documentId, 1);
      expect((await designate(documentId, first, 1)).status).toBe(200);
      const observer: Caller = 'colleague';
      const before = await concurrencyState(documentId, observer);
      const appendedUrl = 'https://example.test/demo/racing-signed.pdf';
      const results = await contend([
        () => addReference(documentId, first, 2, 'signed', appendedUrl),
        () => startDraft(documentId, 2, { as: 'second-registrar' }),
      ]);
      const receipt = await expectOneCommit(
        results,
        before,
        documentId,
        observer,
      );
      if (receipt.action === 'representation_added') {
        expect(
          (await startDraft(documentId, 3, { as: 'second-registrar' })).status,
        ).toBe(201);
      } else {
        expect(receipt.action).toBe('drafted');
        expect(
          (await addReference(documentId, first, 3, 'signed', appendedUrl))
            .status,
        ).toBe(201);
      }
      const state = await versionsOf(documentId, observer);
      const officialReferences = references(state, 1);
      const draftReferences = references(state, 2);
      expect(officialReferences).toHaveLength(2);
      expect(officialReferences.map((reference) => reference.url)).toContain(
        appendedUrl,
      );
      expect(
        officialReferences.find((reference) => reference.url === appendedUrl),
      ).toMatchObject({ appendedAfterDesignation: true });
      expect(draftReferences.map((reference) => reference.url)).not.toContain(
        appendedUrl,
      );
      expect(draftReferences).toHaveLength(1);
      expect(
        new Set(officialReferences.map((reference) => text(reference.id))).size,
      ).toBe(2);
      expect(
        new Set(draftReferences.map((reference) => text(reference.id))).size,
      ).toBe(1);
    });

    it('commits one of removing the primary reference and correcting its URL', async () => {
      const documentId = await register();
      const first = await versionIdOf(documentId, 1);
      const secondaryUrl = 'https://example.test/demo/removal-race-second.pdf';
      expect(
        (await addReference(documentId, first, 1, 'rendered', secondaryUrl))
          .status,
      ).toBe(201);
      const observer: Caller = 'approver';
      const initialReferences = references(
        await versionsOf(documentId, observer),
        1,
      );
      const primaryId = text(initialReferences[0]?.id);
      const before = await concurrencyState(documentId, observer);
      const correctedUrl =
        'https://example.test/demo/removal-race-corrected.docx';
      const results = await contend([
        () => removeReference(documentId, first, primaryId, 2),
        () =>
          correct(
            documentId,
            { expectedRevision: 2, url: correctedUrl },
            'colleague',
          ),
      ]);
      const receipt = await expectOneCommit(
        results,
        before,
        documentId,
        observer,
        [
          versionRevisionConflict,
          {
            message:
              'The working Document changed. Reload before correcting it.',
            error: 'Conflict',
            statusCode: 409,
          },
        ],
      );
      const current = references(await versionsOf(documentId, observer), 1);
      if (receipt.action === 'representation_removed') {
        expect(current).toHaveLength(1);
        expect(current[0]).toMatchObject({
          url: secondaryUrl,
          primary: true,
        });
      } else {
        expect(receipt.outcome).toBe('corrected');
        expect(current).toHaveLength(2);
        expect(current[0]).toMatchObject({
          id: primaryId,
          url: correctedUrl,
          primary: true,
        });
        expect(current[1]?.url).toBe(secondaryUrl);
      }
      expect(new Set(current.map((reference) => text(reference.id))).size).toBe(
        current.length,
      );
    });

    it('commits a new draft and a correction of another Document of the same Client', async () => {
      await grant('second-registrar', '/company-director-client-assignments');
      await grant(
        'second-registrar',
        '/company-document-registrar-assignments',
      );
      const official = await register();
      const draft = await register('Second questionnaire');
      const first = await versionIdOf(official, 1);
      expect((await designate(official, first, 1)).status).toBe(200);
      const fence = await clientVersion();
      const results = await contend([
        () => startDraft(official, 2),
        () =>
          correct(
            draft,
            { expectedRevision: 1, title: 'Corrected second' },
            'second-registrar',
          ),
      ]);
      expect(statuses(results)).toEqual([200, 201]);
      expect(await persisted(official)).toMatchObject({ revision: 3 });
      expect(await persisted(draft)).toMatchObject({ revision: 2 });
      expect(await clientVersion()).toBe(fence + 2);
    });
  });
});
