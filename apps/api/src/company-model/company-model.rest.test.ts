import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { commandFingerprint } from '../command/idempotent-command.js';
import { generatedContractModelContent } from '../contract/model-contract.test-fixture.js';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import { createPostgresRestTestHarness } from '../database/postgres-rest-test-harness.js';
import { generatedOfferModelContent } from '../offer/offer-model-generation.test-fixture.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const workspaceId = '00000000-0000-4000-8000-000000001191';

// One row per Company model kind: the shared lifecycle must answer both the
// same way, through each kind's own routes, grants, tables and codes.
const kinds = [
  {
    name: 'Offer',
    path: '/offer-models/consulting-ro',
    editor: '/company-offer-model-editor-assignments',
    approver: '/company-offer-model-approver-assignments',
    selector: '/company-offer-preparer-assignments',
    selectionPath: () => '/offer-models/consulting-ro/for-offer',
    selectionKind: 'APPROVED_COMPANY_OFFER_MODEL',
    code: 'INTEGRATED_MANAGEMENT_CONSULTING_RO',
    prefix: 'OFFER_MODEL',
    table: 'offer_model',
    content: generatedOfferModelContent,
  },
  {
    name: 'Contract',
    path: '/contract-models/consulting-ro',
    editor: '/company-contract-model-editor-assignments',
    approver: '/company-contract-model-approver-assignments',
    selector: '/company-contract-preparer-assignments',
    selectionPath: () =>
      `/contracts/opportunities/${randomUUID()}/model-selection`,
    selectionKind: 'APPROVED_COMPANY_CONTRACT_MODEL',
    code: 'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO',
    prefix: 'CONTRACT_MODEL',
    table: 'contract_model',
    content: generatedContractModelContent,
  },
] as const;
type Kind = (typeof kinds)[number];

