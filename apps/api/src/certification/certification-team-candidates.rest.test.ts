import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  CERTIFICATION_AUDITOR,
  CERTIFICATION_OWNER,
  CERTIFICATION_READER,
  openCertificationFixture,
  record,
} from './certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000001439';
const additionalSubjects = Array.from(
  { length: 26 },
  (_, index) => `candidate-1439-${index}`,
);
(databaseUrl ? describe : describe.skip)(
  'Certification first-team auditor candidates',
  { timeout: 60_000 },
  () => {
    let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openCertificationFixture({
        databaseUrl,
        namePrefix: 'certification1439',
        workspaceId,
        additionalSubjects,
        synchronizeIdentityProfile: true,
      });
    }, 240_000);
    afterAll(async () => {
      await fixture?.close();
    });

    it('discovers a previously uninvolved authorized auditor without exposing a staff directory or changing the Case', async () => {
      const caseId = await fixture.agreedCase();
      const base = `/certification-cases/${caseId}`;
      const history = await fixture.call(
        CERTIFICATION_READER,
        `${base}/timeline`,
      );
      const before = await history.json();
      const reply = await fixture.call(
        CERTIFICATION_OWNER,
        `${base}/team-candidates`,
      );
      expect(reply.status).toBe(200);
      expect(reply.headers.get('cache-control')).toBe('private, no-store');
      const body = record(await reply.json());
      expect(body).toMatchObject({
        caseId,
        nextCursor: null,
        items: [
          { workspaceMembershipId: fixture.membership(CERTIFICATION_AUDITOR) },
        ],
      });
      if (!Array.isArray(body.items) || body.items.length !== 1)
        throw new Error('Expected one eligible auditor.');
      expect(Object.keys(record(body.items[0])).sort()).toEqual([
        'displayLabel',
        'workspaceMembershipId',
      ]);
      const current = await fixture.call(CERTIFICATION_READER, base);
      expect(record(await current.json())).toMatchObject({
        revision: 6,
        team: null,
      });
      const after = await fixture.call(
        CERTIFICATION_READER,
        `${base}/timeline`,
      );
      expect(await after.json()).toEqual(before);
    });

    it('requires current manager authority and gives concealed and absent Cases identical denials across Company and Workspace selections', async () => {
      const caseId = await fixture.agreedCase();
      const path = `/certification-cases/${caseId}/team-candidates`;
      const missing = `/certification-cases/${randomUUID()}/team-candidates`;
      for (const subject of [CERTIFICATION_READER, CERTIFICATION_AUDITOR]) {
        const hidden = await fixture.call(subject, path);
        const absent = await fixture.call(subject, missing);
        expect(hidden.status).toBe(403);
        expect(absent.status).toBe(403);
        expect(await hidden.json()).toEqual(await absent.json());
      }
      const company = await fixture.created(
        await fixture.call(CERTIFICATION_OWNER, '/companies', {
          method: 'POST',
          company: null,
          body: { displayName: 'Other Fictional Certification Company' },
        }),
      );
      const companyId = company.id;
      if (typeof companyId !== 'string')
        throw new Error('Expected Company ID.');
      for (const bundle of [
        'project',
        'director-client',
        'certification-reader',
        'certification-programme-manager',
      ]) {
        await fixture.created(
          await fixture.call(
            CERTIFICATION_OWNER,
            `/company-${bundle}-assignments`,
            {
              method: 'POST',
              company: null,
              body: {
                companyId,
                workspaceMembershipId: fixture.membership(CERTIFICATION_OWNER),
              },
            },
          ),
        );
      }
      const hidden = await fixture.call(CERTIFICATION_OWNER, path, {
        company: companyId,
      });
      const absent = await fixture.call(CERTIFICATION_OWNER, missing, {
        company: companyId,
      });
      expect(hidden.status).toBe(404);
      expect(absent.status).toBe(404);
      expect(await hidden.json()).toEqual(await absent.json());
      const workspace = randomUUID();
      const foreignWorkspace = await fixture.call(CERTIFICATION_OWNER, path, {
        workspace,
      });
      const missingWorkspace = await fixture.call(
        CERTIFICATION_OWNER,
        missing,
        { workspace },
      );
      expect(foreignWorkspace.status).toBe(403);
      expect(await foreignWorkspace.json()).toEqual(
        await missingWorkspace.json(),
      );
    });

    it('revalidates exact draft-linked auditors outside a filtered result and conceals ineligible identities', async () => {
      const caseId = await fixture.agreedCase();
      const path = `/certification-cases/${caseId}/team-candidates`;
      const auditor = fixture.membership(CERTIFICATION_AUDITOR);
      const linked = new URLSearchParams({
        search: 'Unmatched synthetic label',
        linked: [
          auditor,
          fixture.membership(CERTIFICATION_READER),
          randomUUID(),
        ].join(','),
      });
      const visible = await fixture.call(
        CERTIFICATION_OWNER,
        `${path}?${linked}`,
      );
      expect(visible.status).toBe(200);
      const result = record(await visible.json());
      expect(result).toMatchObject({
        caseId,
        items: [],
        nextCursor: null,
        draftLinks: [{ workspaceMembershipId: auditor }],
      });
      expect(
        (await fixture.call(CERTIFICATION_READER, `${path}?${linked}`)).status,
      ).toBe(403);
      const oversized = new URLSearchParams({
        linked: Array.from({ length: 11 }, () => randomUUID()).join(','),
      });
      expect(
        (await fixture.call(CERTIFICATION_OWNER, `${path}?${oversized}`))
          .status,
      ).toBe(400);
      expect(
        (await fixture.call(CERTIFICATION_OWNER, `${path}?linked=invalid`))
          .status,
      ).toBe(400);
    });

    it('removes revoked auditors and missing Project prerequisites and refuses the manager after its grant is revoked', async () => {
      const caseId = await fixture.agreedCase();
      const path = `/certification-cases/${caseId}/team-candidates`;
      for (const bundle of ['certification-auditor', 'project']) {
        const response = await fixture.call(
          CERTIFICATION_OWNER,
          `/company-${bundle}-assignments/${fixture.membership(CERTIFICATION_AUDITOR)}/${fixture.companyId}`,
          { method: 'DELETE', company: null },
        );
        expect(response.status).toBe(200);
        const linked = new URLSearchParams({
          linked: fixture.membership(CERTIFICATION_AUDITOR),
        });
        const read = await fixture.call(
          CERTIFICATION_OWNER,
          `${path}?${linked}`,
        );
        expect(read.status).toBe(200);
        expect(record(await read.json())).toMatchObject({
          items: [],
          draftLinks: [],
        });
        await fixture.grant(
          CERTIFICATION_AUDITOR,
          `/company-${bundle}-assignments`,
        );
        const restored = await fixture.call(CERTIFICATION_OWNER, path);
        expect(record(await restored.json()).items).toHaveLength(1);
      }
      const revoked = await fixture.call(
        CERTIFICATION_OWNER,
        `/company-certification-programme-manager-assignments/${fixture.membership(CERTIFICATION_OWNER)}/${fixture.companyId}`,
        { method: 'DELETE', company: null },
      );
      expect(revoked.status).toBe(200);
      try {
        expect((await fixture.call(CERTIFICATION_OWNER, path)).status).toBe(
          403,
        );
      } finally {
        await fixture.grant(
          CERTIFICATION_OWNER,
          '/company-certification-programme-manager-assignments',
        );
      }
    });

    it('pages more than twenty-five eligible auditors without duplicates and treats search text literally', async () => {
      const caseId = await fixture.agreedCase();
      const path = `/certification-cases/${caseId}/team-candidates`;
      for (const subject of additionalSubjects) {
        for (const bundle of [
          'project',
          'director-client',
          'certification-reader',
          'certification-auditor',
        ])
          await fixture.grant(subject, `/company-${bundle}-assignments`);
      }
      const first = await fixture.call(CERTIFICATION_OWNER, path);
      expect(first.status).toBe(200);
      const page = record(await first.json());
      if (!Array.isArray(page.items) || typeof page.nextCursor !== 'string')
        throw new Error('Expected candidate continuation.');
      expect(page.items).toHaveLength(25);
      const next = await fixture.call(
        CERTIFICATION_OWNER,
        `${path}?after=${page.nextCursor}`,
      );
      expect(next.status).toBe(200);
      const end = record(await next.json());
      expect(end.nextCursor).toBeNull();
      if (!Array.isArray(end.items)) throw new Error('Expected second page.');
      expect(end.items).toHaveLength(2);
      const ids = [...page.items, ...end.items].map(
        (item) => record(item).workspaceMembershipId,
      );
      expect(new Set(ids).size).toBe(27);
      const searched = await fixture.call(
        CERTIFICATION_OWNER,
        `${path}?search=candidate-1439-25`,
      );
      expect(record(await searched.json()).items).toMatchObject([
        {
          workspaceMembershipId: fixture.membership(
            additionalSubjects[25] ?? '',
          ),
        },
      ]);
      for (const search of ['%', '_', 'Несуществующий Șț']) {
        const none = await fixture.call(
          CERTIFICATION_OWNER,
          `${path}?search=${encodeURIComponent(search)}`,
        );
        expect(none.status).toBe(200);
        expect(record(await none.json()).items).toEqual([]);
      }
      for (const query of [
        'after=not-a-uuid',
        'search=a&search=b',
        'unknown=true',
        `search=${'a'.repeat(101)}`,
      ])
        expect(
          (await fixture.call(CERTIFICATION_OWNER, `${path}?${query}`)).status,
        ).toBe(400);
    });

    it('keeps candidate reads available when an independent Actor profile refresh commits during live authority revalidation', async () => {
      const caseId = await fixture.agreedCase();
      await fixture.grant(
        CERTIFICATION_READER,
        '/company-certification-programme-manager-assignments',
      );
      const holder = await fixture.databasePool.connect();
      await holder.query('BEGIN');
      await holder.query(
        'SELECT id FROM company_role_assignments WHERE workspace_id=$1 AND company_id=$2 AND workspace_membership_id=$3 AND revoked_at IS NULL FOR UPDATE',
        [
          workspaceId,
          fixture.companyId,
          fixture.membership(CERTIFICATION_READER),
        ],
      );
      const pending = fixture.call(
        CERTIFICATION_READER,
        `/certification-cases/${caseId}/team-candidates`,
      );
      let released = false;
      try {
        // Pin the real live-grant query before its actor rows are share-locked.
        // A separate public Actor read can then commit its identity refresh.
        const deadline = Date.now() + 5000;
        let blocked = false;
        while (Date.now() < deadline) {
          const waiting = await fixture.databasePool.query<{
            waiting: boolean;
          }>(
            "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query ILIKE '%company_role_assignments%' AND query ILIKE '%for share%') AS waiting",
          );
          if (waiting.rows[0]?.waiting) {
            blocked = true;
            break;
          }
          await delay(10);
        }
        expect(blocked).toBe(true);
        const profile = await fixture.call(
          CERTIFICATION_READER,
          '/access/current-actor',
          { company: null },
        );
        expect(profile.status).toBe(200);
        await holder.query('COMMIT');
        released = true;
        const response = await pending;
        expect(response.status).toBe(200);
        expect(record(await response.json()).caseId).toBe(caseId);
      } finally {
        if (!released) await holder.query('ROLLBACK');
        holder.release();
        await pending;
        await fixture.call(
          CERTIFICATION_OWNER,
          `/company-certification-programme-manager-assignments/${fixture.membership(CERTIFICATION_READER)}/${fixture.companyId}`,
          { method: 'DELETE', company: null },
        );
      }
    });

    it('conceals a suspended membership from candidate searches without exposing an exclusion reason', async () => {
      const subject = additionalSubjects[0];
      if (!subject) throw new Error('Expected extra auditor.');
      const caseId = await fixture.agreedCase();
      const path = `/certification-cases/${caseId}/team-candidates?search=${subject}`;
      const before = await fixture.call(CERTIFICATION_OWNER, path);
      expect(record(await before.json()).items).toHaveLength(1);
      const suspended = await fixture.call(
        CERTIFICATION_OWNER,
        '/workspace-membership-suspensions',
        {
          method: 'POST',
          company: null,
          body: { workspaceMembershipId: fixture.membership(subject) },
        },
      );
      expect(suspended.status).toBe(201);
      const after = await fixture.call(CERTIFICATION_OWNER, path);
      expect(after.status).toBe(200);
      expect(record(await after.json())).toEqual({
        caseId,
        items: [],
        nextCursor: null,
      });
    });
  },
);
