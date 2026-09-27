import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import { ProjectClosedGuard } from '../project/project-closed.guard.js';
import { ProjectService } from '../project/project.service.js';
import { DocumentProjectsService } from './document-projects.service.js';
import { DocumentsService } from './documents.service.js';
import { DocumentReadBoundary } from './document-read-boundary.js';
import { DocumentVersionsService } from './document-versions.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000000245';
const assignmentPaths = {
  client: '/company-director-client-assignments',
  document: '/company-document-registrar-assignments',
  project: '/company-project-assignments',
  organizer: '/company-document-project-organizer-assignments',
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number') throw new Error('Expected a number.');
  return value;
}
function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected an array.');
  return value.map(object);
}
async function body(response: Response) {
  return object(await response.json());
}
/** Lists never carry the association that single-Document responses may add. */
function listed(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'projectAssociation'),
  );
}
const unlinkedAssociation = { state: 'unlinked' };
function linkedTo(id: string, title = 'ISO preparation') {
  return { state: 'linked', project: { id, title } };
}

describe.skipIf(!databaseUrl)(
  'Document–Project association REST contract',
  () => {
    let database: IsolatedPostgresTestDatabase;
    let harness: PostgresRestTestHarness;
    let companyId: string;
    let clientId: string;
    let membershipId: string;
    let internalUserId: string;
    let projectId: string;
    let documentId: string;
    let document: Record<string, unknown>;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'document_projects',
      });
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'document-project-owner',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Document Projects',
          ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
            {
              provider: 'deterministic-test',
              subject: 'document-project-member',
              workspaceId,
            },
          ]),
        },
      });
    });
    afterAll(async () => {
      await harness?.close();
      await database?.close();
    });
    beforeEach(async () => {
      await harness.pool.query('TRUNCATE workspaces, internal_users CASCADE');
      companyId = '';
      companyId = text(
        (await command('/companies', { displayName: 'PRISMA-PRIM' })).id,
      );
      const actor = await body(await request('/access/current-actor'));
      membershipId = text(actor.workspaceMembershipId);
      internalUserId = text(actor.internalUserId);
      await grant('client');
      await grant('document');
      await grant('project');
      clientId = text(
        (await command('/clients', { displayName: 'Synthetic Client' })).id,
      );
      projectId = text((await createProject()).id);
      document = await createDocument();
      documentId = text(document.id);
    });

    function request(
      path: string,
      options: {
        method?: string;
        value?: unknown;
        key?: string | null;
        company?: string;
        subject?: string;
        workspace?: string;
      } = {},
    ) {
      const {
        method = 'GET',
        value,
        key = randomUUID(),
        company = companyId,
        subject = 'document-project-owner',
        workspace,
      } = options;
      return fetch(`${harness.origin}/api${path}`, {
        method,
        headers: {
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': subject,
          'x-test-display-name': 'Document Project Organizer',
          'x-test-email': `${subject}@example.test`,
          ...(company ? { 'x-company-context-id': company } : {}),
          ...(workspace ? { 'x-workspace-context-id': workspace } : {}),
          ...(key === null ? {} : { 'idempotency-key': key }),
          'content-type': 'application/json',
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
    }
    async function command(
      path: string,
      value: unknown,
      options: Parameters<typeof request>[1] = {},
    ) {
      const response = await request(path, {
        ...options,
        method: 'POST',
        value,
      });
      expect(response.status).toBe(201);
      return body(response);
    }
    async function grant(
      kind: keyof typeof assignmentPaths,
      targetMembershipId = membershipId,
      company = companyId,
    ) {
      return command(assignmentPaths[kind], {
        companyId: company,
        workspaceMembershipId: targetMembershipId,
      });
    }
    async function revoke(
      kind: keyof typeof assignmentPaths,
      targetMembershipId = membershipId,
    ) {
      expect(
        (
          await request(
            `${assignmentPaths[kind]}/${targetMembershipId}/${companyId}`,
            { method: 'DELETE' },
          )
        ).status,
      ).toBe(200);
    }
    function createProject(
      client = clientId,
      company = companyId,
      title = 'ISO preparation',
    ) {
      return command(
        '/projects',
        { title, clientAccountId: client },
        { company },
      );
    }
    const registration = (client = clientId) => ({
      clientId: client,
      title: 'Working questionnaire',
      purpose: 'Prepare the initial assessment',
      url: 'https://example.test/working-questionnaire',
    });
    /** Registers as the owner, a current Project reader in every Company used. */
    async function createDocument(client = clientId, company = companyId) {
      const registered = await command('/documents', registration(client), {
        company,
      });
      expect(registered.projectAssociation).toEqual(unlinkedAssociation);
      return listed(registered);
    }
    async function detail(id = documentId, subject?: string) {
      const response = await request(`/documents/${id}`, { subject });
      expect(response.status).toBe(200);
      return body(response);
    }
    function mutate(
      action: 'link' | 'unlink',
      expectedRevision: number,
      options: Parameters<typeof request>[1] & {
        document?: string;
        project?: string;
      } = {},
    ) {
      const {
        document = documentId,
        project = projectId,
        ...requestOptions
      } = options;
      return request(`/documents/${document}/project-association`, {
        ...requestOptions,
        method: 'POST',
        value: { action, projectId: project, expectedRevision },
      });
    }
    async function list(eligible = false, project = projectId) {
      const response = await request(
        `/projects/${project}/${eligible ? 'eligible-documents' : 'documents'}`,
      );
      expect(response.status).toBe(200);
      return body(response);
    }
    async function clientVersion() {
      return number(
        (await body(await request(`/clients/${clientId}`))).version,
      );
    }
    async function associationEvents() {
      const page = await body(await request('/activity-log'));
      return objects(page.events).filter(
        (event) =>
          event.action === 'document.project.linked' ||
          event.action === 'document.project.unlinked',
      );
    }
    async function persistence() {
      const result = await harness.pool.query<{
        projectId: string | null;
        revision: number;
        version: number;
        events: string;
      }>(
        `SELECT d.project_id AS "projectId", d.project_revision AS revision,
              c.version, (SELECT count(*) FROM document_project_events) AS events
       FROM working_documents d JOIN client_accounts c ON c.id = d.client_id
       WHERE d.id = $1`,
        [documentId],
      );
      const state = result.rows[0];
      if (!state) throw new Error('Expected the registered Document.');
      return state;
    }
    async function member() {
      return body(
        await request('/access/current-actor', {
          company: '',
          subject: 'document-project-member',
        }),
      );
    }

    it('requires an opt-in organizer grant, then links, reloads and unlinks without changing the working Document', async () => {
      // Mutability describes the original Client state; management still needs
      // the independently captured organizer permission and a live grant.
      expect(await list()).toEqual({ mutable: true, documents: [] });
      expect(await list(true)).toEqual({
        mutable: true,
        documents: [{ document, revision: 0 }],
      });
      expect((await mutate('link', 0)).status).toBe(403);
      expect(await grant('organizer')).toMatchObject({
        bundle: 'Company Document Project Organizer',
        permissionSetVersion: 'v1',
      });
      const version = await clientVersion();
      const linked = await mutate('link', 0);
      expect(linked.status).toBe(201);
      expect(await body(linked)).toEqual({
        documentId,
        projectId,
        action: 'link',
        revision: 1,
      });
      expect(await list()).toEqual({
        mutable: true,
        documents: [{ document, revision: 1 }],
      });
      expect(await list(true)).toEqual({ mutable: true, documents: [] });
      expect(await clientVersion()).toBe(version + 1);
      const unlinked = await mutate('unlink', 1);
      expect(unlinked.status).toBe(201);
      expect(await body(unlinked)).toEqual({
        documentId,
        projectId,
        action: 'unlink',
        revision: 2,
      });
      expect(await list()).toEqual({ mutable: true, documents: [] });
      expect(await list(true)).toEqual({
        mutable: true,
        documents: [{ document, revision: 2 }],
      });
      expect(await detail()).toEqual({
        ...document,
        projectAssociation: unlinkedAssociation,
      });
      expect(await clientVersion()).toBe(version + 2);
      expect(await body(await request(`/projects/${projectId}`))).toMatchObject(
        {
          status: 'preparatory',
          clientAccountId: clientId,
        },
      );
      const events = await associationEvents();
      expect(events).toHaveLength(2);
      for (const event of events) {
        expect(event).toMatchObject({
          target: {
            type: 'document_project',
            documentId,
            documentTitle: document.title,
            projectId,
            projectTitle: 'ISO preparation',
            companyId,
          },
          actor: { internalUserId, displayName: 'Document Project Organizer' },
          metadata: {},
        });
        expect(Number.isNaN(Date.parse(text(event.occurredAt)))).toBe(false);
        expect(JSON.stringify(event)).not.toContain(document.purpose);
        expect(JSON.stringify(event)).not.toContain('https://');
      }
      expect(events.map((event) => event.action).sort()).toEqual([
        'document.project.linked',
        'document.project.unlinked',
      ]);
    });

    it('grants only association management to an active same-Workspace member through explicit administration', async () => {
      const target = await member();
      const targetMembership = text(target.workspaceMembershipId);
      const value = { companyId, workspaceMembershipId: targetMembership };
      expect(
        (
          await request(assignmentPaths.organizer, {
            method: 'POST',
            value,
            company: '',
            subject: 'document-project-member',
          })
        ).status,
      ).toBe(403);
      await grant('organizer', targetMembership);
      expect(
        (
          await request('/access/current-actor', {
            subject: 'document-project-member',
          })
        ).status,
      ).toBe(403);
      expect(
        await (
          await request('/companies', {
            company: '',
            subject: 'document-project-member',
          })
        ).json(),
      ).toEqual([]);
      await command('/company-context-assignments', value);
      const current = await body(
        await request('/access/current-actor', {
          subject: 'document-project-member',
        }),
      );
      const activeCompany = object(current.activeCompany);
      expect(activeCompany.documentPermissions).toEqual([
        'document.project.manage',
      ]);
      expect(activeCompany.projectPermissions ?? []).toEqual([]);
      expect(activeCompany.clientPermissions).toEqual([]);
      expect(
        (
          await request(
            `${assignmentPaths.organizer}/${targetMembership}/${companyId}`,
            { method: 'DELETE', subject: 'document-project-member' },
          )
        ).status,
      ).toBe(403);
      for (const path of [
        '/documents',
        `/documents/${documentId}`,
        `/projects/${projectId}/documents`,
        `/projects/${projectId}/eligible-documents`,
      ])
        expect(
          (await request(path, { subject: 'document-project-member' })).status,
        ).toBe(403);
      expect(
        (await mutate('link', 0, { subject: 'document-project-member' }))
          .status,
      ).toBe(403);
      await revoke('organizer', targetMembership);
      const page = await body(await request('/activity-log'));
      expect(objects(page.events)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'company_document_project_organizer_assignment.granted',
            actor: expect.objectContaining({ internalUserId }),
          }),
          expect.objectContaining({
            action: 'company_document_project_organizer_assignment.revoked',
            actor: expect.objectContaining({ internalUserId }),
          }),
        ]),
      );
      await harness.pool.query(
        "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
        [targetMembership],
      );
      expect(
        (await request(assignmentPaths.organizer, { method: 'POST', value }))
          .status,
      ).toBe(403);
      expect(await associationEvents()).toEqual([]);
    });

    it('refuses organizer grants to missing or foreign memberships and inactive Companies', async () => {
      const foreignWorkspace = randomUUID();
      const foreignMembership = randomUUID();
      await harness.pool.query(
        'INSERT INTO workspaces(id,name) VALUES($1,$2)',
        [foreignWorkspace, 'Foreign Workspace'],
      );
      await harness.pool.query(
        'INSERT INTO workspace_memberships(id,workspace_id,internal_user_id) VALUES($1,$2,$3)',
        [foreignMembership, foreignWorkspace, internalUserId],
      );
      for (const targetMembership of [randomUUID(), foreignMembership]) {
        const response = await request(assignmentPaths.organizer, {
          method: 'POST',
          value: { companyId, workspaceMembershipId: targetMembership },
        });
        expect(response.status).toBe(403);
        expect(await response.text()).not.toContain(targetMembership);
      }
      await harness.pool.query(
        "UPDATE companies SET status='inactive' WHERE id=$1",
        [companyId],
      );
      expect(
        (
          await request(assignmentPaths.organizer, {
            method: 'POST',
            company: '',
            value: { companyId, workspaceMembershipId: membershipId },
          })
        ).status,
      ).toBe(403);
      expect(
        await (await request('/activity-log', { company: '' })).text(),
      ).not.toContain('company_document_project_organizer_assignment.granted');
    });

    it.each(['project', 'document', 'client'] satisfies Array<
      keyof typeof assignmentPaths
    >)(
      'requires live %s read authority for lists, mutations and historical replay',
      async (permission) => {
        const target = await member();
        const targetMembership = text(target.workspaceMembershipId);
        for (const kind of [
          'project',
          'document',
          'client',
          'organizer',
        ] satisfies Array<keyof typeof assignmentPaths>)
          await grant(kind, targetMembership);
        const key = randomUUID();
        expect(
          (
            await mutate('link', 0, {
              key,
              subject: 'document-project-member',
            })
          ).status,
        ).toBe(201);
        const before = await persistence();
        await revoke(permission, targetMembership);
        for (const suffix of ['documents', 'eligible-documents']) {
          const response = await request(`/projects/${projectId}/${suffix}`, {
            subject: 'document-project-member',
          });
          expect(response.status).toBe(403);
          expect(await response.text()).not.toContain(documentId);
        }
        for (const [action, revision, commandKey] of [
          ['link', 0, key],
          ['unlink', 1, randomUUID()],
        ] satisfies Array<['link' | 'unlink', number, string]>)
          expect(
            (
              await mutate(action, revision, {
                key: commandKey,
                subject: 'document-project-member',
              })
            ).status,
          ).toBe(403);
        const events = await (
          await request('/activity-log', { subject: 'document-project-member' })
        ).text();
        expect(events).not.toContain('document.project.linked');
        if (permission === 'project') expect(events).not.toContain(projectId);
        expect(await persistence()).toEqual(before);
      },
    );

    it('keeps linked metadata readable after organizer revocation but refuses new commands and retries', async () => {
      await grant('organizer');
      const key = randomUUID();
      expect((await mutate('link', 0, { key })).status).toBe(201);
      const before = await persistence();
      await revoke('organizer');
      expect(await list()).toEqual({
        mutable: true,
        documents: [{ document, revision: 1 }],
      });
      expect((await mutate('link', 0, { key })).status).toBe(403);
      expect((await mutate('unlink', 1)).status).toBe(403);
      expect(await persistence()).toEqual(before);
      expect(await associationEvents()).toHaveLength(1);
    });

    it.each(['company', 'membership', 'internal user'])(
      'refuses inactive %s authority before replaying a committed command',
      async (scope) => {
        await grant('organizer');
        const key = randomUUID();
        expect((await mutate('link', 0, { key })).status).toBe(201);
        const before = await persistence();
        switch (scope) {
          case 'company':
            await harness.pool.query(
              "UPDATE companies SET status='inactive' WHERE id=$1",
              [companyId],
            );
            break;
          case 'membership':
            await harness.pool.query(
              "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
              [membershipId],
            );
            break;
          case 'internal user':
            await harness.pool.query(
              "UPDATE internal_users SET status='inactive' WHERE id=$1",
              [internalUserId],
            );
            break;
        }
        expect((await mutate('link', 0, { key })).status).toBe(403);
        expect((await mutate('unlink', 1)).status).toBe(403);
        expect((await request(`/projects/${projectId}/documents`)).status).toBe(
          403,
        );
        expect(await persistence()).toEqual(before);
      },
    );

    it('filters eligible Documents by exact original Client, Company and absence of any current Project', async () => {
      await grant('organizer');
      const unrelatedClient = text(
        (await command('/clients', { displayName: 'Different Client' })).id,
      );
      const unrelatedDocument = await createDocument(unrelatedClient);
      const unrelatedProject = await createProject(unrelatedClient);
      const otherProject = await createProject();
      const alreadyLinked = await createDocument();
      expect(
        (
          await mutate('link', 0, {
            document: text(alreadyLinked.id),
            project: text(otherProject.id),
          })
        ).status,
      ).toBe(201);
      expect(await list(true)).toEqual({
        mutable: true,
        documents: [{ document, revision: 0 }],
      });
      const before = await persistence();
      for (const options of [
        { document: text(unrelatedDocument.id) },
        { project: text(unrelatedProject.id) },
      ])
        expect((await mutate('link', 0, options)).status).toBe(404);
      expect(await persistence()).toEqual(before);
      expect(await list()).toEqual({ mutable: true, documents: [] });
    });

    it('refuses a silent reassignment, stale revisions and unlinking another Project', async () => {
      await grant('organizer');
      const otherProject = text((await createProject()).id);
      expect((await mutate('unlink', 0)).status).toBe(409);
      expect((await mutate('link', 1)).status).toBe(409);
      expect((await mutate('link', 0)).status).toBe(201);
      const before = await persistence();
      for (const response of [
        await mutate('link', 1),
        await mutate('link', 1, { project: otherProject }),
        await mutate('unlink', 0),
        await mutate('unlink', 1, { project: otherProject }),
      ])
        expect(response.status).toBe(409);
      expect(await persistence()).toEqual(before);
      expect((await mutate('unlink', 1)).status).toBe(201);
      expect((await mutate('link', 2, { project: otherProject })).status).toBe(
        201,
      );
      expect(await list()).toEqual({ mutable: true, documents: [] });
      expect(await list(false, otherProject)).toEqual({
        mutable: true,
        documents: [{ document, revision: 3 }],
      });
    });

    it('serializes concurrent changed intentions so only one Project acquires a Document', async () => {
      await grant('organizer');
      const otherProject = text((await createProject()).id);
      const before = await persistence();
      const responses = await Promise.all([
        mutate('link', 0),
        mutate('link', 0, { project: otherProject }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      const successful = responses.find((response) => response.status === 201);
      if (!successful) throw new Error('Expected one successful association.');
      const receipt = await body(successful);
      expect(await persistence()).toEqual({
        projectId: receipt.projectId,
        revision: 1,
        version: before.version + 1,
        events: '1',
      });
    });

    it('collapses concurrent retries and returns the historical receipt after a later unlink', async () => {
      await grant('organizer');
      const key = randomUUID();
      const before = await persistence();
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => mutate('link', 0, { key })),
      );
      expect(responses.map((response) => response.status)).toEqual([
        201, 201, 201, 201,
      ]);
      const receipts = await Promise.all(responses.map(body));
      const receipt = { documentId, projectId, action: 'link', revision: 1 };
      expect(receipts).toEqual([receipt, receipt, receipt, receipt]);
      expect(await persistence()).toEqual({
        projectId,
        revision: 1,
        version: before.version + 1,
        events: '1',
      });
      expect((await mutate('unlink', 1)).status).toBe(201);
      const unlinked = await persistence();
      const replay = await mutate('link', 0, { key });
      expect(replay.status).toBe(201);
      expect(await body(replay)).toEqual(receipt);
      expect(await persistence()).toEqual(unlinked);
      expect(await list()).toEqual({ mutable: true, documents: [] });
      expect(await list(true)).toEqual({
        mutable: true,
        documents: [{ document, revision: 2 }],
      });
    });

    it('conflicts when a key is reused with a different Document, Project, action, revision or Company', async () => {
      await grant('organizer');
      const otherDocument = text((await createDocument()).id);
      const otherProject = text((await createProject()).id);
      const otherCompany = text(
        (await command('/companies', { displayName: 'BIC' })).id,
      );
      for (const kind of ['project', 'document', 'organizer'] satisfies Array<
        keyof typeof assignmentPaths
      >)
        await grant(kind, membershipId, otherCompany);
      const key = randomUUID();
      expect((await mutate('link', 0, { key })).status).toBe(201);
      const before = await persistence();
      for (const response of [
        await mutate('link', 0, { key, document: otherDocument }),
        await mutate('link', 0, { key, project: otherProject }),
        await mutate('unlink', 0, { key }),
        await mutate('link', 1, { key }),
        await mutate('link', 0, { key, company: otherCompany }),
      ])
        expect(response.status).toBe(409);
      expect(await persistence()).toEqual(before);
    });

    it('scopes idempotency keys to the actor rather than another authorized membership', async () => {
      await grant('organizer');
      const target = await member();
      for (const kind of [
        'project',
        'document',
        'client',
        'organizer',
      ] satisfies Array<keyof typeof assignmentPaths>)
        await grant(kind, text(target.workspaceMembershipId));
      const otherDocument = text((await createDocument()).id);
      const key = randomUUID();
      const before = await clientVersion();
      expect((await mutate('link', 0, { key })).status).toBe(201);
      expect(
        (
          await mutate('link', 0, {
            key,
            document: otherDocument,
            subject: 'document-project-member',
          })
        ).status,
      ).toBe(201);
      expect(await clientVersion()).toBe(before + 2);
      expect(await associationEvents()).toHaveLength(2);
    });

    it('rejects malformed commands and missing keys before persisting any association or history', async () => {
      await grant('organizer');
      const before = await persistence();
      const valid = { action: 'link', projectId, expectedRevision: 0 };
      for (const value of [
        null,
        [],
        {},
        { ...valid, action: 'move' },
        { ...valid, projectId: 'not-a-uuid' },
        { ...valid, expectedRevision: -1 },
        { ...valid, expectedRevision: 0.5 },
        { ...valid, expectedRevision: '0' },
        { ...valid, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
        { ...valid, companyId },
        { action: 'link', projectId },
      ])
        expect(
          (
            await request(`/documents/${documentId}/project-association`, {
              method: 'POST',
              value,
            })
          ).status,
        ).toBe(400);
      expect((await mutate('link', 0, { key: null })).status).toBe(400);
      expect((await mutate('link', 0, { document: 'not-a-uuid' })).status).toBe(
        400,
      );
      expect(await persistence()).toEqual(before);
    });

    it('hides foreign Company and Workspace targets just like missing identifiers', async () => {
      await grant('organizer');
      const otherCompany = text(
        (await command('/companies', { displayName: 'Hidden Company' })).id,
      );
      for (const kind of ['project', 'document', 'organizer'] satisfies Array<
        keyof typeof assignmentPaths
      >)
        await grant(kind, membershipId, otherCompany);
      const otherClient = text(
        (
          await command(
            '/clients',
            { displayName: 'Hidden Company Client' },
            { company: otherCompany },
          )
        ).id,
      );
      const otherProject = text(
        (await createProject(otherClient, otherCompany)).id,
      );
      const otherDocument = text(
        (await createDocument(otherClient, otherCompany)).id,
      );
      const before = await persistence();
      const missing = await mutate('link', 0, { project: randomUUID() });
      expect(missing.status).toBe(404);
      const missingBody = await body(missing);
      for (const options of [
        { project: otherProject },
        { document: otherDocument },
        { document: randomUUID() },
        { company: otherCompany },
      ]) {
        const response = await mutate('link', 0, options);
        expect(response.status).toBe(404);
        expect(await body(response)).toEqual(missingBody);
      }
      for (const suffix of ['documents', 'eligible-documents']) {
        const response = await request(`/projects/${otherProject}/${suffix}`);
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain(otherProject);
      }
      const foreignWorkspace = randomUUID();
      await harness.pool.query(
        'INSERT INTO workspaces(id,name) VALUES($1,$2)',
        [foreignWorkspace, 'Hidden Workspace'],
      );
      const foreign = await mutate('link', 0, { workspace: foreignWorkspace });
      expect(foreign.status).toBe(403);
      expect(await foreign.text()).not.toContain(documentId);
      expect(await persistence()).toEqual(before);
      expect(
        await (
          await request('/activity-log', { company: otherCompany })
        ).text(),
      ).not.toContain(documentId);
    });

    it.each(['Client', 'relationship'])(
      'refuses reads, new commands and replay after the original %s is archived',
      async (scope) => {
        await grant('organizer');
        const key = randomUUID();
        expect((await mutate('link', 0, { key })).status).toBe(201);
        const before = await persistence();
        if (scope === 'Client')
          await harness.pool.query(
            "UPDATE client_accounts SET status='archived' WHERE id=$1",
            [clientId],
          );
        else
          await harness.pool.query(
            "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1 AND company_id=$2",
            [clientId, companyId],
          );
        for (const response of [
          await mutate('link', 0, { key }),
          await mutate('unlink', 1),
          await request(`/projects/${projectId}/documents`),
          await request(`/projects/${projectId}/eligible-documents`),
        ]) {
          expect(response.status).toBe(404);
          expect(await response.text()).not.toContain(documentId);
        }
        expect(await persistence()).toEqual(before);
        expect(await associationEvents()).toEqual([]);
      },
    );

    it.each(['link', 'unlink'] satisfies Array<'link' | 'unlink'>)(
      'rolls back the %s, revision, command and Client fence when history cannot commit',
      async (action) => {
        await grant('organizer');
        if (action === 'unlink')
          expect((await mutate('link', 0)).status).toBe(201);
        const before = await persistence();
        const key = randomUUID();
        await harness.pool.query(
          `CREATE FUNCTION reject_document_project_event() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced association history failure'; END; $$ LANGUAGE plpgsql;
       CREATE TRIGGER reject_document_project_event BEFORE INSERT ON document_project_events FOR EACH ROW EXECUTE FUNCTION reject_document_project_event();`,
        );
        try {
          expect((await mutate(action, before.revision, { key })).status).toBe(
            500,
          );
          expect(await persistence()).toEqual(before);
        } finally {
          await harness.pool.query(
            'DROP TRIGGER reject_document_project_event ON document_project_events; DROP FUNCTION reject_document_project_event();',
          );
        }
        expect((await mutate(action, before.revision, { key })).status).toBe(
          201,
        );
        const after = await persistence();
        expect(after).toEqual({
          projectId: action === 'link' ? projectId : null,
          revision: before.revision + 1,
          version: before.version + 1,
          events: String(Number(before.events) + 1),
        });
      },
    );

    /** The owner's identity with a metadata-only context no bundle grants. */
    function metadataOnlyActor(): ActorContext {
      return {
        internalUserId,
        workspaceMembershipId: membershipId,
        workspaceId,
        workspaceName: 'Document Projects',
        displayName: 'Document Project Organizer',
        email: 'document-project-owner@example.test',
        active: true,
        workspacePermissions: ['client.manage'],
        activeCompany: {
          id: companyId,
          displayName: 'PRISMA-PRIM',
          clientPermissions: [],
          documentPermissions: ['document.read'],
          projectPermissions: ['project.read'],
        },
      };
    }
    function moduleServices() {
      const context = new DatabaseContext(drizzle(harness.pool));
      const authorization = new CompanyContextAuthorization(context);
      const clients = new ClientOperationalReferenceService(context);
      const accountability = new AccountabilityService(context);
      const projects = new ProjectService(
        context,
        authorization,
        clients,
        accountability,
      );
      const boundary = new DocumentReadBoundary(
        authorization,
        context,
        clients,
      );
      const documents = new DocumentsService(
        authorization,
        context,
        clients,
        accountability,
        projects,
        boundary,
        new DocumentVersionsService(authorization, context, clients, boundary),
      );
      return {
        documents,
        associations: new DocumentProjectsService(
          authorization,
          context,
          clients,
          documents,
          projects,
          new ProjectClosedGuard(context),
        ),
      };
    }

    it('preserves metadata access without serializing a reference URL for a metadata-only module actor', async () => {
      await grant('organizer');
      expect((await mutate('link', 0)).status).toBe(201);
      const unlinked = await createDocument();
      const actor = metadataOnlyActor();
      // No metadata-only bundle is introduced; the public module seam proves the
      // separate URL permission while live persisted grants still authorize reads.
      const { documents, associations } = moduleServices();
      for (const [eligible, id] of [
        [false, documentId],
        [true, text(unlinked.id)],
      ] satisfies Array<[boolean, string]>) {
        const page = await associations.list(actor, projectId, eligible);
        expect(page.documents).toHaveLength(1);
        expect(page.documents[0]).toMatchObject({
          document: {
            id,
            title: 'Working questionnaire',
            version: { representation: { access: 'denied' } },
          },
        });
        expect(JSON.stringify(page)).not.toContain('https://');
      }
      const linked = await documents.detail(actor, documentId);
      expect(linked).toMatchObject({
        projectAssociation: linkedTo(projectId),
        version: { representation: { access: 'denied' } },
      });
      expect(JSON.stringify(linked)).not.toContain('https://');
    });

    it('omits the association instead of claiming unlinked when the Project module refuses a stale Project reader', async () => {
      await grant('organizer');
      expect((await mutate('link', 0)).status).toBe(201);
      const unlinked = await createDocument();
      await revoke('project');
      // The captured context still claims project.read; the Project module's
      // live read refuses it without hiding the readable Document.
      const { documents } = moduleServices();
      for (const [id, listedDocument] of [
        [documentId, document],
        [text(unlinked.id), unlinked],
      ] satisfies Array<[string, Record<string, unknown>]>) {
        const read = await documents.detail(metadataOnlyActor(), id);
        expect(read).toMatchObject({ id, title: 'Working questionnaire' });
        expect(read).not.toHaveProperty('projectAssociation');
        expect(JSON.stringify(read)).not.toContain(projectId);
        expect(JSON.stringify(read)).not.toContain('ISO preparation');
        expect(await detail(id)).toEqual(listedDocument);
      }
    });

    it('projects the current association on every single-Document response for a Project reader while lists stay unchanged', async () => {
      await grant('organizer');
      const secondProject = text(
        (await createProject(clientId, companyId, 'Second preparation')).id,
      );
      const key = randomUUID();
      const registered = await command('/documents', registration(), { key });
      const registeredId = text(registered.id);
      expect(registered.projectAssociation).toEqual(unlinkedAssociation);
      expect(await detail(registeredId)).toEqual(registered);
      expect((await mutate('link', 0, { document: registeredId })).status).toBe(
        201,
      );
      const linked = { ...registered, projectAssociation: linkedTo(projectId) };
      expect(await detail(registeredId)).toEqual(linked);
      // An exact registration replay answers with the current association.
      expect(await command('/documents', registration(), { key })).toEqual(
        linked,
      );
      expect(
        (await mutate('unlink', 1, { document: registeredId })).status,
      ).toBe(201);
      expect(await detail(registeredId)).toEqual(registered);
      expect(
        (
          await mutate('link', 2, {
            document: registeredId,
            project: secondProject,
          })
        ).status,
      ).toBe(201);
      const relinked = {
        ...registered,
        projectAssociation: linkedTo(secondProject, 'Second preparation'),
      };
      expect(await detail(registeredId)).toEqual(relinked);
      // Changed and unchanged corrections keep the association they did not touch.
      const corrected = {
        ...relinked,
        title: 'Corrected questionnaire',
        workingRevision: 2,
      };
      for (const [expectedRevision, outcome] of [
        [1, 'corrected'],
        [2, 'unchanged'],
      ] satisfies Array<[number, 'corrected' | 'unchanged']>) {
        const correction = await request(`/documents/${registeredId}`, {
          method: 'PATCH',
          value: { expectedRevision, title: 'Corrected questionnaire' },
        });
        expect(correction.status).toBe(200);
        expect(await body(correction)).toEqual({
          documentId: registeredId,
          revision: 2,
          outcome,
        });
        expect(await detail(registeredId)).toEqual(corrected);
      }
      expect(await list(false, secondProject)).toEqual({
        mutable: true,
        documents: [{ document: listed(corrected), revision: 3 }],
      });
      expect(await (await request('/documents')).json()).toEqual([
        listed(corrected),
        document,
      ]);
    });

    it('never discloses Project identity to a Document-only reader, including through registration', async () => {
      await grant('organizer');
      const reader = 'document-project-member';
      const readerMembership = text((await member()).workspaceMembershipId);
      await grant('client', readerMembership);
      await grant('document', readerMembership);
      const unlinked = await detail(documentId, reader);
      expect(unlinked).toMatchObject({
        id: documentId,
        title: 'Working questionnaire',
      });
      expect(unlinked).not.toHaveProperty('projectAssociation');
      expect((await mutate('link', 0)).status).toBe(201);
      const linked = await request(`/documents/${documentId}`, {
        subject: reader,
      });
      expect(linked.status).toBe(200);
      const raw = await linked.text();
      expect(JSON.parse(raw)).toEqual(unlinked);
      expect(raw).not.toContain(projectId);
      expect(raw).not.toContain('ISO preparation');
      const registered = await command('/documents', registration(), {
        subject: reader,
      });
      expect(registered).not.toHaveProperty('projectAssociation');
      // Current Project read authority alone decides whether the key appears.
      await grant('project', readerMembership);
      expect(await detail(documentId, reader)).toEqual({
        ...unlinked,
        projectAssociation: linkedTo(projectId),
      });
      await revoke('project', readerMembership);
      expect(await detail(documentId, reader)).toEqual(unlinked);
    });

    async function unionSetup(
      options: { supersedeOriginal?: boolean; second?: string } = {},
    ) {
      const second =
        options.second ??
        text(
          (
            await command('/clients', {
              displayName: 'Second synthetic Client',
              taxId: 'SECOND-245',
            })
          ).id,
        );
      await harness.pool.query(
        "UPDATE client_accounts SET tax_id='DOCUMENT-PROJECT-245' WHERE id=ANY($1::uuid[])",
        [[clientId, second]],
      );
      const review = await command(`/clients/${clientId}/union-reviews`, {});
      expect(review.outcome).toBe('comparison');
      const union = await command(
        `/client-union-reviews/${text(review.reviewReference)}/confirm`,
        {
          canonicalClientId: options.supersedeOriginal ? second : clientId,
          fields: {
            displayName: clientId,
            taxId: clientId,
            address: clientId,
            telephone: clientId,
            generalEmail: clientId,
            businessActivity: clientId,
          },
          companyIds: [companyId],
          reviewedDifferences: true,
          reason: 'Duplicate synthetic Client identity.',
        },
      );
      return { second, reference: text(union.projectionReference) };
    }
    function reverse(reference: string) {
      return request(`/client-union-operations/${reference}/reversal`, {
        method: 'POST',
        value: { companyIds: [companyId], reason: 'Reverse synthetic union.' },
      });
    }

    it('keeps superseded original references readable, refuses new mutations and confirms an exact historical replay without fencing reversal', async () => {
      await grant('organizer');
      const unlinked = await createDocument();
      const key = randomUUID();
      const linked = await mutate('link', 0, { key });
      expect(linked.status).toBe(201);
      const receipt = await body(linked);
      const { second, reference } = await unionSetup({
        supersedeOriginal: true,
      });
      const before = await persistence();
      // The stored original association is immutable; only the derived
      // navigation target follows the current canonical Client dossier.
      const superseded = { correction: 'read-only', clientDossierId: second };
      expect(await list()).toEqual({
        mutable: false,
        documents: [{ document: { ...document, ...superseded }, revision: 1 }],
      });
      // Eligibility is mutation-only, so the superseded original Client is
      // hidden even though the historical association remains readable.
      expect(
        (await request(`/projects/${projectId}/eligible-documents`)).status,
      ).toBe(404);
      // The historical link stays displayed while correction is read-only.
      expect(await detail()).toEqual({
        ...document,
        ...superseded,
        projectAssociation: linkedTo(projectId),
      });
      expect(await detail(text(unlinked.id))).toEqual({
        ...unlinked,
        ...superseded,
        projectAssociation: unlinkedAssociation,
      });
      expect((await mutate('unlink', 1)).status).toBe(404);
      expect(
        (await mutate('link', 0, { document: text(unlinked.id) })).status,
      ).toBe(404);
      const replay = await mutate('link', 0, { key });
      expect(replay.status).toBe(201);
      expect(await body(replay)).toEqual(receipt);
      expect(await persistence()).toEqual(before);
      expect(await associationEvents()).toHaveLength(1);
      expect((await reverse(reference)).status).toBe(201);
      expect(await list()).toEqual({
        mutable: true,
        documents: [{ document, revision: 1 }],
      });
      expect(await detail()).toEqual({
        ...document,
        projectAssociation: linkedTo(projectId),
      });
    });

    it('does not make a different stored original Client eligible when union gives it the same canonical identity', async () => {
      await grant('organizer');
      const second = text(
        (await command('/clients', { displayName: 'Second synthetic Client' }))
          .id,
      );
      const secondDocument = await createDocument(second);
      await unionSetup({ second });
      expect(await list(true)).toEqual({
        mutable: true,
        documents: [{ document, revision: 0 }],
      });
      expect(
        (await mutate('link', 0, { document: text(secondDocument.id) })).status,
      ).toBe(404);
      expect(await associationEvents()).toEqual([]);
    });

    it.each(['link', 'unlink'] satisfies Array<'link' | 'unlink'>)(
      'advances the Client reversal fence for a new post-union %s',
      async (action) => {
        await grant('organizer');
        if (action === 'unlink')
          expect((await mutate('link', 0)).status).toBe(201);
        const { reference } = await unionSetup();
        const before = await persistence();
        expect((await mutate(action, before.revision)).status).toBe(201);
        expect((await persistence()).version).toBe(before.version + 1);
        expect((await reverse(reference)).status).toBe(409);
        expect(await detail()).toEqual({
          ...document,
          projectAssociation:
            action === 'link' ? linkedTo(projectId) : unlinkedAssociation,
        });
      },
    );

    it.each(['link', 'unlink'] satisfies Array<'link' | 'unlink'>)(
      'serializes %s against union reversal without losing its original association',
      async (action) => {
        await grant('organizer');
        if (action === 'unlink')
          expect((await mutate('link', 0)).status).toBe(201);
        const { reference } = await unionSetup();
        const revision = action === 'link' ? 0 : 1;
        const [mutation, reversal] = await Promise.all([
          mutate(action, revision),
          reverse(reference),
        ]);
        expect(mutation.status).toBe(201);
        expect([201, 409]).toContain(reversal.status);
        expect(await list()).toEqual({
          mutable: true,
          documents:
            action === 'link' ? [{ document, revision: revision + 1 }] : [],
        });
        expect(await detail()).toEqual({
          ...document,
          projectAssociation:
            action === 'link' ? linkedTo(projectId) : unlinkedAssociation,
        });
        if (reversal.status === 409)
          expect((await reverse(reference)).status).toBe(409);
      },
    );

    it('preserves append-only association events after unlinking', async () => {
      await grant('organizer');
      expect((await mutate('link', 0)).status).toBe(201);
      expect((await mutate('unlink', 1)).status).toBe(201);
      const before = await associationEvents();
      await expect(
        harness.pool.query(
          'UPDATE document_project_events SET occurred_at=now() WHERE document_id=$1',
          [documentId],
        ),
      ).rejects.toThrow('append-only');
      await expect(
        harness.pool.query(
          'DELETE FROM document_project_events WHERE document_id=$1',
          [documentId],
        ),
      ).rejects.toThrow('append-only');
      expect(await associationEvents()).toEqual(before);
    });

    it('shares the bounded dated Activity Log page with older registrations and ordinary events', async () => {
      await grant('organizer');
      // Set future synthetic server times without rewriting any append-only event.
      await harness.pool.query(
        "ALTER TABLE document_project_events ALTER COLUMN occurred_at SET DEFAULT '2030-03-01T12:00:00Z'::timestamptz",
      );
      try {
        for (let revision = 0; revision < 51; revision += 1)
          expect(
            (await mutate(revision % 2 === 0 ? 'link' : 'unlink', revision))
              .status,
          ).toBe(201);
        const page = await body(await request('/activity-log'));
        const events = objects(page.events);
        expect(events).toHaveLength(50);
        expect(
          events.every(
            (event) =>
              event.action === 'document.project.linked' ||
              event.action === 'document.project.unlinked',
          ),
        ).toBe(true);
        for (const event of events)
          expect(event.occurredAt).toBe('2030-03-01T12:00:00.000Z');
        const ids = events.map((event) => text(event.id));
        expect(new Set(ids).size).toBe(50);
        expect(ids).toEqual([...ids].sort().reverse());
      } finally {
        await harness.pool.query(
          'ALTER TABLE document_project_events ALTER COLUMN occurred_at SET DEFAULT now()',
        );
      }
    });
  },
);
