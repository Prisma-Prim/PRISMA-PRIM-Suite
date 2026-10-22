import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { format } from 'node:util';
import type { PoolClient } from 'pg';
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
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000733';
const OWNER = {
  'x-test-external-provider': 'deterministic-test',
  'x-test-external-subject': 'ideas-owner',
  'x-test-display-name': 'Synthetic Ideas Owner',
  'x-test-email': 'ideas-owner@example.test',
};

withPostgres('Company Ideas public REST boundary', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'ideas733',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock: { now: () => new Date('2026-10-20T08:00:00.000Z') },
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'ideas-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Ideas Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          ['ideas-recorder', 'ideas-reviewer', 'ideas-second-reviewer'].map(
            (subject) => ({
              provider: 'deterministic-test',
              subject,
              workspaceId: WORKSPACE_ID,
            }),
          ),
        ),
      },
    });
  });

  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it('denies an existing Company administrator without the independent Ideas Reader grant', async () => {
    const owner = await fetch(`${harness.origin}/api/access/current-actor`, {
      headers: OWNER,
    });
    expect(owner.status).toBe(200);
    const company = await fetch(`${harness.origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...OWNER,
        'content-type': 'application/json',
        'idempotency-key': 'ideas-company',
      },
      body: JSON.stringify({ displayName: 'Synthetic Ideas Company' }),
    });
    expect(company.status).toBe(201);
    const body: unknown = await company.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('id' in body) ||
      typeof body.id !== 'string'
    )
      throw new Error('Invalid Company response.');
    const response = await fetch(`${harness.origin}/api/ideas`, {
      headers: { ...OWNER, 'x-company-context-id': body.id },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('ideas');
  });
  it('explicitly grants Reader and Recorder, saves literal original text and reopens it after a fresh read', async () => {
    const actorResponse = await fetch(
      `${harness.origin}/api/access/current-actor`,
      { headers: OWNER },
    );
    const actor = object(await actorResponse.json());
    const companyResponse = await fetch(`${harness.origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...OWNER,
        'content-type': 'application/json',
        'idempotency-key': 'capture-company',
      },
      body: JSON.stringify({ displayName: 'Synthetic Capture Company' }),
    });
    const companyId = object(await companyResponse.json()).id;
    if (typeof companyId !== 'string') throw new Error('Invalid Company id.');
    for (const role of ['reader', 'recorder']) {
      const assignment = await fetch(
        `${harness.origin}/api/company-ideas-${role}-assignments`,
        {
          method: 'POST',
          headers: {
            ...OWNER,
            'content-type': 'application/json',
            'idempotency-key': `capture-${role}`,
          },
          body: JSON.stringify({
            companyId,
            workspaceMembershipId: actor.workspaceMembershipId,
          }),
        },
      );
      expect(assignment.status).toBe(201);
    }
    const headers = {
      ...OWNER,
      'content-type': 'application/json',
      'x-company-context-id': companyId,
    };
    const original = {
      description:
        '  Reduce repeated questionnaire entry\nÎmbunătățire — Идея  ',
      origin: ' Internal suggestion  ',
    };
    const submission = await fetch(`${harness.origin}/api/ideas`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': 'literal-submission' },
      body: JSON.stringify(original),
    });
    expect(submission.status).toBe(201);
    const saved = object(await submission.json());
    expect(saved).toMatchObject({
      ...original,
      revision: 1,
      disposition: 'new',
      companyId,
    });
    const reopened = await fetch(
      `${harness.origin}/api/ideas/${String(saved.id)}`,
      { headers },
    );
    expect(reopened.status).toBe(200);
    expect(await reopened.json()).toEqual(saved);
  });
  it('a separately granted reviewer appends defer and reject reasons while preserving the original', async () => {
    const fixture = await prepared();
    const created = await saved(
      await request('POST', '/ideas', {
        body: {
          description: 'Reduce repeated questionnaire entry',
          origin: 'Internal suggestion',
        },
        companyId: fixture.companyId,
        subject: 'ideas-recorder',
        key: 'review-original',
      }),
    );
    const ideaId = String(created.id);
    const deferred = await request('POST', `/ideas/${ideaId}/dispositions`, {
      body: {
        kind: 'deferred',
        expectedRevision: 1,
        reason: 'Review after the pilot',
        reconsiderationDate: '2026-01-31',
      },
      companyId: fixture.companyId,
      subject: 'ideas-reviewer',
      key: 'defer',
    });
    expect(deferred.status).toBe(201);
    expect(object(await deferred.json())).toMatchObject({
      idea: {
        id: ideaId,
        revision: 2,
        disposition: 'deferred',
        description: 'Reduce repeated questionnaire entry',
      },
      entry: {
        kind: 'deferred',
        precedingRevision: 1,
        revision: 2,
        reason: 'Review after the pilot',
        reconsiderationDate: '2026-01-31',
        recordedBy: { workspaceMembershipId: fixture.reviewerMembershipId },
      },
    });
    await saved(
      await request('POST', `/ideas/${ideaId}/dispositions`, {
        body: {
          kind: 'rejected',
          expectedRevision: 2,
          reason: 'Existing workflow already covers this proposal',
        },
        companyId: fixture.companyId,
        subject: 'ideas-reviewer',
        key: 'reject',
      }),
    );
    const history = await request('GET', `/ideas/${ideaId}/dispositions`, {
      companyId: fixture.companyId,
      subject: 'ideas-recorder',
    });
    expect(history.status).toBe(200);
    expect(object(await history.json())).toMatchObject({
      total: 2,
      nextCursor: null,
      entries: [
        {
          kind: 'rejected',
          revision: 3,
          reason: 'Existing workflow already covers this proposal',
        },
        { kind: 'deferred', revision: 2, reason: 'Review after the pilot' },
      ],
    });
  });

  it('replays exact committed results after later reviews and distinguishes changed keys from stale new intent', async () => {
    const fixture = await prepared();
    const original = {
      description: 'Literal retry intent',
      origin: 'Synthetic source',
    };
    const scope = {
      companyId: fixture.companyId,
      subject: 'ideas-recorder',
      key: 'record-replay',
      body: original,
    };
    const created = await saved(await request('POST', '/ideas', scope));
    expect(await saved(await request('POST', '/ideas', scope))).toEqual(
      created,
    );
    const ideaId = String(created.id);
    const review = {
      companyId: fixture.companyId,
      subject: 'ideas-reviewer',
      key: 'review-replay',
      body: { kind: 'deferred', reason: 'First reason', expectedRevision: 1 },
    };
    const deferred = await saved(
      await request('POST', `/ideas/${ideaId}/dispositions`, review),
    );
    await saved(
      await request('POST', `/ideas/${ideaId}/dispositions`, {
        ...review,
        key: 'later-review',
        body: { kind: 'rejected', reason: 'Later reason', expectedRevision: 2 },
      }),
    );
    expect(
      await saved(
        await request('POST', `/ideas/${ideaId}/dispositions`, review),
      ),
    ).toEqual(deferred);
    expect(await saved(await request('POST', '/ideas', scope))).toEqual(
      created,
    );
    const changed = await request('POST', `/ideas/${ideaId}/dispositions`, {
      ...review,
      body: { ...review.body, reason: 'Changed intent' },
    });
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    const stale = await request('POST', `/ideas/${ideaId}/dispositions`, {
      ...review,
      key: 'fresh-stale-intent',
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: 'STALE_VERSION' });
    const history = await request('GET', `/ideas/${ideaId}/dispositions`, {
      companyId: fixture.companyId,
      subject: 'ideas-recorder',
    });
    expect(object(await history.json())).toMatchObject({
      total: 2,
      entries: [{ revision: 3 }, { revision: 2 }],
    });
    const revoked = await request(
      'DELETE',
      `/company-ideas-reader-assignments/${String(fixture.reviewerMembershipId)}/${fixture.companyId}`,
    );
    expect(revoked.status).toBe(200);
    const deniedReplay = await request(
      'POST',
      `/ideas/${ideaId}/dispositions`,
      review,
    );
    expect(deniedReplay.status).toBe(403);
    expect(await deniedReplay.json()).not.toHaveProperty('idea');
  });

  it('rejects a reconsideration-date field on rejection without changing the saved aggregate', async () => {
    const fixture = await prepared();
    const created = await saved(
      await request('POST', '/ideas', {
        companyId: fixture.companyId,
        subject: 'ideas-recorder',
        body: {
          description: 'Preserved input validation',
          origin: 'Synthetic source',
        },
      }),
    );
    const response = await request(
      'POST',
      `/ideas/${String(created.id)}/dispositions`,
      {
        companyId: fixture.companyId,
        subject: 'ideas-reviewer',
        body: {
          expectedRevision: 1,
          kind: 'rejected',
          reason: 'A deliberate rejection',
          reconsiderationDate: null,
        },
      },
    );
    expect(response.status).toBe(400);
    const reopened = await request('GET', `/ideas/${String(created.id)}`, {
      companyId: fixture.companyId,
      subject: 'ideas-recorder',
    });
    expect(await reopened.json()).toEqual(created);
  });

  it('rolls back business, receipt and restricted event on receipt or response-construction failure', async () => {
    const fixture = await prepared();
    await harness.pool
      .query(`CREATE FUNCTION synthetic_ideas_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.idempotency_key = 'receipt-failure' THEN RAISE EXCEPTION 'Synthetic receipt failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER synthetic_ideas_receipt_failure BEFORE INSERT ON idea_receipts FOR EACH ROW EXECUTE FUNCTION synthetic_ideas_receipt_failure();
      CREATE FUNCTION synthetic_ideas_response_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.origin = 'Synthetic response failure' THEN NEW.actor_display_name := ''; END IF; RETURN NEW; END $$;
      CREATE TRIGGER synthetic_ideas_response_failure BEFORE INSERT ON ideas FOR EACH ROW EXECUTE FUNCTION synthetic_ideas_response_failure();`);
    try {
      for (const [key, origin] of [
        ['receipt-failure', 'Synthetic source'],
        ['response-failure', 'Synthetic response failure'],
      ]) {
        const response = await request('POST', '/ideas', {
          companyId: fixture.companyId,
          subject: 'ideas-recorder',
          key,
          body: { description: 'Confidential synthetic rollback text', origin },
        });
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain(
          'Confidential synthetic rollback text',
        );
        const state = await harness.pool.query<{
          ideas: string;
          receipts: string;
          events: string;
          dispositions: string;
        }>(
          `SELECT
          (SELECT count(*) FROM ideas WHERE company_id = $1) AS ideas,
          (SELECT count(*) FROM idea_receipts WHERE company_id = $1) AS receipts,
          (SELECT count(*) FROM idea_events WHERE company_id = $1) AS events,
          (SELECT count(*) FROM idea_dispositions WHERE company_id = $1) AS dispositions`,
          [fixture.companyId],
        );
        expect(state.rows).toEqual([
          { ideas: '0', receipts: '0', events: '0', dispositions: '0' },
        ]);
      }
    } finally {
      await harness.pool.query(
        'DROP TRIGGER synthetic_ideas_receipt_failure ON idea_receipts; DROP FUNCTION synthetic_ideas_receipt_failure(); DROP TRIGGER synthetic_ideas_response_failure ON ideas; DROP FUNCTION synthetic_ideas_response_failure();',
      );
    }
  });

  it('rolls back the head revision, history, receipt and event when disposition receipt or response construction fails', async () => {
    const fixture = await prepared();
    const scope = { companyId: fixture.companyId, subject: 'ideas-recorder' };
    const created = await saved(
      await request('POST', '/ideas', {
        ...scope,
        body: {
          description: 'Original before review rollback',
          origin: 'Synthetic source',
        },
      }),
    );
    await harness.pool
      .query(`CREATE FUNCTION synthetic_ideas_review_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.idempotency_key = 'review-receipt-failure' THEN RAISE EXCEPTION 'Synthetic review receipt failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER synthetic_ideas_review_receipt_failure BEFORE INSERT ON idea_receipts FOR EACH ROW EXECUTE FUNCTION synthetic_ideas_review_receipt_failure();
      CREATE FUNCTION synthetic_ideas_review_response_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason = 'Synthetic response failure reason' THEN NEW.actor_display_name := ''; END IF; RETURN NEW; END $$;
      CREATE TRIGGER synthetic_ideas_review_response_failure BEFORE INSERT ON idea_dispositions FOR EACH ROW EXECUTE FUNCTION synthetic_ideas_review_response_failure();`);
    try {
      for (const [key, reason] of [
        ['review-receipt-failure', 'Synthetic private rollback reason'],
        ['review-response-failure', 'Synthetic response failure reason'],
      ]) {
        const response = await request(
          'POST',
          `/ideas/${String(created.id)}/dispositions`,
          {
            companyId: fixture.companyId,
            subject: 'ideas-reviewer',
            key,
            body: {
              kind: 'deferred',
              expectedRevision: 1,
              reason,
              reconsiderationDate: '2026-01-15',
            },
          },
        );
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain(reason);
        expect(
          await (
            await request('GET', `/ideas/${String(created.id)}`, scope)
          ).json(),
        ).toEqual(created);
        expect(
          await (
            await request(
              'GET',
              `/ideas/${String(created.id)}/dispositions`,
              scope,
            )
          ).json(),
        ).toMatchObject({ entries: [], total: 0 });
        const counts = await harness.pool.query(
          'SELECT (SELECT count(*) FROM idea_dispositions WHERE company_id = $1) AS dispositions, (SELECT count(*) FROM idea_receipts WHERE company_id = $1) AS receipts, (SELECT count(*) FROM idea_events WHERE company_id = $1) AS events',
          [fixture.companyId],
        );
        expect(counts.rows).toEqual([
          { dispositions: '0', receipts: '1', events: '1' },
        ]);
      }
    } finally {
      await harness.pool.query(
        'DROP TRIGGER synthetic_ideas_review_receipt_failure ON idea_receipts; DROP FUNCTION synthetic_ideas_review_receipt_failure(); DROP TRIGGER synthetic_ideas_review_response_failure ON idea_dispositions; DROP FUNCTION synthetic_ideas_review_response_failure();',
      );
    }
  });

  it('keeps real SQL and deferred commit failures out of HTTP and process diagnostics while preserving atomicity', async () => {
    const fixture = await prepared();
    const description = 'Synthetic confidential description733';
    const origin = 'Synthetic confidential origin733';
    const reason = 'Synthetic confidential disposition reason733';
    await harness.pool
      .query(`CREATE FUNCTION synthetic_ideas_diagnostic_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.idempotency_key = 'diagnostic-sql-failure' THEN RAISE EXCEPTION 'Synthetic Ideas SQL failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER synthetic_ideas_diagnostic_failure BEFORE INSERT ON idea_receipts FOR EACH ROW EXECUTE FUNCTION synthetic_ideas_diagnostic_failure();
      CREATE FUNCTION synthetic_ideas_commit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.idempotency_key IN ('diagnostic-commit-failure', 'diagnostic-review-commit-failure') THEN RAISE EXCEPTION 'Synthetic Ideas commit failure'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER synthetic_ideas_commit_failure AFTER INSERT ON idea_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION synthetic_ideas_commit_failure();`);
    const diagnostics = vi.spyOn(Logger.prototype, 'error');
    const stderr = vi.spyOn(process.stderr, 'write');
    const stdout = vi.spyOn(process.stdout, 'write');
    try {
      new Logger('SyntheticIdeasDiagnostics').error(
        'Synthetic capture control733',
      );
      const failures: unknown[] = [];
      for (const key of [
        'diagnostic-sql-failure',
        'diagnostic-commit-failure',
      ]) {
        const response = await request('POST', '/ideas', {
          companyId: fixture.companyId,
          subject: 'ideas-recorder',
          key,
          body: { description, origin },
        });
        expect(response.status).toBe(500);
        failures.push(await response.json());
        const count = await harness.pool.query(
          'SELECT (SELECT count(*) FROM ideas WHERE company_id = $1) AS ideas, (SELECT count(*) FROM idea_receipts WHERE company_id = $1) AS receipts, (SELECT count(*) FROM idea_events WHERE company_id = $1) AS events',
          [fixture.companyId],
        );
        expect(count.rows).toEqual([
          { ideas: '0', receipts: '0', events: '0' },
        ]);
      }
      const created = await saved(
        await request('POST', '/ideas', {
          companyId: fixture.companyId,
          subject: 'ideas-recorder',
          body: { description, origin },
        }),
      );
      const failedReview = await request(
        'POST',
        `/ideas/${String(created.id)}/dispositions`,
        {
          companyId: fixture.companyId,
          subject: 'ideas-reviewer',
          key: 'diagnostic-review-commit-failure',
          body: { kind: 'rejected', expectedRevision: 1, reason },
        },
      );
      expect(failedReview.status).toBe(500);
      failures.push(await failedReview.json());
      expect(
        await (
          await request('GET', `/ideas/${String(created.id)}`, {
            companyId: fixture.companyId,
            subject: 'ideas-recorder',
          })
        ).json(),
      ).toEqual(created);
      const count = await harness.pool.query(
        'SELECT (SELECT count(*) FROM idea_dispositions WHERE company_id = $1) AS dispositions, (SELECT count(*) FROM idea_receipts WHERE company_id = $1) AS receipts, (SELECT count(*) FROM idea_events WHERE company_id = $1) AS events',
        [fixture.companyId],
      );
      expect(count.rows).toEqual([
        { dispositions: '0', receipts: '1', events: '1' },
      ]);
      const loggerOutput = diagnostics.mock.calls
        .map((args) => format(...args))
        .join('\n');
      expect(loggerOutput).toContain('Synthetic capture control733');
      const output = [
        JSON.stringify(failures),
        loggerOutput,
        ...stderr.mock.calls.map((args) => outputText(args[0])),
        ...stdout.mock.calls.map((args) => outputText(args[0])),
      ].join('\n');
      for (const secret of [
        description,
        origin,
        reason,
        'Failed query:',
        'insert into "ideas"',
        'insert into "idea_receipts"',
        'synthetic_ideas_diagnostic_failure',
        'synthetic_ideas_commit_failure',
        'Synthetic Ideas SQL failure',
        'Synthetic Ideas commit failure',
      ])
        expect(output).not.toContain(secret);
    } finally {
      diagnostics.mockRestore();
      stderr.mockRestore();
      stdout.mockRestore();
      await harness.pool.query(
        'DROP TRIGGER synthetic_ideas_diagnostic_failure ON idea_receipts; DROP FUNCTION synthetic_ideas_diagnostic_failure(); DROP TRIGGER synthetic_ideas_commit_failure ON idea_receipts; DROP FUNCTION synthetic_ideas_commit_failure();',
      );
    }
  }, 15000);

  it('keeps restricted Idea content, identities, events and counts out of ordinary Activity and Home, including administration', async () => {
    const fixture = await prepared();
    const scope = { companyId: fixture.companyId };
    const activity = await request('GET', '/activity-log', scope);
    const home = await request('GET', '/operational-home', scope);
    expect(activity.status).toBe(200);
    expect(home.status).toBe(200);
    const beforeActivity = await activity.json();
    const beforeHome = await home.json();
    const created = await saved(
      await request('POST', '/ideas', {
        ...scope,
        subject: 'ideas-recorder',
        body: {
          description: 'Synthetic confidential Idea',
          origin: 'Synthetic confidential origin',
        },
      }),
    );
    await saved(
      await request('POST', `/ideas/${String(created.id)}/dispositions`, {
        ...scope,
        subject: 'ideas-reviewer',
        body: {
          kind: 'deferred',
          expectedRevision: 1,
          reason: 'Synthetic confidential reason',
          reconsiderationDate: '2026-01-15',
        },
      }),
    );
    expect(await (await request('GET', '/activity-log', scope)).json()).toEqual(
      beforeActivity,
    );
    expect(
      await (await request('GET', '/operational-home', scope)).json(),
    ).toEqual(beforeHome);
    for (const subject of ['ideas-owner', 'ideas-recorder', 'ideas-reviewer']) {
      const serialized = JSON.stringify([
        await (
          await request('GET', '/activity-log', { ...scope, subject })
        ).json(),
        await (
          await request('GET', '/operational-home', { ...scope, subject })
        ).json(),
      ]);
      for (const hidden of [
        String(created.id),
        'Synthetic confidential Idea',
        'Synthetic confidential origin',
        'Synthetic confidential reason',
        'idea.recorded',
        'idea.disposition.recorded',
      ])
        expect(serialized).not.toContain(hidden);
    }
    const events = await harness.pool.query(
      'SELECT action, revision, metadata FROM idea_events WHERE company_id = $1 ORDER BY revision',
      [fixture.companyId],
    );
    expect(events.rows).toEqual([
      { action: 'idea.recorded', revision: 1, metadata: { revision: 1 } },
      {
        action: 'idea.disposition.recorded',
        revision: 2,
        metadata: { revision: 2, disposition: 'deferred' },
      },
    ]);
  });

  it('requires Reader independently from either write grant and keeps Reader-only access read-only', async () => {
    const fixture = await prepared();
    const scope = { companyId: fixture.companyId, subject: 'ideas-recorder' };
    const created = await saved(
      await request('POST', '/ideas', {
        ...scope,
        body: { description: 'Independent rights', origin: 'Synthetic source' },
      }),
    );
    expect(
      (await request('GET', '/ideas', { subject: 'ideas-recorder' })).status,
    ).toBe(403);
    expect(
      (
        await request('POST', `/ideas/${String(created.id)}/dispositions`, {
          ...scope,
          body: {
            kind: 'rejected',
            expectedRevision: 1,
            reason: 'Recorder is not reviewer',
          },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request('POST', '/ideas', {
          companyId: fixture.companyId,
          subject: 'ideas-reviewer',
          body: {
            description: 'Reviewer is not recorder',
            origin: 'Synthetic source',
          },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          'DELETE',
          `/company-ideas-recorder-assignments/${String(fixture.recorderMembershipId)}/${fixture.companyId}`,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request('GET', `/ideas/${String(created.id)}`, scope)).status,
    ).toBe(200);
    expect(
      (
        await request('POST', '/ideas', {
          ...scope,
          body: {
            description: 'Reader only cannot record',
            origin: 'Synthetic source',
          },
        })
      ).status,
    ).toBe(403);
    for (const [subject, membershipId] of [
      ['ideas-recorder', fixture.recorderMembershipId],
      ['ideas-reviewer', fixture.reviewerMembershipId],
    ] as const) {
      expect(
        (
          await request(
            'DELETE',
            `/company-ideas-reader-assignments/${String(membershipId)}/${fixture.companyId}`,
          )
        ).status,
      ).toBe(200);
      for (const path of [
        '/ideas',
        `/ideas/${String(created.id)}`,
        `/ideas/${String(created.id)}/dispositions`,
      ]) {
        const denied = await request('GET', path, {
          companyId: fixture.companyId,
          subject,
        });
        expect(denied.status).toBe(403);
        expect(JSON.stringify(await denied.json())).not.toContain(
          'Independent rights',
        );
      }
      expect(
        (
          await request('POST', '/ideas', {
            companyId: fixture.companyId,
            subject,
            body: { description: 'No Reader', origin: 'Synthetic source' },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request('POST', `/ideas/${String(created.id)}/dispositions`, {
            companyId: fixture.companyId,
            subject,
            body: {
              kind: 'rejected',
              expectedRevision: 1,
              reason: 'No Reader',
            },
          })
        ).status,
      ).toBe(403);
    }
  });

  it('serializes two deliberate reviews of the same revision with one winner and one stale result', async () => {
    const fixture = await prepared();
    const scope = {
      companyId: fixture.companyId,
      subject: 'ideas-reviewer',
      key: 'same-review-race-key',
    };
    const colleague = object(
      await (
        await request('GET', '/access/current-actor', {
          subject: 'ideas-second-reviewer',
        })
      ).json(),
    );
    for (const role of ['context', 'reader', 'reviewer'])
      await saved(
        await request(
          'POST',
          role === 'context'
            ? '/company-context-assignments'
            : `/company-ideas-${role}-assignments`,
          {
            body: {
              companyId: fixture.companyId,
              workspaceMembershipId: colleague.workspaceMembershipId,
            },
          },
        ),
      );
    const created = await saved(
      await request('POST', '/ideas', {
        companyId: fixture.companyId,
        subject: 'ideas-recorder',
        body: {
          description: 'Concurrent review original',
          origin: 'Synthetic source',
        },
      }),
    );
    const lock = await hold(async (connection) => {
      await connection.query('SELECT id FROM ideas WHERE id = $1 FOR UPDATE', [
        created.id,
      ]);
    });
    try {
      const first = request(
        'POST',
        `/ideas/${String(created.id)}/dispositions`,
        {
          ...scope,
          body: {
            kind: 'deferred',
            expectedRevision: 1,
            reason: 'First deliberate reason',
          },
        },
      );
      const firstPid = await blockedBy(lock.pid);
      const second = request(
        'POST',
        `/ideas/${String(created.id)}/dispositions`,
        {
          ...scope,
          subject: 'ideas-second-reviewer',
          body: {
            kind: 'rejected',
            expectedRevision: 1,
            reason: 'Second deliberate reason',
          },
        },
      );
      await blockedBy(firstPid);
      await lock.release();
      const responses = await Promise.all([first, second]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      const conflict = responses.find((response) => response.status === 409);
      if (!conflict) throw new Error('Missing stale review response.');
      expect(await conflict.json()).toMatchObject({ code: 'STALE_VERSION' });
      const history = await request(
        'GET',
        `/ideas/${String(created.id)}/dispositions`,
        scope,
      );
      expect(object(await history.json())).toMatchObject({
        total: 1,
        entries: [
          {
            revision: 2,
            precedingRevision: 1,
            recordedBy: { workspaceMembershipId: fixture.reviewerMembershipId },
          },
        ],
      });
      const counts = await harness.pool.query(
        'SELECT (SELECT count(*) FROM idea_receipts WHERE company_id = $1) AS receipts, (SELECT count(*) FROM idea_events WHERE company_id = $1) AS events',
        [fixture.companyId],
      );
      expect(counts.rows).toEqual([{ receipts: '2', events: '2' }]);
    } finally {
      await lock.release();
    }
  }, 15000);

  it('orders live authority loss before new commands and cached receipt replay under observed PostgreSQL locks', async () => {
    for (const loss of [
      'reader',
      'recorder',
      'context',
      'membership',
      'internal-user',
      'company',
    ] as const) {
      const fixture = await prepared();
      const scope = {
        companyId: fixture.companyId,
        subject: 'ideas-recorder',
        key: 'authority-replay',
        body: {
          description: 'Synthetic authority ordering',
          origin: 'Synthetic source',
        },
      };
      await saved(await request('POST', '/ideas', scope));
      const mutation = authorityLoss(loss, fixture);
      const lock = await hold(async (connection) => {
        await connection.query(mutation.sql, mutation.values);
      });
      try {
        const replay = request('POST', '/ideas', scope);
        await blockedBy(lock.pid);
        await lock.release();
        expect((await replay).status).toBe(403);
        expect(
          (await request('POST', '/ideas', { ...scope, key: 'authority-new' }))
            .status,
        ).toBe(403);
        const count = await harness.pool.query(
          'SELECT (SELECT count(*) FROM ideas WHERE company_id = $1) AS ideas, (SELECT count(*) FROM idea_receipts WHERE company_id = $1) AS receipts, (SELECT count(*) FROM idea_events WHERE company_id = $1) AS events',
          [fixture.companyId],
        );
        expect(count.rows).toEqual([
          { ideas: '1', receipts: '1', events: '1' },
        ]);
      } finally {
        await lock.release();
        await restoreSyntheticMember(fixture.recorderMembershipId);
      }
    }
  }, 30000);

  it('holds live authority through a new command or exact replay, then denies confirmation after authority loss commits', async () => {
    for (const [index, loss] of [
      'reader',
      'recorder',
      'context',
      'membership',
      'internal-user',
      'company',
    ].entries()) {
      const fixture = await prepared();
      const key = 'command-first';
      const scope = {
        companyId: fixture.companyId,
        subject: 'ideas-recorder',
        key,
        body: {
          description: 'Synthetic command-first ordering',
          origin: 'Synthetic source',
        },
      };
      const isReplay = index % 2 === 0;
      const original = isReplay
        ? await saved(await request('POST', '/ideas', scope))
        : undefined;
      const lock = await hold(async (connection) => {
        await connection.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [
            JSON.stringify([
              'ideas',
              WORKSPACE_ID,
              fixture.companyId,
              fixture.recorderMembershipId,
              'record',
              key,
            ]),
          ],
        );
      });
      try {
        const pending = request('POST', '/ideas', scope);
        const commandPid = await blockedBy(lock.pid);
        const mutation = authorityLoss(loss, fixture);
        const lost = harness.pool.query(mutation.sql, mutation.values);
        await blockedBy(commandPid);
        await lock.release();
        const result = await saved(await pending);
        if (original) expect(result).toEqual(original);
        await lost;
        expect((await request('POST', '/ideas', scope)).status).toBe(403);
        const count = await harness.pool.query(
          'SELECT (SELECT count(*) FROM ideas WHERE company_id = $1) AS ideas, (SELECT count(*) FROM idea_receipts WHERE company_id = $1) AS receipts, (SELECT count(*) FROM idea_events WHERE company_id = $1) AS events',
          [fixture.companyId],
        );
        expect(count.rows).toEqual([
          { ideas: '1', receipts: '1', events: '1' },
        ]);
      } finally {
        await lock.release();
        await restoreSyntheticMember(fixture.recorderMembershipId);
      }
    }
  }, 30000);

  function authorityLoss(
    loss: string,
    fixture: { companyId: string; recorderMembershipId: unknown },
  ) {
    if (['reader', 'recorder', 'context'].includes(loss))
      return {
        sql: 'UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle::text = $3 AND revoked_at IS NULL',
        values: [
          fixture.companyId,
          fixture.recorderMembershipId,
          loss === 'context'
            ? 'company_context_access'
            : `company_ideas_${loss}`,
        ],
      };
    if (loss === 'company')
      return {
        sql: "UPDATE companies SET status = 'inactive' WHERE id = $1",
        values: [fixture.companyId],
      };
    if (loss === 'membership')
      return {
        sql: "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
        values: [fixture.recorderMembershipId],
      };
    if (loss === 'internal-user')
      return {
        sql: "UPDATE internal_users SET status = 'inactive' WHERE id = (SELECT internal_user_id FROM workspace_memberships WHERE id = $1)",
        values: [fixture.recorderMembershipId],
      };
    throw new Error('Unknown synthetic authority loss.');
  }

  async function restoreSyntheticMember(membershipId: unknown) {
    await harness.pool.query(
      "UPDATE workspace_memberships SET status = 'active' WHERE id = $1",
      [membershipId],
    );
    await harness.pool.query(
      "UPDATE internal_users SET status = 'active' WHERE id = (SELECT internal_user_id FROM workspace_memberships WHERE id = $1)",
      [membershipId],
    );
  }

  it('pages tied submissions with bounded consistent counts, empty continuations and measured reads', async () => {
    const fixture = await prepared();
    const scope = { companyId: fixture.companyId, subject: 'ideas-recorder' };
    const ids: string[] = [];
    const empty = await request('GET', '/ideas', scope);
    expect(await empty.json()).toMatchObject({
      ideas: [],
      total: 0,
      nextCursor: null,
    });
    for (let index = 0; index < 27; index++)
      ids.push(
        String(
          (
            await saved(
              await request('POST', '/ideas', {
                ...scope,
                body: {
                  description: `Synthetic page record ${index}`,
                  origin: 'Synthetic page source',
                },
              }),
            )
          ).id,
        ),
      );
    const expected = ids.toSorted().reverse();
    const firstRead = await harness.measureApplicationQueries(() =>
      request('GET', '/ideas', scope),
    );
    expect(firstRead.value.status).toBe(200);
    const first = object(await firstRead.value.json());
    const firstRows = array(first.ideas).map((row) => String(object(row).id));
    expect(firstRows).toEqual(expected.slice(0, 25));
    expect(first.total).toBe(27);
    expect(typeof first.nextCursor).toBe('string');
    const secondRead = await harness.measureApplicationQueries(() =>
      request(
        'GET',
        `/ideas?cursor=${encodeURIComponent(String(first.nextCursor))}`,
        scope,
      ),
    );
    const second = object(await secondRead.value.json());
    expect(array(second.ideas).map((row) => String(object(row).id))).toEqual(
      expected.slice(25),
    );
    expect(second).toMatchObject({ total: 27, nextCursor: null });
    expect(secondRead.queryCount).toBe(firstRead.queryCount);
    expect(
      firstRead.queries.filter(
        (query) => query.startsWith('select') && query.includes('from "ideas"'),
      ),
    ).toHaveLength(1);
    expect(
      firstRead.queries.some(
        (query) => query.includes('limit $') && query.includes('from "ideas"'),
      ),
    ).toBe(true);
    const statement = firstRead.queries.find(
      (query) => query.startsWith('select') && query.includes('from "ideas"'),
    );
    if (!statement) throw new Error('Missing measured public list statement.');
    const explained = await harness.pool.query<{ 'QUERY PLAN': unknown }>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement}`,
      [WORKSPACE_ID, fixture.companyId, WORKSPACE_ID, fixture.companyId, 26],
    );
    const measured = object(array(explained.rows[0]?.['QUERY PLAN'])[0]);
    const plan = object(measured.Plan);
    expect(plan['Actual Rows']).toBeLessThanOrEqual(26);
    console.info(
      'Synthetic Ideas public list query measurement',
      JSON.stringify({
        applicationQueryCount: firstRead.queryCount,
        pageRows: firstRows.length,
        authorizedTotal: first.total,
        countPageStatements: 1,
        explained: measured,
      }),
    );
    const pastEndCursor = Buffer.from(
      JSON.stringify({ time: '1970-01-01T00:00:00.000Z', id: randomUUID() }),
    ).toString('base64url');
    const pastEnd = await request(
      'GET',
      `/ideas?cursor=${pastEndCursor}`,
      scope,
    );
    expect(await pastEnd.json()).toMatchObject({
      ideas: [],
      total: 27,
      nextCursor: null,
    });
    for (const cursor of [
      'invalid!',
      Buffer.from('{}').toString('base64url'),
      Buffer.from('{"beforeRevision":0}').toString('base64url'),
    ]) {
      expect(
        (
          await request(
            'GET',
            `/ideas?cursor=${encodeURIComponent(cursor)}`,
            scope,
          )
        ).status,
      ).toBe(400);
    }
  }, 30000);

  it('pages complete disposition history with bounded consistent counts, empty continuations and measured reads', async () => {
    const fixture = await prepared();
    const scope = { companyId: fixture.companyId, subject: 'ideas-recorder' };
    const created = await saved(
      await request('POST', '/ideas', {
        ...scope,
        body: {
          description: 'Synthetic page record 0',
          origin: 'Synthetic page source',
        },
      }),
    );
    const ideaId = created.id;
    if (typeof ideaId !== 'string' || !ideaId)
      throw new Error('Missing page fixture.');
    for (let revision = 1; revision <= 27; revision++)
      await saved(
        await request('POST', `/ideas/${ideaId}/dispositions`, {
          companyId: fixture.companyId,
          subject: 'ideas-reviewer',
          body: {
            kind: revision % 2 === 0 ? 'rejected' : 'deferred',
            expectedRevision: revision,
            reason: `Synthetic history reason ${revision}`,
          },
        }),
      );
    const historyRead = await harness.measureApplicationQueries(() =>
      request('GET', `/ideas/${ideaId}/dispositions`, scope),
    );
    const history = object(await historyRead.value.json());
    expect(
      historyRead.queries.filter(
        (query) =>
          query.startsWith('select') &&
          query.includes('from "idea_dispositions"'),
      ),
    ).toHaveLength(1);
    const historyStatement = historyRead.queries.find(
      (query) =>
        query.startsWith('select') &&
        query.includes('from "idea_dispositions"'),
    );
    if (!historyStatement)
      throw new Error('Missing measured public history statement.');
    const historyExplained = await harness.pool.query<{
      'QUERY PLAN': unknown;
    }>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${historyStatement}`, [
      WORKSPACE_ID,
      fixture.companyId,
      ideaId,
      WORKSPACE_ID,
      fixture.companyId,
      ideaId,
      26,
    ]);
    const historyMeasured = object(
      array(historyExplained.rows[0]?.['QUERY PLAN'])[0],
    );
    expect(object(historyMeasured.Plan)['Actual Rows']).toBeLessThanOrEqual(26);
    console.info(
      'Synthetic Ideas public history query measurement',
      JSON.stringify({
        applicationQueryCount: historyRead.queryCount,
        pageRows: array(history.entries).length,
        authorizedTotal: history.total,
        countPageStatements: 1,
        explained: historyMeasured,
      }),
    );
    expect(
      array(history.entries).map((entry) => object(entry).revision),
    ).toEqual(Array.from({ length: 25 }, (_, index) => 28 - index));
    const final = object(
      await (
        await request(
          'GET',
          `/ideas/${ideaId}/dispositions?cursor=${encodeURIComponent(String(history.nextCursor))}`,
          scope,
        )
      ).json(),
    );
    expect(array(final.entries).map((entry) => object(entry).revision)).toEqual(
      [3, 2],
    );
    expect(final).toMatchObject({ total: 27, nextCursor: null });
    const historyEndCursor = Buffer.from(
      JSON.stringify({ beforeRevision: 2 }),
    ).toString('base64url');
    const historyEnd = await request(
      'GET',
      `/ideas/${ideaId}/dispositions?cursor=${historyEndCursor}`,
      scope,
    );
    expect(await historyEnd.json()).toMatchObject({
      total: 27,
      entries: [],
      nextCursor: null,
    });
    for (const cursor of [
      'invalid!',
      Buffer.from('{}').toString('base64url'),
      Buffer.from('{"beforeRevision":0}').toString('base64url'),
    ]) {
      expect(
        (
          await request(
            'GET',
            `/ideas/${ideaId}/dispositions?cursor=${encodeURIComponent(cursor)}`,
            scope,
          )
        ).status,
      ).toBe(400);
    }
  }, 30000);

  it('preserves original literal boundary lengths and rejects invalid submission input', async () => {
    const fixture = await prepared();
    const scope = { companyId: fixture.companyId, subject: 'ideas-recorder' };
    const description = `  ${'🟣'.repeat(2498)}  `;
    expect(description.length).toBe(5000);
    const created = await saved(
      await request('POST', '/ideas', {
        ...scope,
        body: { description, origin: 'o'.repeat(300) },
      }),
    );
    expect(created.description).toBe(description);
    for (const body of [
      null,
      [],
      {},
      { description: ' ', origin: 'source' },
      { description: 'd'.repeat(5001), origin: 'source' },
      { description: 'valid', origin: 'o'.repeat(301) },
      { description: 'valid', origin: 'source', title: 'Unapproved title' },
    ])
      expect((await request('POST', '/ideas', { ...scope, body })).status).toBe(
        400,
      );
  }, 15000);

  it('preserves literal reason and calendar boundaries and rejects invalid disposition input', async () => {
    const fixture = await prepared();
    const scope = { companyId: fixture.companyId, subject: 'ideas-recorder' };
    const created = await saved(
      await request('POST', '/ideas', {
        ...scope,
        body: {
          description: 'Synthetic disposition input record',
          origin: 'Synthetic source',
        },
      }),
    );
    const reviewScope = {
      companyId: fixture.companyId,
      subject: 'ideas-reviewer',
    };
    const path = `/ideas/${String(created.id)}/dispositions`;
    for (const input of [
      { reason: ' ' },
      { reason: 'r'.repeat(2001) },
      { kind: 'new' },
      { kind: 'approved' },
      { reconsiderationDate: '2026-02-30' },
      { reconsiderationDate: '0000-01-01' },
      { reconsiderationDate: '2026-1-01' },
      { reconsiderationDate: '' },
      { expectedRevision: 0 },
      { expectedRevision: 1.5 },
      { title: 'No edit' },
    ])
      expect(
        (
          await request('POST', path, {
            ...reviewScope,
            body: {
              kind: 'deferred',
              reason: 'Valid reason',
              expectedRevision: 1,
              ...input,
            },
          })
        ).status,
      ).toBe(400);
    const reason = ` ${'r'.repeat(1998)} `;
    const result = await saved(
      await request('POST', path, {
        ...reviewScope,
        body: {
          kind: 'deferred',
          reason,
          expectedRevision: 1,
          reconsiderationDate: '2024-02-29',
        },
      }),
    );
    expect(object(result.entry)).toMatchObject({
      reason,
      reconsiderationDate: '2024-02-29',
    });
    let expectedRevision = 2;
    for (const reconsiderationDate of ['0001-01-01', '9999-12-31']) {
      const boundary = await saved(
        await request('POST', path, {
          ...reviewScope,
          body: {
            kind: 'deferred',
            reason,
            expectedRevision,
            reconsiderationDate,
          },
        }),
      );
      expect(object(boundary.entry)).toMatchObject({
        reason,
        reconsiderationDate,
      });
      expectedRevision += 1;
    }
  }, 15000);

  it('isolates existing originals and history between Companies and rejects editing or deleting an Idea', async () => {
    const fixture = await prepared();
    const scope = { companyId: fixture.companyId, subject: 'ideas-recorder' };
    const created = await saved(
      await request('POST', '/ideas', {
        ...scope,
        body: {
          description: 'Synthetic private existing original',
          origin: 'Synthetic private origin',
        },
      }),
    );
    await saved(
      await request('POST', `/ideas/${String(created.id)}/dispositions`, {
        companyId: fixture.companyId,
        subject: 'ideas-reviewer',
        body: {
          kind: 'deferred',
          expectedRevision: 1,
          reason: 'Synthetic private existing history',
        },
      }),
    );
    const other = await prepared();
    for (const target of [String(created.id), randomUUID()]) {
      const otherScope = {
        companyId: other.companyId,
        subject: 'ideas-recorder',
      };
      expect(
        (await request('GET', `/ideas/${target}`, otherScope)).status,
      ).toBe(404);
      expect(
        (await request('GET', `/ideas/${target}/dispositions`, otherScope))
          .status,
      ).toBe(404);
      expect(
        (
          await request('POST', `/ideas/${target}/dispositions`, {
            companyId: other.companyId,
            subject: 'ideas-reviewer',
            body: {
              kind: 'rejected',
              expectedRevision: 1,
              reason: 'Foreign target',
            },
          })
        ).status,
      ).toBe(404);
    }
    for (const method of ['PUT', 'PATCH', 'DELETE'])
      expect(
        (
          await request(method, `/ideas/${String(created.id)}`, {
            ...scope,
            body: { description: 'Attempted rewrite' },
          })
        ).status,
      ).toBe(404);
  }, 15000);

  it('denies an in-flight actor with a retired captured assignment even when a new v1 grant exists, then permits a fresh actor', async () => {
    const fixture = await prepared();
    const scope = {
      companyId: fixture.companyId,
      subject: 'ideas-recorder',
      key: 'captured-reader-replay',
      body: {
        description: 'Preserved captured assignment',
        origin: 'Synthetic source',
      },
    };
    const original = await saved(await request('POST', '/ideas', scope));
    const lock = await hold(async (connection) => {
      await connection.query(
        "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle = 'company_ideas_reader' AND revoked_at IS NULL",
        [fixture.companyId, fixture.recorderMembershipId],
      );
      await connection.query(
        "INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version) VALUES ($1, $2, $3, 'company_ideas_reader', 'v1')",
        [WORKSPACE_ID, fixture.companyId, fixture.recorderMembershipId],
      );
    });
    try {
      const retired = request('POST', '/ideas', scope);
      await blockedBy(lock.pid);
      await lock.release();
      expect((await retired).status).toBe(403);
      expect(await saved(await request('POST', '/ideas', scope))).toEqual(
        original,
      );
    } finally {
      await lock.release();
    }
  }, 15000);

  it('enforces immutable originals and append-only history, receipts and restricted events at storage boundaries', async () => {
    const fixture = await prepared();
    const scope = { companyId: fixture.companyId, subject: 'ideas-recorder' };
    const created = await saved(
      await request('POST', '/ideas', {
        ...scope,
        body: { description: 'Immutable original', origin: 'Immutable origin' },
      }),
    );
    await saved(
      await request('POST', `/ideas/${String(created.id)}/dispositions`, {
        companyId: fixture.companyId,
        subject: 'ideas-reviewer',
        body: {
          kind: 'rejected',
          expectedRevision: 1,
          reason: 'Immutable attributed reason',
        },
      }),
    );
    for (const sql of [
      "UPDATE ideas SET description = 'Rewritten', revision = revision + 1 WHERE company_id = $1",
      "UPDATE ideas SET origin = 'Rewritten', revision = revision + 1 WHERE company_id = $1",
      'DELETE FROM ideas WHERE company_id = $1',
      "UPDATE idea_dispositions SET reason = 'Rewritten' WHERE company_id = $1",
      'DELETE FROM idea_dispositions WHERE company_id = $1',
      "UPDATE idea_events SET metadata = '{}' WHERE company_id = $1",
      'DELETE FROM idea_events WHERE company_id = $1',
      "UPDATE idea_receipts SET response = '{}' WHERE company_id = $1",
      'DELETE FROM idea_receipts WHERE company_id = $1',
    ])
      await expect(
        harness.pool.query(sql, [fixture.companyId]),
      ).rejects.toMatchObject({ code: 'P0001' });
    const current = await request('GET', `/ideas/${String(created.id)}`, scope);
    expect(await current.json()).toMatchObject({
      ...created,
      revision: 2,
      disposition: 'rejected',
    });
    const history = await request(
      'GET',
      `/ideas/${String(created.id)}/dispositions`,
      scope,
    );
    expect(await history.json()).toMatchObject({
      total: 1,
      entries: [{ reason: 'Immutable attributed reason' }],
    });
    const metadataAttempt = await harness.pool.query<{
      workspace_id: string;
      actor_membership_id: string;
      actor_internal_user_id: string;
    }>(
      'SELECT workspace_id, actor_membership_id, actor_internal_user_id FROM idea_events WHERE company_id = $1 LIMIT 1',
      [fixture.companyId],
    );
    const event = metadataAttempt.rows[0];
    if (!event) throw new Error('Missing synthetic restricted event.');
    for (const metadata of [
      { revision: 1, description: 'Forbidden content' },
      { revision: 2 },
      { revision: 2, disposition: 'approved' },
    ])
      await expect(
        harness.pool.query(
          'INSERT INTO idea_events (workspace_id, company_id, idea_id, revision, action, actor_membership_id, actor_internal_user_id, occurred_at, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)',
          [
            event.workspace_id,
            fixture.companyId,
            created.id,
            metadata.revision,
            metadata.revision === 1
              ? 'idea.recorded'
              : 'idea.disposition.recorded',
            event.actor_membership_id,
            event.actor_internal_user_id,
            JSON.stringify(metadata),
          ],
        ),
      ).rejects.toMatchObject({ code: '23514' });
  });

  it.each([
    { readerState: 'unchanged', view: 'list' },
    { readerState: 'revoked', view: 'list' },
    { readerState: 'unchanged', view: 'detail' },
    { readerState: 'revoked', view: 'detail' },
    { readerState: 'unchanged', view: 'history' },
    { readerState: 'revoked', view: 'history' },
  ])(
    'serves a consistent authorized $view or denies $readerState Reader authority after a concurrent identity update',
    async ({ readerState, view }) => {
      const fixture = await prepared();
      const scope = { companyId: fixture.companyId, subject: 'ideas-recorder' };
      const created = await saved(
        await request('POST', '/ideas', {
          ...scope,
          body: {
            description: 'Survives concurrent identity refresh',
            origin: 'Synthetic source',
          },
        }),
      );
      const lock = await hold(async (connection) => {
        await connection.query(
          "SELECT id FROM company_role_assignments WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle = 'company_ideas_reader' AND revoked_at IS NULL FOR UPDATE",
          [fixture.companyId, fixture.recorderMembershipId],
        );
      });
      try {
        const path =
          view === 'list'
            ? '/ideas'
            : `/ideas/${String(created.id)}${view === 'history' ? '/dispositions' : ''}`;
        const pending = request('GET', path, scope);
        await blockedBy(lock.pid);
        const refresh = await hold(async (connection) => {
          await connection.query("SET LOCAL lock_timeout = '1000ms'");
          await connection.query(
            'UPDATE internal_users SET display_name = display_name WHERE id = (SELECT internal_user_id FROM workspace_memberships WHERE id = $1)',
            [fixture.recorderMembershipId],
          );
        });
        await refresh.release();
        if (readerState === 'revoked') {
          await lock.connection.query(
            "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle = 'company_ideas_reader' AND revoked_at IS NULL",
            [fixture.companyId, fixture.recorderMembershipId],
          );
        }
        await lock.release();
        const response = await pending;
        expect(response.status).toBe(readerState === 'revoked' ? 403 : 200);
        if (readerState === 'revoked')
          expect(await response.json()).not.toHaveProperty('ideas');
        else if (view === 'list')
          expect(await response.json()).toMatchObject({
            total: 1,
            ideas: [created],
          });
        else if (view === 'detail')
          expect(await response.json()).toEqual(created);
        else
          expect(await response.json()).toMatchObject({
            ideaId: created.id,
            total: 0,
            entries: [],
          });
      } finally {
        await lock.release();
      }
    },
    15000,
  );

  it('isolates Idea content, totals, target lookups and identical retry keys between real Workspace memberships', async () => {
    const fixture = await prepared();
    const created = await saved(
      await request('POST', '/ideas', {
        companyId: fixture.companyId,
        subject: 'ideas-recorder',
        key: 'same-cross-workspace-key',
        body: {
          description: 'Only original Workspace may read this',
          origin: 'Original Workspace source',
        },
      }),
    );
    const ownerActor = object(
      await (await request('GET', '/access/current-actor')).json(),
    );
    if (typeof ownerActor.internalUserId !== 'string')
      throw new Error('Missing synthetic owner user.');
    const workspaceId = randomUUID(),
      membershipId = randomUUID();
    await harness.pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2)',
      [workspaceId, 'Synthetic other Ideas Workspace'],
    );
    await harness.pool.query(
      'INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)',
      [membershipId, workspaceId, ownerActor.internalUserId],
    );
    try {
      for (const permission of ['company.manage', 'company.assignment.manage'])
        await harness.pool.query(
          'INSERT INTO workspace_permission_grants (workspace_id, workspace_membership_id, permission) VALUES ($1, $2, $3)',
          [workspaceId, membershipId, permission],
        );
      const company = await saved(
        await request('POST', '/companies', {
          workspaceId,
          body: { displayName: 'Synthetic other Workspace Company' },
        }),
      );
      if (typeof company.id !== 'string')
        throw new Error('Missing synthetic other Company.');
      for (const role of ['reader', 'recorder', 'reviewer'])
        await saved(
          await request('POST', `/company-ideas-${role}-assignments`, {
            workspaceId,
            body: {
              companyId: company.id,
              workspaceMembershipId: membershipId,
            },
          }),
        );
      const otherScope = { workspaceId, companyId: company.id };
      const other = await saved(
        await request('POST', '/ideas', {
          ...otherScope,
          key: 'same-cross-workspace-key',
          body: {
            description: 'Only other Workspace may read this',
            origin: 'Other Workspace source',
          },
        }),
      );
      const list = await request('GET', '/ideas', otherScope);
      expect(await list.json()).toMatchObject({ total: 1, ideas: [other] });
      for (const target of [String(created.id), randomUUID()]) {
        expect(
          (await request('GET', `/ideas/${target}`, otherScope)).status,
        ).toBe(404);
        expect(
          (await request('GET', `/ideas/${target}/dispositions`, otherScope))
            .status,
        ).toBe(404);
        expect(
          (
            await request('POST', `/ideas/${target}/dispositions`, {
              ...otherScope,
              body: {
                kind: 'rejected',
                expectedRevision: 1,
                reason: 'Foreign Workspace target',
              },
            })
          ).status,
        ).toBe(404);
      }
      const denied = await request('GET', `/ideas/${String(created.id)}`, {
        workspaceId,
        companyId: fixture.companyId,
      });
      expect(denied.status).toBe(403);
      expect(JSON.stringify(await denied.json())).not.toContain(
        'Only original Workspace',
      );
    } finally {
      await harness.pool.query(
        "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
        [membershipId],
      );
    }
  }, 15000);

  async function hold(acquire: (connection: PoolClient) => Promise<void>) {
    const connection = await harness.pool.connect();
    let released = false;
    try {
      await connection.query('BEGIN');
      const result = await connection.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const pid = result.rows[0]?.pid;
      if (pid === undefined)
        throw new Error('Missing synthetic barrier backend.');
      await acquire(connection);
      return {
        pid,
        connection,
        release: async () => {
          if (released) return;
          released = true;
          try {
            await connection.query('COMMIT');
          } finally {
            connection.release();
          }
        },
      };
    } catch (error) {
      await connection.query('ROLLBACK');
      connection.release();
      throw error;
    }
  }

  async function blockedBy(pid: number, minimum = 1): Promise<number> {
    const deadline = Date.now() + 5000;
    do {
      const result = await harness.pool.query(
        'SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND $1::integer = ANY(pg_blocking_pids(pid))',
        [pid],
      );
      const waiter: unknown = result.rows[0]?.pid;
      if (result.rows.length >= minimum && typeof waiter === 'number')
        return waiter;
    } while (Date.now() < deadline);
    throw new Error(
      'PostgreSQL did not observe the required holder/waiter barrier.',
    );
  }

  async function request(
    method: string,
    path: string,
    options: {
      body?: unknown;
      companyId?: string;
      subject?: string;
      key?: string;
      workspaceId?: string;
    } = {},
  ) {
    return fetch(`${harness.origin}/api${path}`, {
      method,
      headers: {
        ...OWNER,
        'x-test-external-subject': options.subject ?? 'ideas-owner',
        'x-test-display-name': `Synthetic ${options.subject ?? 'ideas-owner'}`,
        'content-type': 'application/json',
        'idempotency-key': options.key ?? randomUUID(),
        ...(options.companyId
          ? { 'x-company-context-id': options.companyId }
          : {}),
        ...(options.workspaceId
          ? { 'x-workspace-context-id': options.workspaceId }
          : {}),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  }
  async function saved(response: Response) {
    expect(response.status).toBe(201);
    return object(await response.json());
  }
  async function prepared() {
    await request('GET', '/access/current-actor');
    const companyId = String(
      (
        await saved(
          await request('POST', '/companies', {
            body: { displayName: 'Synthetic Review Company' },
          }),
        )
      ).id,
    );
    const recorder = object(
      await (
        await request('GET', '/access/current-actor', {
          subject: 'ideas-recorder',
        })
      ).json(),
    );
    const reviewer = object(
      await (
        await request('GET', '/access/current-actor', {
          subject: 'ideas-reviewer',
        })
      ).json(),
    );
    for (const [subject, member, roles] of [
      ['ideas-recorder', recorder, ['reader', 'recorder']],
      ['ideas-reviewer', reviewer, ['reader', 'reviewer']],
    ] as const) {
      for (const role of ['context', ...roles])
        await saved(
          await request(
            'POST',
            role === 'context'
              ? '/company-context-assignments'
              : `/company-ideas-${role}-assignments`,
            {
              body: {
                companyId,
                workspaceMembershipId: member.workspaceMembershipId,
              },
            },
          ),
        );
      const current = await request('GET', '/access/current-actor', {
        companyId,
        subject,
      });
      expect(current.status).toBe(200);
    }
    return {
      companyId,
      recorderMembershipId: recorder.workspaceMembershipId,
      reviewerMembershipId: reviewer.workspaceMembershipId,
    };
  }
});

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected API object.');
  return Object.fromEntries(Object.entries(value));
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected API array.');
  return value;
}
function outputText(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString('utf8');
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString('utf8');
  return format(chunk);
}
