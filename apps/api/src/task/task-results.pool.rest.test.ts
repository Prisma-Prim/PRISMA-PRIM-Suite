import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import {
  createMissionDocumentFixture,
  json,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import { prepareTaskResult } from './task-results.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres(
  'Task result owning transaction REST under bounded database capacity',
  () => {
    let fixture: MissionDocumentFixture;
    let singleConnection: PostgresRestTestHarness;
    let context: Awaited<ReturnType<typeof prepareTaskResult>>;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await createMissionDocumentFixture(databaseUrl);
      const connectionString = fixture.pool.options.connectionString;
      if (typeof connectionString !== 'string')
        throw new Error('Missing isolated connection configuration.');
      // Setup uses the ordinary fixture. This second real App serves the same
      // isolated data with one connection and a finite acquisition deadline.
      singleConnection = await createPostgresRestTestHarness({
        databaseUrl: connectionString,
        environment: { NODE_ENV: 'test', ACCESS_IDENTITY_MODE: 'test' },
        applicationPoolConfiguration: { max: 1, connectionTimeoutMillis: 1000 },
      });
    });
    afterAll(async () => {
      await singleConnection?.close();
      await fixture?.close();
    });
    beforeEach(async () => {
      context = await prepareTaskResult(fixture);
      await fixture.grant('/company-task-result-recorder-assignments');
    });
    function call(path: string, body?: unknown) {
      return fetch(`${singleConnection.origin}/api${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': 'mission-owner',
          'x-test-display-name': 'Mission Owner DEMO',
          'x-test-email': 'mission-owner@example.test',
          'x-company-context-id': context.companyId,
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    it('reads current, history and eligible Versions without requesting a second connection inside the result snapshot', async () => {
      for (const suffix of ['', '/history', '/eligible-versions']) {
        const response = await call(
          `/tasks/${context.taskId}/results${suffix}`,
        );
        expect(response.status).toBe(200);
      }
      expect(
        await json(await call(`/tasks/${context.taskId}/results`)),
      ).toMatchObject({ revision: 0, current: null });
    });
    it('records and corrects atomically with one available connection while ordinary Task reads remain compatible', async () => {
      const input = {
        expectedTaskVersion: 1,
        expectedResultRevision: 0,
        documentId: context.documentId,
        versionId: context.versionId,
        declaration: 'Single-connection result DEMO',
      };
      const first = await call(`/tasks/${context.taskId}/results`, input);
      expect(first.status).toBe(201);
      const corrected = await call(
        `/tasks/${context.taskId}/results/corrections`,
        {
          ...input,
          expectedResultRevision: 1,
          declaration: 'Corrected single-connection result DEMO',
          reason: 'Preserve one owning transaction',
        },
      );
      expect(corrected.status).toBe(201);
      expect(
        await json(await call(`/tasks/${context.taskId}/results`)),
      ).toMatchObject({ revision: 2 });
      expect(await json(await call(`/tasks/${context.taskId}`))).toMatchObject({
        task: { version: 1, status: 'todo' },
      });
    });
  },
);
