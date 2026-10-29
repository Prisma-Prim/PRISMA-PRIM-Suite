import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MissionApplicabilityStore } from './mission-applicability.store.js';
import {
  pilotKey,
  objects,
} from '../project-template/project-pilot-plan.test-support.js';
import { preserveFrozenResultDocument } from '../task/task-results.test-support.js';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import {
  currentApplicability,
  demoProposal,
  observedApplicability,
  prepareApplicability,
} from './mission-applicability.test-support.js';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  'Applicability caller transaction through held PostgreSQL public commands',
  () => {
    let fixture: MissionDocumentFixture;
    beforeAll(async () => {
      if (!url) throw new Error('PostgreSQL required');
      fixture = await createMissionDocumentFixture(url);
    });
    afterAll(async () => fixture?.close());

    async function blockedBy(pid: number) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const rows = await fixture.pool.query(
          'SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid)) LIMIT 1',
          [pid],
        );
        const row = rows.rows[0];
        if (row !== undefined) {
          const value = record(row).pid;
          if (typeof value !== 'number')
            throw new Error('Missing backend identity');
          return value;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(
        'Public command did not reach the expected owner barrier',
      );
    }
    async function gate(
      table: string,
      operation: 'INSERT' | 'UPDATE',
      condition = 'true',
    ) {
      // Identifiers and conditions are fixed test-owned literals. Every business owner remains real.
      await fixture.pool.query(
        `CREATE FUNCTION applicability_test_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN PERFORM pg_advisory_xact_lock(972); END IF; RETURN NEW; END $$`,
      );
      await fixture.pool.query(
        `CREATE TRIGGER applicability_test_gate BEFORE ${operation} ON ${table} FOR EACH ROW EXECUTE FUNCTION applicability_test_gate()`,
      );
      const connection = await fixture.pool.connect();
      await connection.query('BEGIN');
      const pid = record(
        (await connection.query('SELECT pg_backend_pid() AS pid')).rows[0],
      ).pid;
      if (typeof pid !== 'number') throw new Error('Missing gate identity');
      await connection.query('SELECT pg_advisory_xact_lock(972)');
      let released = false;
      return {
        pid,
        release: async () => {
          if (released) return;
          released = true;
          try {
            await connection.query('COMMIT');
          } finally {
            connection.release();
          }
        },
        remove: () =>
          fixture.pool.query('DROP FUNCTION applicability_test_gate() CASCADE'),
      };
    }
    async function prepare() {
      const context = await prepareApplicability(fixture);
      await fixture.grant(
        '/company-mission-applicability-coordinator-assignments',
      );
      const body = {
        ...(await observedApplicability(fixture, context.path, context.taskId)),
        ...demoProposal,
      };
      return { ...context, body };
    }
    async function race(input: {
      first: () => Promise<Pick<Response, 'status'>>;
      second: () => Promise<Pick<Response, 'status'>>;
      barrier: Awaited<ReturnType<typeof gate>>;
      statuses: [number, number];
    }) {
      let first: Promise<Pick<Response, 'status'>> | undefined,
        second: Promise<Pick<Response, 'status'>> | undefined;
      try {
        first = input.first();
        const firstPid = await blockedBy(input.barrier.pid);
        second = input.second();
        await blockedBy(firstPid);
        await input.barrier.release();
        expect((await first).status).toBe(input.statuses[0]);
        expect((await second).status).toBe(input.statuses[1]);
      } finally {
        await input.barrier.release();
        await first?.catch(() => undefined);
        await second?.catch(() => undefined);
        await input.barrier.remove();
      }
    }

    it.each(['same-key', 'new-key'] as const)(
      'serializes %s duplicate delivery before producing one immutable fact and conserved receipts',
      async (kind) => {
        const c = await prepare(),
          barrier = await gate('mission_applicability_facts', 'INSERT');
        const command = (key: string) =>
          fixture.call(c.path, { method: 'POST', key, body: c.body });
        await race({
          barrier,
          first: () => command('race-original-demo'),
          second: () =>
            command(
              kind === 'same-key' ? 'race-original-demo' : 'race-new-demo',
            ),
          statuses: [201, kind === 'same-key' ? 201 : 409],
        });
        expect((await currentApplicability(fixture, c.path)).revision).toBe(1);
        expect(
          (
            await fixture.pool.query(
              'SELECT count(*)::int AS count FROM mission_applicability_commands',
            )
          ).rows,
        ).toEqual([{ count: 1 }]);
      },
    );

    it.each(['applicability-first', 'task-first'] as const)(
      'conserves the exact observed Task while allowing ordinary later Task changes: %s',
      async (order) => {
        const c = await prepare();
        const propose = () =>
          fixture.call(c.path, { method: 'POST', body: c.body });
        const cancel = () =>
          fixture.call(`/tasks/${c.taskId}/cancel`, {
            method: 'POST',
            body: {
              expectedVersion: 1,
              reason: 'Ordinary native Task cancellation DEMO',
            },
          });
        const barrier =
          order === 'applicability-first'
            ? await gate('mission_applicability_facts', 'INSERT')
            : await gate('tasks', 'UPDATE');
        await race({
          barrier,
          first: order === 'applicability-first' ? propose : cancel,
          second: order === 'applicability-first' ? cancel : propose,
          statuses: [201, order === 'applicability-first' ? 201 : 409],
        });
        const projection = await currentApplicability(fixture, c.path);
        expect(projection.revision).toBe(
          order === 'applicability-first' ? 1 : 0,
        );
        expect((await fixture.call(`/tasks/${c.taskId}`)).status).toBe(200);
      },
    );

    const consumedBundles = [
      ['project', 'company_project_access'],
      ['task-manager', 'company_task_manager'],
      ['project-template-user', 'company_project_template_user'],
      ['document-registrar', 'company_document_registrar'],
      ['document-content-reader', 'company_document_content_reader'],
      ['mission-deliverable-access', 'company_mission_deliverable_access'],
      [
        'mission-applicability-coordinator',
        'company_mission_applicability_coordinator',
      ],
    ] as const;
    it.each(
      consumedBundles.flatMap(([path, bundle]) =>
        (['applicability-first', 'revoke-first'] as const).map((order) => ({
          path,
          bundle,
          order,
        })),
      ),
    )(
      'fences consumed $bundle in both held orders: $order',
      async ({ path, bundle, order }) => {
        const c = await prepare();
        const propose = () =>
          fixture.call(c.path, { method: 'POST', body: c.body });
        const revoke = () =>
          fixture.call(
            `/company-${path}-assignments/${c.membershipId}/${c.companyId}`,
            { method: 'DELETE', company: null },
          );
        const barrier =
          order === 'applicability-first'
            ? await gate('mission_applicability_facts', 'INSERT')
            : await gate(
                'company_role_assignments',
                'UPDATE',
                `NEW.bundle::text='${bundle}'`,
              );
        await race({
          barrier,
          first: order === 'applicability-first' ? propose : revoke,
          second: order === 'applicability-first' ? revoke : propose,
          statuses: [
            order === 'applicability-first' ? 201 : 200,
            order === 'applicability-first'
              ? 200
              : [
                    'document-registrar',
                    'document-content-reader',
                    'mission-deliverable-access',
                  ].includes(path)
                ? 404
                : 403,
          ],
        });
        expect(
          (
            await fixture.pool.query(
              'SELECT count(*)::int AS count FROM mission_applicability_facts',
            )
          ).rows,
        ).toEqual([{ count: order === 'applicability-first' ? 1 : 0 }]);
      },
      20_000,
    );

    it.each(['applicability-first', 'close-first'] as const)(
      'serializes ordinary closure without changing its Task guard or losing historical confirmation: %s',
      async (order) => {
        const c = await prepare();
        await fixture.grant('/company-project-approver-assignments');
        for (const activity of c.activities)
          expect(
            (
              await fixture.call(`/tasks/${text(activity.taskId)}/cancel`, {
                method: 'POST',
                body: {
                  expectedVersion: 1,
                  reason: 'Native closure preparation DEMO',
                },
              })
            ).status,
          ).toBe(201);
        const body = {
          ...c.body,
          ...(await observedApplicability(fixture, c.path, c.taskId)),
        };
        const propose = () =>
          fixture.call(c.path, {
            method: 'POST',
            key: 'closure-race-demo',
            body,
          });
        const close = () =>
          fixture.call(`/projects/${c.projectId}/lifecycle-transitions`, {
            method: 'POST',
            body: {
              action: 'cancel',
              expectedLifecycleRevision: 0,
              reason: 'Ordinary Project closure DEMO',
            },
          });
        const barrier =
          order === 'applicability-first'
            ? await gate('mission_applicability_facts', 'INSERT')
            : await gate('projects', 'UPDATE', "NEW.status='cancelled'");
        await race({
          barrier,
          first: order === 'applicability-first' ? propose : close,
          second: order === 'applicability-first' ? close : propose,
          statuses: [
            order === 'applicability-first' ? 201 : 200,
            order === 'applicability-first' ? 200 : 409,
          ],
        });
        expect((await currentApplicability(fixture, c.path)).mutable).toBe(
          false,
        );
        expect((await propose()).status).toBe(
          order === 'applicability-first' ? 201 : 409,
        );
      },
      20_000,
    );

    it.each([
      'mission_applicability_facts',
      'mission_applicability_streams',
      'mission_applicability_events',
      'mission_applicability_commands',
    ])(
      'rolls back every row and original Client fence when %s fails',
      async (table) => {
        const c = await prepare(),
          before = (
            await fixture.pool.query(
              'SELECT version,updated_at FROM client_accounts WHERE id=$1',
              [c.clientId],
            )
          ).rows;
        await fixture.pool.query(
          "CREATE FUNCTION applicability_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic transaction fault'; END $$",
        );
        await fixture.pool.query(
          `CREATE TRIGGER applicability_test_fail BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION applicability_test_fail()`,
        );
        try {
          expect(
            (await fixture.call(c.path, { method: 'POST', body: c.body }))
              .status,
          ).toBe(500);
        } finally {
          await fixture.pool.query(
            'DROP FUNCTION applicability_test_fail() CASCADE',
          );
        }
        expect(
          (
            await fixture.pool.query(
              'SELECT version,updated_at FROM client_accounts WHERE id=$1',
              [c.clientId],
            )
          ).rows,
        ).toEqual(before);
        for (const relation of [
          'mission_applicability_facts',
          'mission_applicability_streams',
          'mission_applicability_events',
          'mission_applicability_commands',
        ])
          expect(
            (
              await fixture.pool.query(
                `SELECT count(*)::int AS count FROM ${relation}`,
              )
            ).rows,
          ).toEqual([{ count: 0 }]);
        expect((await currentApplicability(fixture, c.path)).revision).toBe(0);
      },
    );

    it('rolls back the completed native writes and Client fence when receipt response construction throws', async () => {
      const c = await prepare(),
        before = (
          await fixture.pool.query(
            'SELECT version,updated_at FROM client_accounts WHERE id=$1',
            [c.clientId],
          )
        ).rows;
      // Inject only a response-construction fault. The public HTTP caller, owning services,
      // real PostgreSQL writes, native guards and transaction commit remain under test.
      const fault = vi
        .spyOn(MissionApplicabilityStore.prototype, 'response')
        .mockImplementationOnce(() => {
          throw new Error('Synthetic response construction fault');
        });
      try {
        expect(
          (await fixture.call(c.path, { method: 'POST', body: c.body })).status,
        ).toBe(500);
      } finally {
        fault.mockRestore();
      }
      expect(
        (
          await fixture.pool.query(
            'SELECT version,updated_at FROM client_accounts WHERE id=$1',
            [c.clientId],
          )
        ).rows,
      ).toEqual(before);
      for (const relation of [
        'mission_applicability_facts',
        'mission_applicability_streams',
        'mission_applicability_events',
        'mission_applicability_commands',
      ])
        expect(
          (
            await fixture.pool.query(
              `SELECT count(*)::int AS count FROM ${relation}`,
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
      expect((await currentApplicability(fixture, c.path)).revision).toBe(0);
    });

    const collaborator = {
      subject: 'mission-collaborator',
      displayName: 'Applicability Collaborator DEMO',
      email: 'applicability@example.test',
    };
    async function grantCollaborator(companyId: string) {
      const actor = await json(
          await fixture.call('/access/current-actor', {
            identity: collaborator,
            company: null,
          }),
        ),
        member = text(actor.workspaceMembershipId),
        user = text(actor.internalUserId);
      for (const bundle of [
        'context',
        'director-client',
        'project',
        'task-manager',
        'project-template-user',
        'document-registrar',
        'mission-deliverable-access',
        'document-content-reader',
        'mission-applicability-coordinator',
        'mission-applicability-approver',
      ])
        expect(
          (
            await fixture.call(
              bundle === 'context'
                ? '/company-context-assignments'
                : `/company-${bundle}-assignments`,
              {
                method: 'POST',
                company: null,
                body: { companyId, workspaceMembershipId: member },
              },
            )
          ).status,
        ).toBe(201);
      return { member, user };
    }
    const parents = [
      'membership',
      'internal-user',
      'company',
      'company-context',
      'client-read-capture',
    ] as const;
    it.each(
      parents.flatMap((parent) =>
        (['applicability-first', 'invalidation-first'] as const).map(
          (order) => ({ parent, order }),
        ),
      ),
    )(
      'fences $parent through commit in both held orders: $order',
      async ({ parent, order }) => {
        const c = await prepare(),
          { member, user } = await grantCollaborator(c.companyId);
        const propose = () =>
          fixture.call(c.path, {
            method: 'POST',
            identity: collaborator,
            body: c.body,
          });
        // Internal User and Company suspension have no public mutation endpoint. These
        // two invalidators exercise their real native parent rows; membership and
        // captured Company/Client authority use their existing public commands.
        async function invalidate(): Promise<Pick<Response, 'status'>> {
          switch (parent) {
            case 'membership':
              return fixture.call('/workspace-membership-suspensions', {
                method: 'POST',
                company: null,
                body: { workspaceMembershipId: member },
              });
            case 'company-context':
              return fixture.call(
                `/company-context-assignments/${member}/${c.companyId}`,
                { method: 'DELETE', company: null },
              );
            case 'client-read-capture':
              return fixture.call(
                `/company-director-client-assignments/${member}/${c.companyId}`,
                { method: 'DELETE', company: null },
              );
            case 'internal-user':
              await fixture.pool.query(
                "UPDATE internal_users SET status='inactive' WHERE id=$1",
                [user],
              );
              return { status: 200 };
            case 'company':
              await fixture.pool.query(
                "UPDATE companies SET status='inactive' WHERE id=$1",
                [c.companyId],
              );
              return { status: 200 };
            default: {
              const exhaustive: never = parent;
              return exhaustive;
            }
          }
        }
        const table =
          parent === 'membership'
            ? 'workspace_memberships'
            : parent === 'internal-user'
              ? 'internal_users'
              : parent === 'company'
                ? 'companies'
                : 'company_role_assignments';
        const condition =
          parent === 'company-context'
            ? "NEW.bundle::text='company_context_access'"
            : parent === 'client-read-capture'
              ? "NEW.bundle::text='company_director_client_access'"
              : "NEW.status='inactive'";
        const barrier =
          order === 'applicability-first'
            ? await gate('mission_applicability_facts', 'INSERT')
            : await gate(table, 'UPDATE', condition);
        const invalidatedStatus = parent === 'membership' ? 201 : 200;
        // Company context remains usable through the other live role assignments.
        // Revoking only its generic opt-in is an unrelated-grant positive control;
        // it must not invent a new prerequisite for existing Company visibility.
        const consumed = parent !== 'company-context';
        await race({
          barrier,
          first: order === 'applicability-first' ? propose : invalidate,
          second: order === 'applicability-first' ? invalidate : propose,
          statuses: [
            order === 'applicability-first' ? 201 : invalidatedStatus,
            order === 'applicability-first'
              ? invalidatedStatus
              : consumed
                ? 403
                : 201,
          ],
        });
        expect(
          (
            await fixture.pool.query(
              'SELECT count(*)::int AS count FROM mission_applicability_facts',
            )
          ).rows,
        ).toEqual([
          { count: order === 'applicability-first' || !consumed ? 1 : 0 },
        ]);
        expect((await propose()).status).toBe(consumed ? 403 : 409);
      },
      20_000,
    );

    it.each(
      ['client', 'relationship'].flatMap((parent) =>
        (['applicability-first', 'archive-first'] as const).map((order) => ({
          parent,
          order,
        })),
      ),
    )(
      'fences native $parent archive after Client identity and before relationship: $order',
      async ({ parent, order }) => {
        const c = await prepare();
        const propose = () =>
          fixture.call(c.path, { method: 'POST', body: c.body });
        const table =
          parent === 'client'
            ? 'client_accounts'
            : 'client_company_relationships';
        // The Client owner exposes registration/attachment/correction/union, but no
        // archive endpoint. Native invalidation proves the same row fence directly.
        const archive = async () => {
          await fixture.pool.query(
            `UPDATE ${table} SET status='archived' WHERE ${parent === 'client' ? 'id' : 'client_account_id'}=$1`,
            [c.clientId],
          );
          return { status: 200 };
        };
        const barrier =
          order === 'applicability-first'
            ? await gate('mission_applicability_facts', 'INSERT')
            : await gate(table, 'UPDATE', "NEW.status='archived'");
        await race({
          barrier,
          first: order === 'applicability-first' ? propose : archive,
          second: order === 'applicability-first' ? archive : propose,
          statuses: [
            order === 'applicability-first' ? 201 : 200,
            order === 'applicability-first' ? 200 : 409,
          ],
        });
        expect(
          (
            await fixture.pool.query(
              'SELECT count(*)::int AS count FROM mission_applicability_facts',
            )
          ).rows,
        ).toEqual([{ count: order === 'applicability-first' ? 1 : 0 }]);
      },
      20_000,
    );

    async function unionScenario() {
      const c = await prepare();
      await fixture.grant('/company-director-client-assignments');
      const canonical = await fixture.call('/clients', {
        method: 'POST',
        body: { displayName: 'Canonical Client DEMO' },
      });
      expect(canonical.status).toBe(201);
      const canonicalId = text((await json(canonical)).id);
      // The Client owner intentionally rejects newly created duplicate tax IDs.
      // Its governed union accepts existing legacy duplicates, represented here
      // using only synthetic legacy dossier data; union/reversal themselves are public.
      await fixture.pool.query(
        "UPDATE client_accounts SET tax_id='APPLICABILITY-UNION-DEMO' WHERE id=ANY($1::uuid[])",
        [[c.clientId, canonicalId]],
      );
      const begin = async () => {
        const response = await fixture.call(
          `/clients/${c.clientId}/union-reviews`,
          { method: 'POST', body: {} },
        );
        expect(response.status).toBe(201);
        return text((await json(response)).reviewReference);
      };
      const confirm = (reference: string) =>
        fixture.call(`/client-union-reviews/${reference}/confirm`, {
          method: 'POST',
          body: {
            canonicalClientId: canonicalId,
            fields: {
              displayName: c.clientId,
              taxId: c.clientId,
              address: c.clientId,
              telephone: c.clientId,
              generalEmail: c.clientId,
              businessActivity: c.clientId,
            },
            companyIds: [c.companyId],
            reviewedDifferences: true,
            reason: 'Governed synthetic duplicate correction DEMO',
          },
        });
      return { ...c, canonicalId, begin, confirm };
    }
    it.each(['applicability-first', 'union-first'] as const)(
      'serializes governed union, preserves original Client identity/history and distinguishes old confirmation from a new intent: %s',
      async (order) => {
        const c = await unionScenario(),
          reference = await c.begin();
        let originalReceipt: unknown;
        const propose = async () => {
          const response = await fixture.call(c.path, {
            method: 'POST',
            key: 'union-applicability-demo',
            body: c.body,
          });
          if (originalReceipt === undefined && response.status === 201)
            originalReceipt = await json(response.clone());
          return response;
        };
        const union = () => c.confirm(reference);
        const barrier =
          order === 'applicability-first'
            ? await gate('mission_applicability_facts', 'INSERT')
            : await gate(
                'client_accounts',
                'UPDATE',
                "NEW.status='superseded' AND OLD.status='active'",
              );
        await race({
          barrier,
          first: order === 'applicability-first' ? propose : union,
          second: order === 'applicability-first' ? union : propose,
          statuses: [201, order === 'applicability-first' ? 404 : 409],
        });
        if (order === 'applicability-first')
          expect((await c.confirm(await c.begin())).status).toBe(201);
        const projection = await currentApplicability(fixture, c.path);
        expect(projection).toMatchObject({
          mutable: false,
          revision: order === 'applicability-first' ? 1 : 0,
        });
        expect((await fixture.call(c.path + '/history')).status).toBe(200);
        if (order === 'applicability-first') {
          const replay = await propose();
          expect(replay.status).toBe(201);
          expect(await json(replay)).toEqual(originalReceipt);
        }
        expect(
          (
            await fixture.call(c.path, {
              method: 'POST',
              body: {
                ...c.body,
                ...(await observedApplicability(fixture, c.path, c.taskId)),
              },
            })
          ).status,
        ).toBe(409);
        expect(
          (await json(await fixture.call(`/projects/${c.projectId}`)))
            .clientAccountId,
        ).toBe(c.clientId);
      },
      20_000,
    );

    it.each(['applicability-first', 'reversal-first'] as const)(
      'serializes governed reversal against an existing active canonical Client Project without inventing a lifecycle change: %s',
      async (order) => {
        const c = await unionScenario();
        const created = await fixture.call('/projects/from-template', {
          method: 'POST',
          body: {
            clientAccountId: c.canonicalId,
            title: 'Pre-union canonical Project DEMO',
            templateKey: pilotKey,
            templateVersion: 1,
          },
        });
        expect(created.status).toBe(201);
        const projectId = text((await json(created)).id),
          path = `/projects/${projectId}/mission-applicability`,
          plan = record(
            (await json(await fixture.call(`/projects/${projectId}/template`)))
              .template,
          ),
          taskId = text(objects(plan.activities)[0]?.taskId);
        expect((await c.confirm(await c.begin())).status).toBe(201);
        const history = await json(
          await fixture.call(`/clients/${c.clientId}/union-history`),
        );
        if (!Array.isArray(history.detailReferences))
          throw new Error('Missing governed union reference');
        const reference = text(history.detailReferences[0]),
          body = {
            ...(await observedApplicability(fixture, path, taskId)),
            ...demoProposal,
          };
        const propose = () => fixture.call(path, { method: 'POST', body });
        const reverse = () =>
          fixture.call(`/client-union-operations/${reference}/reversal`, {
            method: 'POST',
            body: {
              companyIds: [c.companyId],
              reason: 'Governed reversal DEMO',
            },
          });
        const barrier =
          order === 'applicability-first'
            ? await gate('mission_applicability_facts', 'INSERT')
            : await gate(
                'client_accounts',
                'UPDATE',
                `NEW.id='${c.canonicalId}'::uuid AND NEW.status='active'`,
              );
        // A material applicability fact advances the Client's operational-use fence,
        // so a later reversal follows its existing 409 rule. Reversal first leaves
        // this exact original Client and relationship active: the fresh fact may append.
        await race({
          barrier,
          first: order === 'applicability-first' ? propose : reverse,
          second: order === 'applicability-first' ? reverse : propose,
          statuses: [201, order === 'applicability-first' ? 409 : 201],
        });
        expect(await currentApplicability(fixture, path)).toMatchObject({
          mutable: true,
          revision: 1,
        });
        expect(
          (await json(await fixture.call(`/projects/${projectId}`)))
            .clientAccountId,
        ).toBe(c.canonicalId);
      },
      20_000,
    );

    it.each(['applicability-first', 'result-first'] as const)(
      'fences exact result observations without erasing an earlier attributable fact: %s',
      async (order) => {
        const c = await prepare();
        for (const bundle of [
          'document-content-uploader',
          'document-approver',
          'document-project-organizer',
          'task-result-recorder',
        ])
          await fixture.grant(`/company-${bundle}-assignments`);
        const reference = await preserveFrozenResultDocument({
          fixture,
          registration: {
            type: 'mission-deliverable',
            clientId: c.clientId,
            title: 'Concurrent frozen result DEMO',
            purpose: 'Observe exact result revision',
          },
        });
        expect(
          (
            await fixture.call(
              `/documents/${reference.documentId}/project-association`,
              {
                method: 'POST',
                body: {
                  action: 'link',
                  projectId: c.projectId,
                  expectedRevision: 0,
                },
              },
            )
          ).status,
        ).toBe(201);
        const propose = () =>
          fixture.call(c.path, { method: 'POST', body: c.body });
        const result = () =>
          fixture.call(`/tasks/${c.taskId}/results`, {
            method: 'POST',
            body: {
              ...reference,
              expectedTaskVersion: 1,
              expectedResultRevision: 0,
              declaration: 'Concurrent exact declared result DEMO',
            },
          });
        const barrier =
          order === 'applicability-first'
            ? await gate('mission_applicability_facts', 'INSERT')
            : await gate('task_result_declarations', 'INSERT');
        await race({
          barrier,
          first: order === 'applicability-first' ? propose : result,
          second: order === 'applicability-first' ? result : propose,
          statuses: [201, order === 'applicability-first' ? 201 : 409],
        });
        const current = await currentApplicability(fixture, c.path);
        expect(current.revision).toBe(order === 'applicability-first' ? 1 : 0);
        const selected = objects(current.activities).find(
          (row) => record(row.task).id === c.taskId,
        );
        if (!selected) throw new Error('Missing exact mapped activity');
        expect(record(record(selected.result).current).revision).toBe(1);
        if (order === 'applicability-first')
          expect(record(selected.pendingProposal).observedResultRevision).toBe(
            0,
          );
      },
      20_000,
    );

    it.each(['decision-first', 'revoke-first'] as const)(
      'fences the independently captured Approver in both held orders: %s',
      async (order) => {
        const c = await prepare();
        await fixture.grant(
          '/company-mission-applicability-approver-assignments',
        );
        const proposal = await fixture.call(c.path, {
          method: 'POST',
          body: c.body,
        });
        expect(proposal.status).toBe(201);
        const receipt = await json(proposal);
        const body = {
          ...(await observedApplicability(fixture, c.path, c.taskId)),
          action: 'DECIDE',
          proposalId: receipt.factId,
          outcome: 'REJECT',
          basis: 'Exact approver rejection DEMO',
        };
        const decide = () => fixture.call(c.path, { method: 'POST', body });
        const revoke = () =>
          fixture.call(
            `/company-mission-applicability-approver-assignments/${c.membershipId}/${c.companyId}`,
            { method: 'DELETE', company: null },
          );
        const barrier =
          order === 'decision-first'
            ? await gate('mission_applicability_facts', 'INSERT')
            : await gate(
                'company_role_assignments',
                'UPDATE',
                "NEW.bundle::text='company_mission_applicability_approver'",
              );
        await race({
          barrier,
          first: order === 'decision-first' ? decide : revoke,
          second: order === 'decision-first' ? revoke : decide,
          statuses: [
            order === 'decision-first' ? 201 : 200,
            order === 'decision-first' ? 200 : 403,
          ],
        });
        expect((await currentApplicability(fixture, c.path)).revision).toBe(
          order === 'decision-first' ? 2 : 1,
        );
      },
      20_000,
    );
    it.each(['applicability-first', 'review-first'] as const)(
      'preserves independent Result Reviewer facts and applicability in both held orders: %s',
      async (order) => {
        const c = await prepare();
        await fixture.grant('/company-mission-result-reviewer-assignments');
        expect(
          (
            await fixture.call(`/tasks/${c.taskId}/complete`, {
              method: 'POST',
              body: { expectedVersion: 1 },
            })
          ).status,
        ).toBe(201);
        const taskBefore = await json(await fixture.call(`/tasks/${c.taskId}`));
        const propose = () =>
          fixture.call(c.path, {
            method: 'POST',
            body: { ...c.body, ...{ expectedTaskVersion: 2 } },
          });
        const review = () =>
          fixture.call(`/projects/${c.projectId}/mission-result-reviews`, {
            method: 'POST',
            body: {
              expectedReviewRevision: 0,
              outcome: 'NEEDS_WORK',
              basis: 'Independent review DEMO',
              items: [
                {
                  taskId: c.taskId,
                  expectedTaskVersion: 2,
                  expectedResultRevision: 0,
                  evidence: {
                    kind: 'EXTERNAL_REPORTED',
                    reference: 'Physical register DEMO',
                  },
                },
              ],
            },
          });
        const barrier =
          order === 'applicability-first'
            ? await gate('mission_applicability_facts', 'INSERT')
            : await gate('mission_result_review_batches', 'INSERT');
        await race({
          barrier,
          first: order === 'applicability-first' ? propose : review,
          second: order === 'applicability-first' ? review : propose,
          statuses: [201, 201],
        });
        expect((await currentApplicability(fixture, c.path)).revision).toBe(1);
        expect(
          record(
            (
              await json(
                await fixture.call(
                  `/projects/${c.projectId}/mission-result-reviews`,
                ),
              )
            ).review,
          ).revision,
        ).toBe(1);
        expect(await json(await fixture.call(`/tasks/${c.taskId}`))).toEqual(
          taskBefore,
        );
      },
      20_000,
    );
  },
);
