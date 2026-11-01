import { randomUUID } from 'node:crypto';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public object.');
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public text.');
  return value;
}
export async function json(response: Response) {
  const value: unknown = await response.json();
  return object(value);
}
export async function openFollowUpFixture(databaseUrl: string) {
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix: 'opportunity_follow_up',
  });
  const workspaceId = '00000000-0000-4000-8000-000000001024';
  const environment = {
    NODE_ENV: 'test',
    KNOWLEDGE_EVIDENCE_ENABLED: 'true',
    ACCESS_IDENTITY_MODE: 'test',
    ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
    ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'follow-up-owner',
    ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
    ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Manual follow-up DEMO',
    ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
      ['writer', 'reader', 'outsider'].map((subject) => ({
        provider: 'deterministic-test',
        subject: 'follow-up-' + subject,
        workspaceId,
      })),
    ),
  };
  let harness: PostgresRestTestHarness;
  async function open() {
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment,
      synchronizeIdentityProfile: false,
    });
  }
  await open();
  let companyId = '';
  let membershipId = '';
  async function request(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      key?: string;
      subject?: string;
      companyId?: string;
      anonymous?: boolean;
    } = {},
  ) {
    const method = options.method ?? 'GET';
    return fetch(harness.origin + '/api' + path, {
      method,
      headers: {
        ...(options.anonymous
          ? {}
          : {
              'x-test-external-provider': 'deterministic-test',
              'x-test-external-subject':
                'follow-up-' + (options.subject ?? 'writer'),
              'x-test-display-name': 'DEMO ' + (options.subject ?? 'writer'),
              'x-test-email': (options.subject ?? 'writer') + '@example.test',
            }),
        ...((options.companyId ?? companyId)
          ? { 'x-company-context-id': options.companyId ?? companyId }
          : {}),
        ...(method === 'GET'
          ? {}
          : {
              'content-type': 'application/json',
              'idempotency-key': options.key ?? randomUUID(),
            }),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  }
  async function created(path: string, body: unknown, subject = 'owner') {
    const response = await request(path, { method: 'POST', body, subject });
    if (response.status !== 201)
      throw new Error(
        'Synthetic setup ' +
          path +
          ' status ' +
          response.status +
          ': ' +
          (await response.text()),
      );
    return json(response);
  }
  async function grant(bundle: string, member = membershipId) {
    return created('/company-' + bundle + '-assignments', {
      companyId,
      workspaceMembershipId: member,
    });
  }
  async function setup() {
    await harness.pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
    companyId = '';
    companyId = text(
      (await created('/companies', { displayName: 'Follow-up DEMO' })).id,
    );
    const actorResponse = await request('/access/current-actor', {
      companyId: '',
    });
    if (actorResponse.status !== 200)
      throw new Error('Actor setup status ' + actorResponse.status);
    const actor = await json(actorResponse);
    membershipId = text(actor.workspaceMembershipId);
    for (const bundle of [
      'context',
      'commercial-intake',
      'opportunity-follow-up-coordinator',
      'opportunity-manager',
      'sales-stage-configuration',
    ])
      await grant(bundle);
    return { companyId, membershipId, workspaceId };
  }
  async function createCase(title = 'Fictional follow-up') {
    const response = await request('/commercial-intake/requests', {
      method: 'POST',
      body: {
        originalText: 'Literal fictional native Request',
        subject: title,
        opportunity: { title, nextAction: 'Arrange a fictional discussion' },
      },
    });
    if (response.status !== 201)
      throw new Error(
        'Request setup status ' +
          response.status +
          ': ' +
          (await response.text()),
      );
    const detail = await json(response),
      opportunity = object(detail.initialOpportunity);
    return {
      requestId: text(detail.id),
      opportunityId: text(opportunity.id),
      detail,
      path:
        '/commercial-intake/opportunities/' +
        text(opportunity.id) +
        '/follow-up',
    };
  }
  return {
    setup,
    request,
    created,
    grant,
    createCase,
    get pool() {
      return harness.pool;
    },
    get harness() {
      return harness;
    },
    databaseUrl: database.targetUrl,
    restart: async () => {
      await harness.close();
      await open();
    },
    close: async () => {
      await harness.close();
      await database.close();
    },
  };
}
