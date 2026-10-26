import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPilotPlanFixture,
  json,
  object,
  objects,
  text,
  pilotKey,
  type PilotPlanFixture,
} from './project-pilot-plan.test-support.js';
import { expectedPilotActivities } from './project-pilot-plan.test-fixtures.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Preserved thirteen-activity pilot planning through public REST',
  () => {
    let fixture: PilotPlanFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await createPilotPlanFixture(databaseUrl);
    });
    beforeEach(async () => {
      await fixture.reset();
    });
    it('qualifies the chosen model and exact Version without changing the legacy catalogue', async () => {
      const catalogue = await fixture.read(
        `/project-templates?templateKey=${pilotKey}`,
      );
      expect(catalogue).toEqual({
        templates: [
          {
            templateKey: pilotKey,
            version: 1,
            title: 'Plan pilot pentru o misiune de consultanță SMI',
            illustrative: true,
            activities: expectedPilotActivities,
          },
        ],
        headVersion: 1,
        nextBeforeVersion: null,
      });
      expect(
        (await fixture.read(`/project-templates/${pilotKey}/versions/1`))
          .template,
      ).toEqual(objects(catalogue.templates)[0]);
      expect(
        object(objects((await fixture.read('/project-templates')).templates)[0])
          .templateKey,
      ).toBe('CONSULTING_PREPARATION_ILLUSTRATIVE');
      expect(
        (await fixture.request(`/project-templates/${pilotKey}/versions/2`))
          .status,
      ).toBe(404);
      expect(
        (await fixture.request('/project-templates?templateKey=UNKNOWN'))
          .status,
      ).toBe(400);
    });
    afterAll(async () => {
      await fixture?.close();
    });

    it('creates and reopens all thirteen literal actions/intended results and independent ordinary Task defaults', async () => {
      const response = await fixture.request('/projects/from-template', {
        method: 'POST',
        body: fixture.intent(),
      });
      expect(response.status).toBe(201);
      const project = await json(response),
        projectId = text(project.id);
      expect(project).toMatchObject({
        companyId: fixture.companyId,
        clientAccountId: fixture.clientId,
        status: 'preparatory',
      });
      const plan = object(
        (await fixture.read(`/projects/${projectId}/template`)).template,
      );
      expect(plan).toMatchObject({
        templateKey: pilotKey,
        version: 1,
        illustrative: true,
        title: 'Plan pilot pentru o misiune de consultanță SMI',
        activities: expectedPilotActivities,
      });
      expect(plan).not.toHaveProperty('stages');
      const activities = objects(plan.activities);
      expect(activities).toHaveLength(13);
      const taskIds = activities.map((row) => text(row.taskId));
      expect(new Set(taskIds).size).toBe(13);
      const tasks = objects(
        (await fixture.read(`/projects/${projectId}/tasks`)).tasks,
      );
      expect(tasks).toHaveLength(13);
      for (const [index, row] of activities.entries()) {
        expect(row).not.toHaveProperty('required');
        expect(tasks.find((task) => task.id === row.taskId)).toMatchObject({
          title: expectedPilotActivities[index]?.title,
          projectId,
          status: 'todo',
          priority: 'normal',
          assignee: null,
          dueDate: null,
          version: 1,
          completion: null,
        });
      }
    });

    it('preserves source and mapping when ordinary Tasks are edited, completed and reopened without declared results', async () => {
      const project = await fixture.command(
        '/projects/from-template',
        fixture.intent(),
      );
      const path = `/projects/${text(project.id)}/template`,
        before = await fixture.read(path);
      const first = objects(object(before.template).activities)[0];
      if (!first) throw new Error('Missing first activity');
      const taskId = text(first.taskId);
      const edited = await fixture.request(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: {
          expectedVersion: 1,
          title: 'Independent ordinary Task DEMO',
          priority: 'important',
          dueDate: '2026-12-12',
        },
      });
      expect(edited.status).toBe(200);
      expect(await fixture.read(path)).toEqual(before);
      const done = await fixture.command(`/tasks/${taskId}/complete`, {
        expectedVersion: 2,
      });
      expect(done.status).toBe('done');
      const reopened = await fixture.command(`/tasks/${taskId}/reopen`, {
        expectedVersion: 3,
      });
      expect(reopened.status).toBe('todo');
      expect(await fixture.read(path)).toEqual(before);
      expect(
        await fixture.read(`/projects/${text(project.id)}/stage-progress`),
      ).toEqual({ progress: null });
      await fixture.grant('/company-project-stage-advancer-assignments');
      expect(
        (
          await fixture.request(`/projects/${text(project.id)}/stage-advance`, {
            method: 'POST',
            body: {
              expectedStageRevision: 0,
              expectedStageKey: 'scoping',
              targetStageKey: 'preparation',
            },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.harness.pool.query(
            'SELECT count(*)::int n FROM task_result_declarations',
          )
        ).rows,
      ).toEqual([{ n: 0 }]);
    });
    it('converges concurrent full-intent retries and conflicts changed title, Client, model, Version and manual commands', async () => {
      const key = randomUUID(),
        body = fixture.intent();
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          fixture.request('/projects/from-template', {
            method: 'POST',
            body,
            key,
          }),
        ),
      );
      expect(responses.map((row) => row.status)).toEqual([201, 201, 201, 201]);
      const projects = await Promise.all(responses.map(json));
      expect(new Set(projects.map((row) => row.id)).size).toBe(1);
      const otherClient = await fixture.command('/clients', {
        displayName: 'Second Client DEMO',
      });
      for (const change of [
        { title: 'Another title' },
        { clientAccountId: otherClient.id },
        { templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE' },
        { templateVersion: 2 },
      ])
        expect(
          (
            await fixture.request('/projects/from-template', {
              method: 'POST',
              body: { ...body, ...change },
              key,
            })
          ).status,
        ).toBe(409);
      expect(
        (
          await fixture.request('/projects', {
            method: 'POST',
            body: { title: body.title, clientAccountId: body.clientAccountId },
            key,
          })
        ).status,
      ).toBe(409);
      expect(
        objects(
          (await fixture.read(`/projects/${text(projects[0]?.id)}/tasks`))
            .tasks,
        ),
      ).toHaveLength(13);
      expect(
        (
          await fixture.harness.pool.query(
            'SELECT (SELECT count(*)::int FROM project_template_instances) plans,(SELECT count(*)::int FROM project_template_task_copies) copies,(SELECT count(*)::int FROM tasks) tasks',
          )
        ).rows,
      ).toEqual([{ plans: 1, copies: 13, tasks: 13 }]);
    });
    it('keeps captured v1 legacy-only until explicit revoke and regrant captures v2', async () => {
      // Historical captured grant is setup data; all qualification and upgrade are public commands.
      await fixture.harness.pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v1' WHERE bundle='company_project_template_user'",
      );
      const current = object(
        (await fixture.read('/access/current-actor')).activeCompany,
      );
      expect(current.projectTemplatePermissionSetVersion).toBe('v1');
      expect(current.projectTemplatePermissions).toEqual([
        'project.template.read',
        'project.template.instantiate',
      ]);
      expect(
        (await fixture.request(`/project-templates?templateKey=${pilotKey}`))
          .status,
      ).toBe(403);
      expect(
        (await fixture.request(`/project-templates/${pilotKey}/versions/1`))
          .status,
      ).toBe(403);
      expect(
        (
          await fixture.request('/projects/from-template', {
            method: 'POST',
            body: fixture.intent(),
          })
        ).status,
      ).toBe(403);
      await fixture.command(
        '/projects/from-template',
        fixture.intent({ templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE' }),
      );
      const unchanged = await fixture.grant(
        '/company-project-template-user-assignments',
      );
      expect(unchanged.permissionSetVersion).toBe('v1');
      expect(
        (
          await fixture.request(
            `/company-project-template-user-assignments/${fixture.membershipId}/${fixture.companyId}`,
            { method: 'DELETE' },
          )
        ).status,
      ).toBe(200);
      expect(
        (await fixture.grant('/company-project-template-user-assignments'))
          .permissionSetVersion,
      ).toBe('v2');
      const next = object(
        (await fixture.read('/access/current-actor')).activeCompany,
      );
      expect(next.projectTemplatePermissions).toEqual([
        'project.template.read',
        'project.template.instantiate',
        'project.template.pilot.read',
        'project.template.pilot.instantiate',
      ]);
      await fixture.command('/projects/from-template', fixture.intent());
    });
    it.each(['project-template-user', 'task-manager', 'project'])(
      'requires the independent %s authority and current scope before replay',
      async (bundle) => {
        const key = randomUUID(),
          body = fixture.intent(),
          project = await fixture.command('/projects/from-template', body, {
            key,
          });
        expect(
          (
            await fixture.request(
              `/company-${bundle}-assignments/${fixture.membershipId}/${fixture.companyId}`,
              { method: 'DELETE' },
            )
          ).status,
        ).toBe(200);
        expect(
          (
            await fixture.request('/projects/from-template', {
              method: 'POST',
              body,
              key,
            })
          ).status,
        ).toBe(403);
        expect(
          (await fixture.request(`/projects/${text(project.id)}/template`))
            .status,
        ).toBe(403);
        expect(
          (
            await fixture.request('/projects/from-template', {
              method: 'POST',
              body,
              companyId: randomUUID(),
            })
          ).status,
        ).toBe(403);
      },
    );
    it('rejects malformed or unsupported source intents and configuration cannot publish the pilot', async () => {
      for (const change of [
        { templateVersion: 0 },
        { templateVersion: 1.5 },
        { templateVersion: '1' },
        { templateKey: 'UNKNOWN' },
        { activities: [] },
        { title: ' ' },
      ])
        expect(
          (
            await fixture.request('/projects/from-template', {
              method: 'POST',
              body: fixture.intent(change),
            })
          ).status,
        ).toBe(400);
      expect(
        (
          await fixture.request('/projects/from-template', {
            method: 'POST',
            body: fixture.intent({ templateVersion: 2 }),
          })
        ).status,
      ).toBe(404);
      await fixture.grant(
        '/company-project-template-configuration-assignments',
      );
      expect(
        (
          await fixture.request(`/project-templates/${pilotKey}/versions`, {
            method: 'POST',
            body: { sourceVersion: 1, taskTitles: ['a', 'b', 'c', 'd'] },
          })
        ).status,
      ).toBe(400);
    });
    it('rolls back the Project, thirteen Tasks, source, mapping, receipt, events and Client fence when the final copy fails', async () => {
      const before = (
        await fixture.harness.pool.query(
          'SELECT (SELECT count(*)::int FROM projects) projects,(SELECT count(*)::int FROM tasks) tasks,(SELECT count(*)::int FROM activity_log_events) events,(SELECT version FROM client_accounts LIMIT 1) fence',
        )
      ).rows;
      await fixture.harness.pool.query(
        "CREATE FUNCTION fail_pilot_final_copy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.position=12 THEN RAISE EXCEPTION 'Synthetic final pilot copy failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_pilot_final_copy BEFORE INSERT ON project_template_task_copies FOR EACH ROW EXECUTE FUNCTION fail_pilot_final_copy()",
      );
      const key = randomUUID(),
        body = fixture.intent();
      try {
        expect(
          (
            await fixture.request('/projects/from-template', {
              method: 'POST',
              body,
              key,
            })
          ).status,
        ).toBe(500);
      } finally {
        await fixture.harness.pool.query(
          'DROP TRIGGER fail_pilot_final_copy ON project_template_task_copies; DROP FUNCTION fail_pilot_final_copy()',
        );
      }
      expect(
        (
          await fixture.harness.pool.query(
            'SELECT (SELECT count(*)::int FROM projects) projects,(SELECT count(*)::int FROM tasks) tasks,(SELECT count(*)::int FROM activity_log_events) events,(SELECT version FROM client_accounts LIMIT 1) fence',
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await fixture.harness.pool.query(
            'SELECT (SELECT count(*)::int FROM project_template_instances) plans,(SELECT count(*)::int FROM project_template_task_copies) copies',
          )
        ).rows,
      ).toEqual([{ plans: 0, copies: 0 }]);
      const saved = await fixture.command('/projects/from-template', body, {
        key,
      });
      expect(
        objects(
          (await fixture.read(`/projects/${text(saved.id)}/tasks`)).tasks,
        ),
      ).toHaveLength(13);
    });

    it('allows a source-only reader without Task, Client or creation rights and denies copied-plan access until those independent grants exist', async () => {
      const colleague = 'pilot-colleague',
        member = text(
          (
            await fixture.read('/access/current-actor', {
              subject: colleague,
              companyId: '',
            })
          ).workspaceMembershipId,
        );
      for (const path of [
        '/company-project-assignments',
        '/company-project-template-user-assignments',
      ])
        await fixture.grant(path, member);
      expect(
        (
          await fixture.request(`/project-templates?templateKey=${pilotKey}`, {
            subject: colleague,
          })
        ).status,
      ).toBe(200);
      const project = await fixture.command(
        '/projects/from-template',
        fixture.intent(),
      );
      expect(
        (
          await fixture.request(`/projects/${text(project.id)}/template`, {
            subject: colleague,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fixture.request('/projects/from-template', {
            subject: colleague,
            method: 'POST',
            body: fixture.intent(),
          })
        ).status,
      ).toBe(403);
      await fixture.grant('/company-task-manager-assignments', member);
      expect(
        (
          await fixture.request(`/projects/${text(project.id)}/template`, {
            subject: colleague,
          })
        ).status,
      ).toBe(403);
      await fixture.grant('/company-director-client-assignments', member);
      expect(
        (
          await fixture.request(`/projects/${text(project.id)}/template`, {
            subject: colleague,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await fixture.request(
            `/company-director-client-assignments/${member}/${fixture.companyId}`,
            { method: 'DELETE' },
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await fixture.request(`/projects/${text(project.id)}/template`, {
            subject: colleague,
          })
        ).status,
      ).toBe(403);
      // Exact source remains independent of the copied Project's Client boundary.
      expect(
        (
          await fixture.request(`/project-templates/${pilotKey}/versions/1`, {
            subject: colleague,
          })
        ).status,
      ).toBe(200);
    });
    it('isolates another authorized Company and authenticated Workspace without leaking copied identities or accepting foreign Clients', async () => {
      const key = randomUUID(),
        body = fixture.intent(),
        project = await fixture.command('/projects/from-template', body, {
          key,
        });
      const other = text(
        (
          await fixture.command('/companies', {
            displayName: 'Other Company DEMO',
          })
        ).id,
      );
      for (const path of [
        '/company-director-client-assignments',
        '/company-project-assignments',
        '/company-task-manager-assignments',
        '/company-project-template-user-assignments',
      ])
        await fixture.command(path, {
          companyId: other,
          workspaceMembershipId: fixture.membershipId,
        });
      expect(
        (
          await fixture.request(`/projects/${text(project.id)}/template`, {
            companyId: other,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await fixture.request('/projects/from-template', {
            companyId: other,
            method: 'POST',
            body,
            key,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.request('/projects/from-template', {
            companyId: other,
            method: 'POST',
            body,
          })
        ).status,
      ).toBe(404);
      const foreignWorkspace = randomUUID();
      expect(
        (
          await fixture.request(`/projects/${text(project.id)}/template`, {
            workspaceId: foreignWorkspace,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fixture.request(`/project-templates?templateKey=${pilotKey}`, {
            workspaceId: foreignWorkspace,
          })
        ).status,
      ).toBe(403);
    });
    it('retains the exact historical copy and receipt after terminal closure without another event or Client fence change', async () => {
      const key = randomUUID(),
        body = fixture.intent(),
        project = await fixture.command('/projects/from-template', body, {
          key,
        }),
        projectId = text(project.id),
        path = `/projects/${projectId}/template`,
        source = await fixture.read(path);
      for (const task of objects(
        (await fixture.read(`/projects/${projectId}/tasks`)).tasks,
      ))
        await fixture.command(`/tasks/${text(task.id)}/complete`, {
          expectedVersion: 1,
        });
      await fixture.grant('/company-project-approver-assignments');
      const closed = await fixture.request(
        `/projects/${projectId}/lifecycle-transitions`,
        {
          method: 'POST',
          body: {
            action: 'cancel',
            expectedLifecycleRevision: 0,
            reason: 'Pilot no longer needed DEMO',
          },
        },
      );
      expect(closed.status).toBe(200);
      const before = (
        await fixture.harness.pool.query(
          'SELECT (SELECT count(*)::int FROM project_creation_events) projects,(SELECT count(*)::int FROM task_events) tasks,(SELECT version FROM client_accounts WHERE id=$1) fence',
          [fixture.clientId],
        )
      ).rows;
      expect(
        await fixture.command('/projects/from-template', body, { key }),
      ).toMatchObject({ id: projectId, status: 'cancelled' });
      expect(await fixture.read(path)).toEqual(source);
      expect(
        (
          await fixture.harness.pool.query(
            'SELECT (SELECT count(*)::int FROM project_creation_events) projects,(SELECT count(*)::int FROM task_events) tasks,(SELECT version FROM client_accounts WHERE id=$1) fence',
            [fixture.clientId],
          )
        ).rows,
      ).toEqual(before);
      const first = objects(object(source.template).activities)[0];
      expect(
        (
          await fixture.request(`/tasks/${text(first?.taskId)}/reopen`, {
            method: 'POST',
            body: { expectedVersion: 2 },
          })
        ).status,
      ).toBe(409);
    });

    it.each([
      ['revoke', 'denial_first'],
      ['revoke', 'create_first'],
      ['suspend', 'denial_first'],
      ['suspend', 'create_first'],
    ])(
      'serializes thirteen-copy creation against %s with %s',
      async (kind, order) => {
        const subject = 'pilot-colleague',
          member = text(
            (
              await fixture.read('/access/current-actor', {
                subject,
                companyId: '',
              })
            ).workspaceMembershipId,
          );
        for (const path of [
          '/company-director-client-assignments',
          '/company-project-assignments',
          '/company-task-manager-assignments',
          '/company-project-template-user-assignments',
        ])
          await fixture.grant(path, member);
        const create = () =>
          fixture.request('/projects/from-template', {
            method: 'POST',
            body: fixture.intent(),
            subject,
          });
        const deny = () =>
          kind === 'revoke'
            ? fixture.request(
                `/company-project-template-user-assignments/${member}/${fixture.companyId}`,
                { method: 'DELETE' },
              )
            : fixture.request('/workspace-membership-suspensions', {
                method: 'POST',
                body: { workspaceMembershipId: member },
              });
        async function waitForQuery(pattern: string) {
          const deadline = Date.now() + 2000;
          do {
            const rows = await fixture.harness.pool.query<{ count: string }>(
              'SELECT count(DISTINCT activity.pid)::text count FROM pg_locks waiting JOIN pg_stat_activity activity ON activity.pid=waiting.pid WHERE NOT waiting.granted AND activity.datname=current_database() AND activity.query ILIKE $1',
              [pattern],
            );
            if (Number(rows.rows[0]?.count) >= 1) return;
            await new Promise<void>((resolve) => setImmediate(resolve));
          } while (Date.now() < deadline);
          throw new Error(`Missing observed waiter ${pattern}`);
        }
        const barrier = await fixture.harness.pool.connect();
        let first: Promise<Response> | undefined,
          second: Promise<Response> | undefined;
        try {
          await barrier.query('BEGIN');
          if (order === 'denial_first') {
            if (kind === 'revoke')
              await barrier.query(
                "SELECT id FROM company_role_assignments WHERE workspace_membership_id=$1 AND bundle='company_project_template_user' FOR SHARE",
                [member],
              );
            else
              await barrier.query(
                'LOCK TABLE workspace_membership_suspension_commands IN SHARE MODE',
              );
            first = deny();
            await waitForQuery(
              kind === 'revoke'
                ? '%update "company_role_assignments"%'
                : '%insert into "workspace_membership_suspension_commands"%',
            );
            second = create();
            await waitForQuery('%update "internal_users"%');
          } else {
            await barrier.query(
              'SELECT id FROM client_accounts WHERE id=$1 FOR SHARE',
              [fixture.clientId],
            );
            first = create();
            await waitForQuery('%from "client_accounts"%for update%');
            second = deny();
            await waitForQuery(
              kind === 'revoke'
                ? '%update "company_role_assignments"%'
                : '%from "workspaces"%for update%',
            );
          }
          await barrier.query('COMMIT');
          expect([(await first).status, (await second).status]).toEqual(
            order === 'denial_first'
              ? [kind === 'revoke' ? 200 : 201, 403]
              : [201, kind === 'revoke' ? 200 : 201],
          );
        } finally {
          await barrier.query('ROLLBACK');
          barrier.release();
          await first?.catch(() => undefined);
          await second?.catch(() => undefined);
        }
        expect((await create()).status).toBe(403);
        const expected = order === 'create_first' ? 13 : 0;
        expect(
          (
            await fixture.harness.pool.query(
              'SELECT (SELECT count(*)::int FROM tasks) tasks,(SELECT count(*)::int FROM project_template_task_copies) copies,(SELECT count(*)::int FROM task_events) events,(SELECT count(*)::int FROM project_template_instances) plans,(SELECT count(*)::int FROM project_creation_events) projects',
            )
          ).rows,
        ).toEqual([
          {
            tasks: expected,
            copies: expected,
            events: expected,
            plans: expected ? 1 : 0,
            projects: expected ? 1 : 0,
          },
        ]);
      },
    );

    it('keeps the primary source and copy independent of later legacy title publication', async () => {
      const project = await fixture.command(
          '/projects/from-template',
          fixture.intent(),
        ),
        path = `/projects/${text(project.id)}/template`,
        copy = await fixture.read(path),
        source = await fixture.read(
          `/project-templates?templateKey=${pilotKey}`,
        );
      await fixture.grant(
        '/company-project-template-configuration-assignments',
      );
      const receipt = await fixture.command(
        '/project-templates/CONSULTING_PREPARATION_ILLUSTRATIVE/versions',
        {
          sourceVersion: 1,
          expectedHeadVersion: 1,
          taskTitles: {
            clarify_request: 'Independent successor title DEMO',
            confirm_scope: 'Confirmer le périmètre',
            collect_questionnaire: 'Recueillir le questionnaire',
            prepare_plan: 'Préparer le plan',
          },
        },
      );
      expect(receipt.version).toBe(2);
      expect(await fixture.read(path)).toEqual(copy);
      expect(
        await fixture.read(`/project-templates?templateKey=${pilotKey}`),
      ).toEqual(source);
    });
    it('confirms a historical pilot after original Client supersession while refusing new creation against that original identity', async () => {
      const key = randomUUID(),
        body = fixture.intent(),
        project = await fixture.command('/projects/from-template', body, {
          key,
        }),
        path = `/projects/${text(project.id)}/template`,
        copy = await fixture.read(path);
      const second = text(
        (
          await fixture.command('/clients', {
            displayName: 'Canonical Client DEMO',
          })
        ).id,
      );
      // A historical duplicate is fixture input; governed reconciliation uses REST.
      await fixture.harness.pool.query(
        "UPDATE client_accounts SET tax_id='PILOT-LEGACY-DEMO' WHERE id=ANY($1::uuid[])",
        [[fixture.clientId, second]],
      );
      const review = await fixture.command(
        `/clients/${fixture.clientId}/union-reviews`,
        {},
      );
      expect(review.outcome).toBe('comparison');
      await fixture.command(
        `/client-union-reviews/${text(review.reviewReference)}/confirm`,
        {
          canonicalClientId: second,
          fields: {
            displayName: fixture.clientId,
            taxId: fixture.clientId,
            address: fixture.clientId,
            telephone: fixture.clientId,
            generalEmail: fixture.clientId,
            businessActivity: fixture.clientId,
          },
          companyIds: [fixture.companyId],
          reviewedDifferences: true,
          reason: 'Historical duplicate DEMO',
        },
      );
      const before = (
        await fixture.harness.pool.query(
          'SELECT (SELECT count(*)::int FROM tasks) tasks,(SELECT count(*)::int FROM task_events) events,(SELECT version FROM client_accounts WHERE id=$1) fence',
          [fixture.clientId],
        )
      ).rows;
      expect(
        await fixture.command('/projects/from-template', body, { key }),
      ).toMatchObject({ id: project.id });
      expect(await fixture.read(path)).toEqual(copy);
      expect(
        (
          await fixture.request('/projects/from-template', {
            method: 'POST',
            body,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await fixture.harness.pool.query(
            'SELECT (SELECT count(*)::int FROM tasks) tasks,(SELECT count(*)::int FROM task_events) events,(SELECT version FROM client_accounts WHERE id=$1) fence',
            [fixture.clientId],
          )
        ).rows,
      ).toEqual(before);
    });
    it('fails closed for null and future captured Template versions even if historical storage is corrupt', async () => {
      const definition = (
        await fixture.harness.pool.query<{ definition: string }>(
          "SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
        )
      ).rows[0]?.definition;
      if (!definition) throw new Error('Missing version constraint');
      await fixture.harness.pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        for (const version of [null, 'v3']) {
          await fixture.harness.pool.query(
            "UPDATE company_role_assignments SET permission_set_version=$1 WHERE bundle='company_project_template_user'",
            [version],
          );
          expect(
            (
              await fixture.request(
                `/project-templates?templateKey=${pilotKey}`,
              )
            ).status,
          ).toBe(403);
          expect(
            (
              await fixture.request('/projects/from-template', {
                method: 'POST',
                body: fixture.intent(),
              })
            ).status,
          ).toBe(403);
          const actor = object(
            (await fixture.read('/access/current-actor')).activeCompany,
          );
          expect(actor.projectTemplatePermissions).toBeUndefined();
        }
      } finally {
        await fixture.harness.pool.query(
          "UPDATE company_role_assignments SET permission_set_version='v2' WHERE bundle='company_project_template_user'",
        );
        await fixture.harness.pool.query(
          `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${definition}`,
        );
      }
    });
  },
);