withPostgres('Company model lifecycle over every kind (REST)', () => {
  let database: Awaited<ReturnType<typeof createIsolatedPostgresTestDatabase>>;
  let harness: Awaited<ReturnType<typeof createPostgresRestTestHarness>>;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'company_model1191',
    });
    try {
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        serverClock: { now: () => new Date('2026-11-14T12:00:00.000Z') },
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'model-owner',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Company model Workspace',
          ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
            ['model-editor', 'model-reviewer', 'model-selector'].map(
              (subject) => ({
                provider: 'deterministic-test',
                subject,
                workspaceId,
              }),
            ),
          ),
        },
      });
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

  function request({
    path,
    subject = 'model-owner',
    companyId,
    body,
    key = randomUUID(),
  }: {
    path: string;
    subject?: string;
    companyId?: string;
    body?: unknown;
    key?: string;
  }) {
    const method = body === undefined ? 'GET' : 'POST';
    return fetch(`${harness.origin}/api${path}`, {
      method,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-email': `${subject}@example.test`,
        'x-test-display-name': subject,
        'x-workspace-context-id': workspaceId,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        ...(method === 'GET' ? {} : { 'idempotency-key': key }),
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

  async function refusal(input: Parameters<typeof request>[0]) {
    const response = await request(input);
    return { status: response.status, body: record(await response.json()) };
  }

  async function prepared(kind: Kind) {
    const companyId = string(
      await success({
        path: '/companies',
        body: { displayName: `Synthetic ${kind.name} model Company` },
      }),
      'id',
    );
    for (const [subject, assignment] of [
      ['model-editor', kind.editor],
      ['model-reviewer', kind.approver],
      ['model-selector', kind.selector],
    ] as const) {
      const actor = await success({ path: '/access/current-actor', subject });
      const workspaceMembershipId = string(actor, 'workspaceMembershipId');
      for (const path of ['/company-context-assignments', assignment])
        await success({ path, body: { workspaceMembershipId, companyId } });
    }
    return companyId;
  }

  async function effects(kind: Kind) {
    const result = await harness.pool.query(`SELECT
      (SELECT count(*)::int FROM ${kind.table}s) AS models,
      (SELECT count(*)::int FROM ${kind.table}_versions) AS versions,
      (SELECT count(*)::int FROM ${kind.table}_decisions) AS decisions,
      (SELECT count(*)::int FROM ${kind.table}_withdrawals) AS withdrawals,
      (SELECT count(*)::int FROM ${kind.table}_commands) AS commands,
      (SELECT count(*)::int FROM ${kind.table}_events) AS events`);
    return result.rows;
  }

  function editor(kind: Kind, companyId: string) {
    return {
      subject: 'model-editor',
      companyId,
      path: `${kind.path}/versions`,
    };
  }
  function reviewer(companyId: string, path: string) {
    return { subject: 'model-reviewer', companyId, path };
  }

  it.each(kinds)(
    'submits, decides, pages, replays, selects and withdraws a $name model through one lifecycle',
    async (kind) => {
      const companyId = await prepared(kind);
      const submission = {
        ...editor(kind, companyId),
        key: 'first-version',
        body: { expectedModelRevision: 0, content: kind.content },
      };
      const submitted = record((await success(submission)).model);
      expect(submitted).toMatchObject({
        code: kind.code,
        language: 'ro',
        revision: 1,
        activeVersion: null,
        head: { versionNumber: 1, content: kind.content, decision: null },
      });
      const firstId = string(record(submitted.head), 'id');
      const approved = record(
        (
          await success({
            ...reviewer(companyId, `${kind.path}/versions/${firstId}/decision`),
            body: {
              expectedModelRevision: 1,
              versionNumber: 1,
              outcome: 'APPROVE',
              basis: 'Synthetic first review',
            },
          })
        ).model,
      );
      expect(approved).toMatchObject({
        revision: 2,
        activeVersion: { id: firstId, versionNumber: 1 },
        head: { decision: { outcome: 'APPROVE' } },
      });
      const approvalId = string(record(record(approved.head).decision), 'id');
      const successor = record(
        (
          await success({
            ...editor(kind, companyId),
            body: {
              expectedModelRevision: 2,
              content: { ...kind.content, serviceTitle: 'Synthetic successor' },
            },
          })
        ).model,
      );
      const secondId = string(record(successor.head), 'id');
      expect(
        await success({
          ...reviewer(companyId, `${kind.path}/versions/${secondId}/decision`),
          body: {
            expectedModelRevision: 3,
            versionNumber: 2,
            outcome: 'REJECT',
            basis: 'Synthetic successor refused',
          },
        }),
      ).toMatchObject({
        model: { revision: 4, activeVersion: { id: firstId } },
      });

      const firstPage = await success({
        subject: 'model-editor',
        companyId,
        path: `${kind.path}/versions?limit=1`,
      });
      expect(firstPage).toMatchObject({
        versions: [
          {
            id: secondId,
            versionNumber: 2,
            serviceTitle: 'Synthetic successor',
            decision: { outcome: 'REJECT' },
          },
        ],
      });
      const cursor = string(firstPage, 'nextCursor');
      expect(
        await success({
          subject: 'model-editor',
          companyId,
          path: `${kind.path}/versions?limit=1&cursor=${cursor}`,
        }),
      ).toMatchObject({
        versions: [{ id: firstId, decision: { outcome: 'APPROVE' } }],
        nextCursor: null,
      });
      expect(
        await refusal({
          subject: 'model-editor',
          companyId,
          path: `${kind.path}/versions?cursor=${cursor}x`,
        }),
      ).toMatchObject({
        status: 400,
        body: { code: `${kind.prefix}_CURSOR_INVALID` },
      });

      const before = await effects(kind);
      expect(await success(submission)).toEqual({ model: submitted });
      expect(
        await refusal({
          ...submission,
          body: { ...submission.body, expectedModelRevision: 4 },
        }),
      ).toMatchObject({
        status: 409,
        body: { code: `${kind.prefix}_IDEMPOTENCY_CONFLICT` },
      });
      expect(await effects(kind)).toEqual(before);

      const selection = await success({
        subject: 'model-selector',
        companyId,
        path: kind.selectionPath(),
      });
      expect(selection).toEqual({
        selection: {
          kind: kind.selectionKind,
          modelId: string(submitted, 'id'),
          code: kind.code,
          language: 'ro',
          versionId: firstId,
          versionNumber: 1,
          approvalDecisionId: approvalId,
          approvedAt: '2026-11-14T12:00:00.000Z',
          approvedBy: {
            workspaceMembershipId: string(
              record(record(record(approved.head).decision).actor),
              'workspaceMembershipId',
            ),
            internalUserId: string(
              record(record(record(approved.head).decision).actor),
              'internalUserId',
            ),
          },
          content: kind.content,
        },
      });
      expect(
        (
          await request({
            subject: 'model-editor',
            companyId,
            path: kind.selectionPath(),
          })
        ).status,
      ).toBe(403);

      expect(
        await success({
          ...reviewer(companyId, `${kind.path}/versions/${firstId}/withdrawal`),
          body: {
            expectedModelRevision: 4,
            versionNumber: 1,
            reason: 'Synthetic retirement',
          },
        }),
      ).toMatchObject({
        model: {
          revision: 5,
          activeVersion: null,
          head: { id: secondId },
        },
      });
      expect(
        await success({
          subject: 'model-selector',
          companyId,
          path: kind.selectionPath(),
        }),
      ).toEqual({ selection: null });
      expect(
        await success({
          subject: 'model-editor',
          companyId,
          path: `${kind.path}/versions/${firstId}`,
        }),
      ).toMatchObject({
        version: {
          id: firstId,
          decision: { id: approvalId, outcome: 'APPROVE' },
          withdrawal: { reason: 'Synthetic retirement' },
        },
        currentSelection: { activeVersionId: null },
      });
      const events = await harness.pool.query<{ action: string }>(
        `SELECT action FROM ${kind.table}_events ORDER BY revision`,
      );
      expect(events.rows.map(({ action }) => action)).toEqual(
        ['created', 'approved', 'created', 'rejected', 'withdrawn'].map(
          (step) => `${kind.table}.version.${step}`,
        ),
      );
    },
  );

  // Divergence 1 of #1190. Before #1191 a Contract model command fingerprinted
  // its validated intent, so a retry spelled differently but parsing the same
  // replayed, and an invalid retry was refused as invalid. An Offer model
  // command already fingerprinted the raw payload. Both now follow the
  // documented raw-payload rule of `idempotent-command.ts`.
  it.each(kinds)(
    'fingerprints the raw $name model payload, so only an exact retry replays',
    async (kind) => {
      const companyId = await prepared(kind);
      const withContact = {
        ...kind.content,
        issuer: { ...kind.content.issuer, contactDetails: null },
      };
      const { legalName, taxId, legalAddress } = withContact.issuer;
      const issuerWithoutContact = { legalName, taxId, legalAddress };
      const submission = {
        ...editor(kind, companyId),
        key: 'raw-submission',
        body: { expectedModelRevision: 0, content: withContact },
      };
      const submitted = record((await success(submission)).model);
      const versionId = string(record(submitted.head), 'id');
      const decision = {
        ...reviewer(companyId, `${kind.path}/versions/${versionId}/decision`),
        key: 'raw-decision',
        body: {
          expectedModelRevision: 1,
          versionNumber: 1,
          outcome: 'APPROVE',
          basis: 'Synthetic raw-payload review',
        },
      };
      const approved = await success(decision);
      const before = await effects(kind);

      // The same parsed content without the null contact field.
      expect(
        await refusal({
          ...submission,
          body: {
            ...submission.body,
            content: { ...withContact, issuer: issuerWithoutContact },
          },
        }),
      ).toMatchObject({
        status: 409,
        body: { code: `${kind.prefix}_IDEMPOTENCY_CONFLICT` },
      });
      // The same Version named in upper case.
      expect(
        await refusal({
          ...decision,
          path: `${kind.path}/versions/${versionId.toUpperCase()}/decision`,
        }),
      ).toMatchObject({
        status: 409,
        body: { code: `${kind.prefix}_IDEMPOTENCY_CONFLICT` },
      });
      // A used key with an invalid payload is a key conflict, not a 400.
      expect(
        await refusal({
          ...decision,
          body: { ...decision.body, outcome: 'MAYBE' },
        }),
      ).toMatchObject({
        status: 409,
        body: { code: `${kind.prefix}_IDEMPOTENCY_CONFLICT` },
      });
      expect(await success(decision)).toEqual(approved);
      expect(await effects(kind)).toEqual(before);
    },
  );

  // Contract model receipts recorded before #1191 fingerprinted the validated
  // intent with the model code. Such a receipt is an earlier shape: no retry
  // matches it, so the key conflicts instead of replaying it.
  it.each(kinds)(
    'refuses a $name model receipt recorded under the parsed-intent fingerprint instead of replaying it',
    async (kind) => {
      const companyId = await prepared(kind);
      const content = {
        ...kind.content,
        issuer: { ...kind.content.issuer, contactDetails: null },
      };
      const submission = {
        ...editor(kind, companyId),
        key: 'recorded-before-1191',
        body: { expectedModelRevision: 0, content },
      };
      await success(submission);
      // Rewrite the receipt as a predecessor recorded it; history is otherwise
      // immutable.
      const commands = `${kind.table}_commands`;
      await harness.pool.query(`ALTER TABLE ${commands} DISABLE TRIGGER USER`);
      try {
        await harness.pool.query(
          `UPDATE ${commands} SET fingerprint=$1 WHERE key=$2`,
          [
            commandFingerprint({
              modelCode: kind.code,
              kind: 'SUBMIT',
              expectedModelRevision: 0,
              content,
            }),
            submission.key,
          ],
        );
      } finally {
        await harness.pool.query(`ALTER TABLE ${commands} ENABLE TRIGGER USER`);
      }
      const before = await effects(kind);
      const { legalName, taxId, legalAddress } = content.issuer;
      for (const body of [
        submission.body,
        {
          ...submission.body,
          content: { ...content, issuer: { legalName, taxId, legalAddress } },
        },
      ])
        expect(await refusal({ ...submission, body })).toMatchObject({
          status: 409,
          body: { code: `${kind.prefix}_IDEMPOTENCY_CONFLICT` },
        });
      expect(await effects(kind)).toEqual(before);
    },
  );

  // Before #1191 a Contract model command validated its payload before
  // reading the actor's authority; it now rechecks authority first, as the
  // Offer model command did.
  it.each(kinds)(
    'denies a member without $name model authority before reading the payload',
    async (kind) => {
      const companyId = await prepared(kind);
      const before = await effects(kind);
      expect(
        (
          await request({
            subject: 'model-selector',
            companyId,
            path: `${kind.path}/versions`,
            body: { expectedModelRevision: 'not a revision' },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request({
            subject: 'model-editor',
            companyId,
            path: `${kind.path}/versions`,
            body: { expectedModelRevision: 'not a revision' },
          })
        ).status,
      ).toBe(400);
      expect(await effects(kind)).toEqual(before);
    },
  );
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
