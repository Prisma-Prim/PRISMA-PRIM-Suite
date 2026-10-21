import { randomUUID } from 'node:crypto';
import { format } from 'node:util';
import { Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000000737';

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}

async function body(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  return object(value);
}

function diagnosticText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  throw new Error('Unexpected diagnostic output shape.');
}

describe.skipIf(!databaseUrl)('Company Complaint REST contract', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let companyId = '';

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'complaints_737',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'complaint-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Company Complaints',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'complaint-member',
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
    const company = await request('/companies', {
      method: 'POST',
      value: { displayName: 'Synthetic complaint Company' },
    });
    expect(company.status).toBe(201);
    companyId = string((await body(company)).id);
  });

  function request(
    path: string,
    options: {
      method?: string;
      value?: unknown;
      company?: string;
      subject?: string;
      key?: string;
    } = {},
  ): Promise<Response> {
    const {
      method = 'GET',
      value,
      company = companyId,
      subject = 'complaint-owner',
      key = randomUUID(),
    } = options;
    return fetch(`${harness.origin}/api${path}`, {
      method,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-display-name': 'Synthetic complaint recorder',
        'x-test-email': `${subject}@example.test`,
        ...(company ? { 'x-company-context-id': company } : {}),
        'idempotency-key': key,
        'content-type': 'application/json',
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  }

  async function createComplaint() {
    const actor = await request('/access/current-actor');
    expect(actor.status).toBe(200);
    const membershipId = string((await body(actor)).workspaceMembershipId);
    for (const path of [
      '/company-director-client-assignments',
      '/company-complaints-reader-assignments',
      '/company-complaints-recorder-assignments',
    ]) {
      const grant = await request(path, {
        method: 'POST',
        value: { workspaceMembershipId: membershipId, companyId },
      });
      expect(grant.status).toBe(201);
    }
    const client = await request('/clients', {
      method: 'POST',
      value: { displayName: 'Synthetic history Client' },
    });
    expect(client.status).toBe(201);
    const clientAccountId = string((await body(client)).id);
    const intake = {
      complaintDate: null,
      complainant: '  Original representative  ',
      subject: '  Original factual account.\nȘtefan / Иван  ',
      severityDescription: null,
      responseDueDate: null,
    };
    const key = randomUUID();
    const input = {
      clientAccountId,
      projectId: null,
      responsibleMembershipId: membershipId,
      ...intake,
    };
    const response = await request('/complaints', {
      method: 'POST',
      key,
      value: input,
    });
    expect(response.status).toBe(201);
    const saved = await body(response);
    return {
      membershipId,
      clientAccountId,
      intake,
      input,
      key,
      saved,
      id: string(saved.id),
    };
  }

  it('requires an explicit Complaint Reader even for an existing Company administrator', async () => {
    const currentActor = await request('/access/current-actor');
    expect(currentActor.status).toBe(200);
    const company = object((await body(currentActor)).activeCompany);
    expect(company.id).toBe(companyId);

    const response = await request('/complaints');
    expect(response.status).toBe(403);
  });

  it('exposes the independent live captured Reader and Recorder assignments to the current actor', async () => {
    const current = await request('/access/current-actor');
    expect(current.status).toBe(200);
    const membershipId = string((await body(current)).workspaceMembershipId);
    const readerResponse = await request(
      '/company-complaints-reader-assignments',
      {
        method: 'POST',
        value: { workspaceMembershipId: membershipId, companyId },
      },
    );
    expect(readerResponse.status).toBe(201);
    const reader = await body(readerResponse);
    expect(reader.bundle).toBe('Company Complaints Reader');
    expect(reader.permissionSetVersion).toBe('v1');

    const afterReader = await request('/access/current-actor');
    expect(afterReader.status).toBe(200);
    const readerCompany = object((await body(afterReader)).activeCompany);
    expect(readerCompany.complaintReaderAssignmentId).toBe(reader.id);
    expect(readerCompany.complaintReaderPermissionSetVersion).toBe('v1');
    expect(readerCompany.complaintRecorderAssignmentId).toBeUndefined();
    expect((await request('/complaints')).status).toBe(200);

    const revoked = await request(
      `/company-complaints-reader-assignments/${membershipId}/${companyId}`,
      { method: 'DELETE' },
    );
    expect(revoked.status).toBe(200);
    const recorderResponse = await request(
      '/company-complaints-recorder-assignments',
      {
        method: 'POST',
        value: { workspaceMembershipId: membershipId, companyId },
      },
    );
    expect(recorderResponse.status).toBe(201);
    const recorder = await body(recorderResponse);
    expect(recorder.bundle).toBe('Company Complaints Recorder');
    expect(recorder.permissionSetVersion).toBe('v1');
    const afterRecorder = await request('/access/current-actor');
    expect(afterRecorder.status).toBe(200);
    const recorderCompany = object((await body(afterRecorder)).activeCompany);
    expect(recorderCompany.complaintReaderAssignmentId).toBeUndefined();
    expect(recorderCompany.complaintRecorderAssignmentId).toBe(recorder.id);
    expect(recorderCompany.complaintRecorderPermissionSetVersion).toBe('v1');
    expect((await request('/complaints')).status).toBe(403);
  });

  it('records the literal original intake and reopens it with explicit self-responsibility and unknown factual dates', async () => {
    const actorResponse = await request('/access/current-actor');
    expect(actorResponse.status).toBe(200);
    const membershipId = string(
      (await body(actorResponse)).workspaceMembershipId,
    );
    for (const path of [
      '/company-director-client-assignments',
      '/company-complaints-reader-assignments',
      '/company-complaints-recorder-assignments',
    ]) {
      const granted = await request(path, {
        method: 'POST',
        value: { workspaceMembershipId: membershipId, companyId },
      });
      expect(granted.status).toBe(201);
    }
    const clientResponse = await request('/clients', {
      method: 'POST',
      value: { displayName: 'Synthetic complaint Client' },
    });
    expect(clientResponse.status).toBe(201);
    const clientId = string((await body(clientResponse)).id);
    const intake = {
      complaintDate: null,
      complainant: 'Synthetic Client representative',
      subject: '  Questionnaire instructions were unclear.\nȘtefan / Иван  ',
      severityDescription: null,
      responseDueDate: null,
    };
    const created = await request('/complaints', {
      method: 'POST',
      value: {
        clientAccountId: clientId,
        projectId: null,
        responsibleMembershipId: membershipId,
        ...intake,
      },
    });
    expect(created.status).toBe(201);
    const saved = await body(created);
    expect(saved).toMatchObject({
      companyId,
      clientAccountId: clientId,
      projectId: null,
      revision: 1,
      originalIntake: intake,
      currentIntake: intake,
      responsible: { workspaceMembershipId: membershipId },
    });
    const complaintId = string(saved.id);
    const reopened = await request(`/complaints/${complaintId}`);
    expect(reopened.status).toBe(200);
    expect(await body(reopened)).toEqual(saved);
  });

  it('corrects the intake through a motivated complete successor while preserving its literal original', async () => {
    const currentActor = await request('/access/current-actor');
    expect(currentActor.status).toBe(200);
    const membershipId = string(
      (await body(currentActor)).workspaceMembershipId,
    );
    for (const path of [
      '/company-director-client-assignments',
      '/company-complaints-reader-assignments',
      '/company-complaints-recorder-assignments',
    ]) {
      const granted = await request(path, {
        method: 'POST',
        value: { workspaceMembershipId: membershipId, companyId },
      });
      expect(granted.status).toBe(201);
    }
    const client = await request('/clients', {
      method: 'POST',
      value: { displayName: 'Synthetic successor Client' },
    });
    expect(client.status).toBe(201);
    const clientAccountId = string((await body(client)).id);
    const original = {
      complaintDate: null,
      complainant: '  Original representative  ',
      subject: '  Original factual account.\nȘtefan / Иван  ',
      severityDescription: null,
      responseDueDate: null,
    };
    const created = await request('/complaints', {
      method: 'POST',
      value: {
        clientAccountId,
        projectId: null,
        responsibleMembershipId: membershipId,
        ...original,
      },
    });
    expect(created.status).toBe(201);
    const saved = await body(created);
    const complaintId = string(saved.id);
    const correctedIntake = {
      ...original,
      complaintDate: '2026-10-19',
      subject: '  Corrected factual account.\nȘtefan / Иван  ',
      severityDescription: 'Client describes an unclear instruction.',
      responseDueDate: '2026-10-23',
    };
    const corrected = await request(
      `/complaints/${complaintId}/intake-corrections`,
      {
        method: 'POST',
        value: {
          expectedRevision: 1,
          reason: '  Correcting the declared date and factual wording.  ',
          ...correctedIntake,
        },
      },
    );
    expect(corrected.status).toBe(201);
    const successor = await body(corrected);
    expect(successor).toMatchObject({
      id: complaintId,
      companyId,
      clientAccountId,
      projectId: null,
      revision: 2,
      originalIntake: original,
      currentIntake: correctedIntake,
      responsible: { workspaceMembershipId: membershipId },
      createdAt: saved.createdAt,
    });
    const reopened = await request(`/complaints/${complaintId}`);
    expect(reopened.status).toBe(200);
    expect(await body(reopened)).toEqual(successor);
  });

  it('retains every original and intermediate intake with its reason and server attribution in readable history', async () => {
    const original = await createComplaint();
    const firstIntake = { ...original.intake, subject: '  First correction  ' };
    const firstReason = '  Clarifying the original factual declaration.  ';
    const first = await request(
      `/complaints/${original.id}/intake-corrections`,
      {
        method: 'POST',
        value: { ...firstIntake, expectedRevision: 1, reason: firstReason },
      },
    );
    expect(first.status).toBe(201);
    const finalIntake = {
      ...firstIntake,
      complaintDate: '2026-10-19',
      subject: '  Final declared correction.\nȘtefan / Иван  ',
    };
    const finalReason =
      '  Correcting the declared date without erasing history.  ';
    const final = await request(
      `/complaints/${original.id}/intake-corrections`,
      {
        method: 'POST',
        value: { ...finalIntake, expectedRevision: 2, reason: finalReason },
      },
    );
    expect(final.status).toBe(201);
    expect(await body(final)).toMatchObject({
      revision: 3,
      originalIntake: original.intake,
      currentIntake: finalIntake,
    });
    const response = await request(`/complaints/${original.id}/history`);
    expect(response.status).toBe(200);
    const history = await body(response);
    expect(history).toMatchObject({ total: 3, offset: 0, pageSize: 25 });
    const actor = {
      workspaceMembershipId: original.membershipId,
      displayLabel: 'Synthetic complaint recorder',
    };
    expect(history.entries).toEqual([
      expect.objectContaining({
        kind: 'intake',
        revision: 1,
        intake: original.intake,
        reason: null,
        actor,
        recordedAt: original.saved.createdAt,
      }),
      expect.objectContaining({
        kind: 'intake_correction',
        revision: 2,
        intake: firstIntake,
        reason: firstReason,
        actor,
        recordedAt: expect.any(String),
      }),
      expect.objectContaining({
        kind: 'intake_correction',
        revision: 3,
        intake: finalIntake,
        reason: finalReason,
        actor,
        recordedAt: expect.any(String),
      }),
    ]);
  });

  it('replays the exact historical receipt before stale checks while changed intent conflicts and lost live authority denies replay', async () => {
    const original = await createComplaint();
    const key = randomUUID();
    const correctionInput = {
      ...original.intake,
      subject: 'First corrected declaration',
      expectedRevision: 1,
      reason: 'Correcting the subject.',
    };
    const path = `/complaints/${original.id}/intake-corrections`;
    const first = await request(path, {
      method: 'POST',
      key,
      value: correctionInput,
    });
    expect(first.status).toBe(201);
    const historical = await body(first);
    const later = await request(path, {
      method: 'POST',
      value: {
        ...correctionInput,
        subject: 'A later corrected declaration',
        expectedRevision: 2,
        reason: 'Adding a later clarification.',
      },
    });
    expect(later.status).toBe(201);
    expect((await body(later)).revision).toBe(3);

    const replay = await request(path, {
      method: 'POST',
      key,
      value: correctionInput,
    });
    expect(replay.status).toBe(201);
    expect(await body(replay)).toEqual(historical);
    const initialReplay = await request('/complaints', {
      method: 'POST',
      key: original.key,
      value: original.input,
    });
    expect(initialReplay.status).toBe(201);
    expect(await body(initialReplay)).toEqual(original.saved);

    for (const change of [
      { ...correctionInput, subject: 'Changed same-key intent' },
      { ...correctionInput, expectedRevision: 3 },
    ]) {
      const conflict = await request(path, {
        method: 'POST',
        key,
        value: change,
      });
      expect(conflict.status).toBe(409);
      expect((await body(conflict)).code).toBe('IDEMPOTENCY_CONFLICT');
    }
    const stale = await request(path, {
      method: 'POST',
      value: correctionInput,
    });
    expect(stale.status).toBe(409);
    expect((await body(stale)).code).toBe('STALE_VERSION');
    const revoked = await request(
      `/company-complaints-recorder-assignments/${original.membershipId}/${companyId}`,
      { method: 'DELETE' },
    );
    expect(revoked.status).toBe(200);
    const deniedReplay = await request(path, {
      method: 'POST',
      key,
      value: correctionInput,
    });
    expect(deniedReplay.status).toBe(403);
    const reopened = await request(`/complaints/${original.id}`);
    expect(reopened.status).toBe(200);
    expect((await body(reopened)).revision).toBe(3);
  });

  it('normalizes unknown dates for an intake no-op without advancing its revision or original Client fence', async () => {
    const original = await createComplaint();
    const clientBefore = await request(`/clients/${original.clientAccountId}`);
    expect(clientBefore.status).toBe(200);
    const version = (await body(clientBefore)).version;
    expect(typeof version).toBe('number');
    const key = randomUUID();
    const input = {
      complainant: original.intake.complainant,
      subject: original.intake.subject,
      complaintDate: '',
      responseDueDate: '',
      expectedRevision: 1,
      reason: 'Confirming that the declared facts have not changed.',
    };
    const path = `/complaints/${original.id}/intake-corrections`;
    const noOp = await request(path, { method: 'POST', key, value: input });
    expect(noOp.status).toBe(201);
    expect(await body(noOp)).toEqual(original.saved);
    const normalizedReplay = await request(path, {
      method: 'POST',
      key,
      value: {
        ...input,
        complaintDate: null,
        responseDueDate: null,
        severityDescription: null,
      },
    });
    expect(normalizedReplay.status).toBe(201);
    expect(await body(normalizedReplay)).toEqual(original.saved);
    const clientAfter = await request(`/clients/${original.clientAccountId}`);
    expect(clientAfter.status).toBe(200);
    expect((await body(clientAfter)).version).toBe(version);
    const history = await request(`/complaints/${original.id}/history`);
    expect(history.status).toBe(200);
    expect((await body(history)).total).toBe(1);
  });

  // Source-only #737 continuation: public register/journal contracts, not run.
  // Mutations keep this owner's existing direct ComplaintView response. New
  // history variants belong to this server owner, never a Client-status DTO.
  function rows(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) throw new Error('Expected a public row array.');
    return value.map((entry: unknown) => object(entry));
  }

  async function appendJournal({
    complaintId,
    expectedRevision,
    kind = 'action',
    text = '  Reviewed the declared instructions.\nȘtefan / Иван  ',
    declaredDate = null,
    key = randomUUID(),
  }: {
    complaintId: string;
    expectedRevision: number;
    kind?: 'action' | 'response';
    text?: string;
    declaredDate?: string | null;
    key?: string;
  }) {
    const input = { kind, text, declaredDate, expectedRevision };
    const path = `/complaints/${complaintId}/journal`;
    const response = await request(path, { method: 'POST', key, value: input });
    expect(response.status).toBe(201);
    return { saved: await body(response), input, path, key };
  }

  async function journalEffects(
    original: Awaited<ReturnType<typeof createComplaint>>,
  ) {
    const detail = await request(`/complaints/${original.id}`);
    const history = await request(`/complaints/${original.id}/history`);
    const client = await request(`/clients/${original.clientAccountId}`);
    expect([detail.status, history.status, client.status]).toEqual([
      200, 200, 200,
    ]);
    const effects = await harness.pool.query<{
      receipts: number;
      events: number;
    }>(
      `SELECT
        (SELECT count(*)::integer FROM complaint_receipts WHERE complaint_id = $1) AS receipts,
        (SELECT count(*)::integer FROM complaint_events WHERE complaint_id = $1) AS events`,
      [original.id],
    );
    const counts = effects.rows[0];
    if (!counts) throw new Error('Synthetic Complaint counts are unavailable.');
    return {
      detail: await body(detail),
      history: await body(history),
      client: await body(client),
      ...counts,
    };
  }

  it('keeps mixed administration Activity readable while all recorded Complaint facts remain private', async () => {
    const original = await createComplaint();
    const privateText =
      'Synthetic confidential response that must stay outside Activity';
    await appendJournal({
      complaintId: original.id,
      expectedRevision: 1,
      kind: 'response',
      text: privateText,
    });
    for (const role of ['reader', 'recorder']) {
      const revoked = await request(
        `/company-complaints-${role}-assignments/${original.membershipId}/${companyId}`,
        { method: 'DELETE' },
      );
      expect(revoked.status).toBe(200);
    }
    const activity = await request('/activity-log');
    expect(activity.status).toBe(200);
    const page = await body(activity);
    const events = rows(page.events);
    const assignmentEvents = events.filter((event) =>
      string(event.action).startsWith('company_complaints_'),
    );
    expect(assignmentEvents.map((event) => event.action).sort()).toEqual([
      'company_complaints_reader_assignment.granted',
      'company_complaints_reader_assignment.revoked',
      'company_complaints_recorder_assignment.granted',
      'company_complaints_recorder_assignment.revoked',
    ]);
    expect(
      events.some(
        (event) =>
          event.action === 'company_director_client_assignment.granted',
      ),
    ).toBe(true);
    for (const event of assignmentEvents) {
      expect(event.target).toMatchObject({
        type: 'company_role_assignment',
        companyId,
        workspaceMembershipId: original.membershipId,
      });
      expect(event.metadata).toEqual({
        bundle: string(event.action).includes('_reader_')
          ? 'Company Complaints Reader'
          : 'Company Complaints Recorder',
      });
    }
    const serialized = JSON.stringify(page);
    for (const privateValue of [
      original.id,
      original.intake.complainant,
      original.intake.subject,
      privateText,
      'complaint.recorded',
      'complaint.journal.recorded',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it('enforces non-null supported correction original-kind attribution at the actual PostgreSQL integrity boundary', async () => {
    const original = await createComplaint();
    await appendJournal({ complaintId: original.id, expectedRevision: 1 });
    const historyResponse = await request(`/complaints/${original.id}/history`);
    expect(historyResponse.status).toBe(200);
    const action = rows((await body(historyResponse)).entries).find(
      (entry) => entry.kind === 'action',
    );
    if (!action) throw new Error('The public original action must exist.');
    const correction = await request(
      `/complaints/${original.id}/journal/${string(action.id)}/corrections`,
      {
        method: 'POST',
        value: {
          expectedRevision: 2,
          text: 'Corrected factual account',
          declaredDate: null,
          reason: 'Original wording was incomplete',
        },
      },
    );
    expect(correction.status).toBe(201);
    const before = await journalEffects(original);
    for (const invalidKind of [null, 'correction']) {
      await expect(
        harness.pool.query(
          "UPDATE complaint_journal_entries SET original_kind = $1 WHERE complaint_id = $2 AND kind = 'correction' RETURNING id",
          [invalidKind, original.id],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'complaint_journal_entries_payload_check',
      });
      expect(await journalEffects(original)).toEqual(before);
    }
    const stored = await harness.pool.query<{
      original_kind: string;
      original_entry_id: string;
    }>(
      "SELECT original_kind, original_entry_id FROM complaint_journal_entries WHERE complaint_id = $1 AND kind = 'correction'",
      [original.id],
    );
    expect(stored.rows).toEqual([
      { original_kind: 'action', original_entry_id: string(action.id) },
    ]);
  });

  it('rejects null missing or unsupported journal event kinds in PostgreSQL without damaging saved public history', async () => {
    const original = await createComplaint();
    await appendJournal({ complaintId: original.id, expectedRevision: 1 });
    const before = await journalEffects(original);
    for (const metadata of [
      { revision: 2, kind: null },
      { revision: 2 },
      { revision: 2, kind: 'unknown' },
      { revision: null, kind: 'action' },
    ]) {
      await expect(
        harness.pool.query(
          'UPDATE complaint_events SET metadata = $1::jsonb WHERE complaint_id = $2 AND revision = 2 RETURNING id',
          [JSON.stringify(metadata), original.id],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'complaint_events_metadata_check',
      });
      expect(await journalEffects(original)).toEqual(before);
    }
    const stored = await harness.pool.query<{ metadata: unknown }>(
      'SELECT metadata FROM complaint_events WHERE complaint_id = $1 AND revision = 2',
      [original.id],
    );
    expect(stored.rows).toEqual([
      { metadata: { revision: 2, kind: 'action' } },
    ]);
  });

  it('pages the actual authorized register before counts and offset, retaining deterministic recorded ordering', async () => {
    const original = await createComplaint();
    const expected = [original.saved];
    for (let index = 1; index < 27; index += 1) {
      const response = await request('/complaints', {
        method: 'POST',
        value: {
          ...original.input,
          subject: `Synthetic bounded register complaint ${index}`,
        },
      });
      expect(response.status).toBe(201);
      expected.push(await body(response));
    }
    // A real persisted record whose related Client read has been withdrawn must
    // not influence the authorized count, offsets, rows or factual metadata.
    const hidden = await createComplaint();
    await harness.pool.query(
      `UPDATE client_company_relationships SET status = 'archived'
      WHERE company_id = $1 AND client_account_id = $2`,
      [companyId, hidden.clientAccountId],
    );
    const otherCompanyResponse = await request('/companies', {
      method: 'POST',
      value: { displayName: 'Synthetic other Complaint Company' },
    });
    expect(otherCompanyResponse.status).toBe(201);
    const otherCompanyId = string((await body(otherCompanyResponse)).id);
    for (const path of [
      '/company-director-client-assignments',
      '/company-complaints-reader-assignments',
      '/company-complaints-recorder-assignments',
    ]) {
      const grant = await request(path, {
        method: 'POST',
        value: {
          workspaceMembershipId: original.membershipId,
          companyId: otherCompanyId,
        },
      });
      expect(grant.status).toBe(201);
    }
    const otherClient = await request('/clients', {
      method: 'POST',
      company: otherCompanyId,
      value: { displayName: 'Synthetic other Company Client' },
    });
    expect(otherClient.status).toBe(201);
    const otherRecord = await request('/complaints', {
      method: 'POST',
      company: otherCompanyId,
      value: {
        ...original.input,
        clientAccountId: string((await body(otherClient)).id),
        subject: 'Private other Company fact737',
      },
    });
    expect(otherRecord.status).toBe(201);
    const otherRecordId = string((await body(otherRecord)).id);
    expected.sort(
      (left, right) =>
        string(left.createdAt).localeCompare(string(right.createdAt)) ||
        string(left.id).localeCompare(string(right.id)),
    );
    const seen: string[] = [];
    for (const offset of [0, 25, 50]) {
      const response = await request(`/complaints?offset=${offset}`);
      expect(response.status).toBe(200);
      const page = await body(response);
      expect(page).toMatchObject({
        companyId,
        total: 27,
        offset,
        pageSize: 25,
      });
      expect(page.complaints).toEqual(expected.slice(offset, offset + 25));
      seen.push(...rows(page.complaints).map((row) => string(row.id)));
      expect(JSON.stringify(page)).not.toContain(hidden.id);
      expect(JSON.stringify(page)).not.toContain(hidden.clientAccountId);
      expect(JSON.stringify(page)).not.toContain(otherRecordId);
      expect(JSON.stringify(page)).not.toContain(
        'Private other Company fact737',
      );
    }
    expect(new Set(seen).size).toBe(27);
    expect(seen).toEqual(expected.map((row) => string(row.id)));
  }, 15_000);

  it.each(['-1', '01', '1.5', '2147483648', '25x'])(
    'rejects malformed register offset %s instead of returning a default page',
    async (offset) => {
      await createComplaint();
      const response = await request(`/complaints?offset=${offset}`);
      expect(response.status).toBe(400);
      expect(await body(response)).not.toHaveProperty('complaints');
    },
  );

  it('holds one authorized snapshot for register count and rows while another authorized actor commits an intake', async () => {
    const original = await createComplaint();
    const baseline = await request('/complaints');
    expect(baseline.status).toBe(200);
    expect(await body(baseline)).toMatchObject({
      total: 1,
      complaints: [original.saved],
    });
    const member = await request('/access/current-actor', {
      subject: 'complaint-member',
      company: '',
    });
    expect(member.status).toBe(200);
    const membershipId = string((await body(member)).workspaceMembershipId);
    for (const path of [
      '/company-director-client-assignments',
      '/company-complaints-reader-assignments',
      '/company-complaints-recorder-assignments',
    ]) {
      const grant = await request(path, {
        method: 'POST',
        value: { workspaceMembershipId: membershipId, companyId },
      });
      expect(grant.status).toBe(201);
    }
    // Pause at the existing Client owner's live-authority row. This is not a
    // fabricated Reader share lock or a sleep; observe the real database waiter.
    const authority = await hold(async (connection) => {
      await connection.query(
        `SELECT id FROM workspace_permission_grants
        WHERE workspace_id = $1 AND workspace_membership_id = $2
        AND permission = 'client.manage' FOR UPDATE`,
        [workspaceId, original.membershipId],
      );
    });
    const pending = request('/complaints');
    try {
      const readerPid = await blockedBy(authority.pid, 'for share');
      const snapshot = await harness.pool.query<{ held: boolean }>(
        'SELECT backend_xmin IS NOT NULL AS held FROM pg_stat_activity WHERE pid = $1',
        [readerPid],
      );
      expect(snapshot.rows).toEqual([{ held: true }]);
      const concurrent = await request('/complaints', {
        method: 'POST',
        subject: 'complaint-member',
        value: {
          ...original.input,
          responsibleMembershipId: membershipId,
          subject: 'Committed after the register read snapshot',
        },
      });
      expect(concurrent.status).toBe(201);
      const later = await body(concurrent);
      await authority.release();
      const response = await pending;
      expect(response.status).toBe(200);
      const page = await body(response);
      expect(page).toMatchObject({
        total: 1,
        complaints: [original.saved],
        offset: 0,
        pageSize: 25,
      });
      expect(JSON.stringify(page)).not.toContain(later.id);
      const after = await request('/complaints');
      expect(after.status).toBe(200);
      expect(await body(after)).toMatchObject({ total: 2 });
    } finally {
      await authority.release();
      await pending;
    }
  });

  it.each(['action', 'response'] satisfies Array<'action' | 'response'>)(
    'appends literal attributed %s facts with unknown or declared dates and no sending result',
    async (kind) => {
      const original = await createComplaint();
      const before = await journalEffects(original);
      const text = `  Literal ${kind} declaration.\nȘtefan / Иван  `;
      const declaredDate = kind === 'action' ? null : '2024-02-29';
      const command = await appendJournal({
        complaintId: original.id,
        expectedRevision: 1,
        kind,
        text,
        declaredDate,
      });
      expect(command.saved).toEqual({ ...original.saved, revision: 2 });
      const after = await journalEffects(original);
      expect(after.detail).toEqual(command.saved);
      expect(after.history).toMatchObject({
        complaintId: original.id,
        companyId,
        revision: 2,
        total: 2,
        offset: 0,
        pageSize: 25,
      });
      expect(rows(after.history.entries)).toEqual([
        expect.objectContaining({
          kind: 'intake',
          revision: 1,
          intake: original.intake,
        }),
        expect.objectContaining({
          id: expect.any(String),
          kind,
          text,
          declaredDate,
          corrected: false,
          revision: 2,
          actor: {
            workspaceMembershipId: original.membershipId,
            displayLabel: 'Synthetic complaint recorder',
          },
          recordedAt: expect.any(String),
        }),
      ]);
      expect(after.receipts).toBe(before.receipts + 1);
      expect(after.events).toBe(before.events + 1);
      expect(after.client.version).toBe(Number(before.client.version) + 1);
      const journal = rows(after.history.entries)[1];
      if (!journal)
        throw new Error('The attributed journal row is unavailable.');
      expect(Number.isFinite(Date.parse(string(journal.recordedAt)))).toBe(
        true,
      );
      for (const field of [
        'sent',
        'delivered',
        'resolved',
        'closed',
        'status',
      ]) {
        expect(command.saved).not.toHaveProperty(field);
        expect(journal).not.toHaveProperty(field);
      }
    },
  );

  it('retains original and intermediate journal facts across 25-row history pages and always corrects the original', async () => {
    const original = await createComplaint();
    const first = await appendJournal({
      complaintId: original.id,
      expectedRevision: 1,
    });
    const firstHistory = await request(`/complaints/${original.id}/history`);
    expect(firstHistory.status).toBe(200);
    const originalEntry = rows((await body(firstHistory)).entries).find(
      (row) => row.kind === 'action',
    );
    if (!originalEntry)
      throw new Error('The public original action is unavailable.');
    const originalId = string(originalEntry.id);
    const { corrected: originalMarker, ...originalFact } = originalEntry;
    expect(originalMarker).toBe(false);
    let revision = 2;
    // Put the first original and its corrections on distinct real pages.
    for (let index = 0; index < 24; index += 1) {
      const next = await appendJournal({
        complaintId: original.id,
        expectedRevision: revision,
        kind: 'response',
        text: `Independent recorded declaration ${index}`,
      });
      revision += 1;
      expect(next.saved.revision).toBe(revision);
    }
    const corrections: Record<string, unknown>[] = [];
    for (const declaration of [
      {
        text: '  First corrected action.\nLiteral original retained.  ',
        declaredDate: '2026-10-19',
        reason: '  Correcting the declared facts.  ',
      },
      {
        text: '  Later corrected action.  ',
        declaredDate: null,
        reason: '  Date remains unknown after clarification.  ',
      },
    ]) {
      const corrected = await request(
        `/complaints/${original.id}/journal/${originalId}/corrections`,
        {
          method: 'POST',
          value: { ...declaration, expectedRevision: revision },
        },
      );
      expect(corrected.status).toBe(201);
      revision += 1;
      expect(await body(corrected)).toEqual({ ...first.saved, revision });
      corrections.push({ ...declaration, revision });
    }
    const pages: Record<string, unknown>[] = [];
    for (const offset of [0, 25, 50]) {
      const response = await request(
        `/complaints/${original.id}/history?offset=${offset}`,
      );
      expect(response.status).toBe(200);
      const page = await body(response);
      expect(page).toMatchObject({
        complaintId: original.id,
        companyId,
        revision: 28,
        total: 28,
        offset,
        pageSize: 25,
      });
      expect(rows(page.entries).length).toBe(
        Math.max(0, Math.min(25, 28 - offset)),
      );
      pages.push(...rows(page.entries));
    }
    expect(new Set(pages.map((row) => row.id)).size).toBe(28);
    const currentOriginal = pages.find((row) => row.id === originalId);
    expect(currentOriginal).toEqual({ ...originalFact, corrected: true });
    expect(pages.filter((row) => row.kind === 'correction')).toEqual(
      corrections.map((correction) =>
        expect.objectContaining({
          ...correction,
          originalEntryId: originalId,
          originalKind: 'action',
          original: originalFact,
          actor: originalEntry.actor,
          recordedAt: expect.any(String),
        }),
      ),
    );
    const correctionRow = pages.find((row) => row.kind === 'correction');
    if (!correctionRow)
      throw new Error('The public correction row is unavailable.');
    const before = await journalEffects(original);
    const recursive = await request(
      `/complaints/${original.id}/journal/${string(correctionRow.id)}/corrections`,
      {
        method: 'POST',
        value: {
          text: 'Forbidden recursive correction',
          declaredDate: null,
          reason: 'Cannot target a correction.',
          expectedRevision: revision,
        },
      },
    );
    expect(recursive.status).toBe(404);
    expect(await journalEffects(original)).toEqual(before);
  }, 15_000);

  it('replays exact journal receipts before staleness while distinct identical declarations remain new writes', async () => {
    const original = await createComplaint();
    const first = await appendJournal({
      complaintId: original.id,
      expectedRevision: 1,
    });
    const repeatedText = await appendJournal({
      complaintId: original.id,
      expectedRevision: 2,
      text: first.input.text,
    });
    expect(repeatedText.saved.revision).toBe(3);
    const beforeReplay = await journalEffects(original);
    const replay = await request(first.path, {
      method: 'POST',
      key: first.key,
      value: first.input,
    });
    expect(replay.status).toBe(201);
    expect(await body(replay)).toEqual(first.saved);
    for (const change of [
      { ...first.input, text: 'Changed intent under old key' },
      { ...first.input, expectedRevision: 3 },
      { ...first.input, kind: 'response' },
    ]) {
      const conflict = await request(first.path, {
        method: 'POST',
        key: first.key,
        value: change,
      });
      expect(conflict.status).toBe(409);
      expect((await body(conflict)).code).toBe('IDEMPOTENCY_CONFLICT');
    }
    const stale = await request(first.path, {
      method: 'POST',
      value: first.input,
    });
    expect(stale.status).toBe(409);
    expect((await body(stale)).code).toBe('STALE_VERSION');
    const another = await createComplaint();
    const changedTarget = await request(`/complaints/${another.id}/journal`, {
      method: 'POST',
      key: first.key,
      value: { ...first.input, expectedRevision: 1 },
    });
    expect(changedTarget.status).toBe(409);
    expect((await body(changedTarget)).code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await journalEffects(original)).toEqual(beforeReplay);
  });

  it('preserves a journal correction historical receipt and refuses changed target, reason or operation under its key', async () => {
    const original = await createComplaint();
    const action = await appendJournal({
      complaintId: original.id,
      expectedRevision: 1,
    });
    const history = await request(`/complaints/${original.id}/history`);
    expect(history.status).toBe(200);
    const entry = rows((await body(history)).entries).find(
      (row) => row.kind === 'action',
    );
    if (!entry) throw new Error('The public original action is unavailable.');
    const path = `${action.path}/${string(entry.id)}/corrections`;
    const key = randomUUID();
    const input = {
      text: '  Corrected original statement.  ',
      declaredDate: null,
      reason: '  Preserve every earlier statement.  ',
      expectedRevision: 2,
    };
    const corrected = await request(path, {
      method: 'POST',
      key,
      value: input,
    });
    expect(corrected.status).toBe(201);
    const saved = await body(corrected);
    expect(saved).toEqual({ ...original.saved, revision: 3 });
    await appendJournal({
      complaintId: original.id,
      expectedRevision: 3,
      kind: 'response',
    });
    const before = await journalEffects(original);
    const replay = await request(path, { method: 'POST', key, value: input });
    expect(replay.status).toBe(201);
    expect(await body(replay)).toEqual(saved);
    for (const command of [
      { path, value: { ...input, reason: 'Changed correction reason' } },
      {
        path: action.path,
        value: {
          kind: 'response',
          text: input.text,
          declaredDate: null,
          expectedRevision: 4,
        },
      },
      { path: `${action.path}/${randomUUID()}/corrections`, value: input },
    ]) {
      const conflict = await request(command.path, {
        method: 'POST',
        key,
        value: command.value,
      });
      expect(conflict.status).toBe(409);
      expect((await body(conflict)).code).toBe('IDEMPOTENCY_CONFLICT');
    }
    const stale = await request(path, { method: 'POST', value: input });
    expect(stale.status).toBe(409);
    expect((await body(stale)).code).toBe('STALE_VERSION');
    const blankReason = await request(path, {
      method: 'POST',
      value: { ...input, reason: '  ', expectedRevision: 4 },
    });
    expect(blankReason.status).toBe(400);
    const other = await createComplaint();
    const wrongComplaint = await request(
      `/complaints/${other.id}/journal/${string(entry.id)}/corrections`,
      {
        method: 'POST',
        value: { ...input, expectedRevision: 1 },
      },
    );
    expect(wrongComplaint.status).toBe(404);
    expect(await journalEffects(original)).toEqual(before);
  });

  it.each(['reader', 'recorder', 'client'])(
    'denies journal receipt replay and new material writes after losing current %s authority',
    async (lost) => {
      const original = await createComplaint();
      const first = await appendJournal({
        complaintId: original.id,
        expectedRevision: 1,
      });
      const currentHistory = await request(
        `/complaints/${original.id}/history`,
      );
      expect(currentHistory.status).toBe(200);
      const entry = rows((await body(currentHistory)).entries).find(
        (row) => row.kind === 'action',
      );
      if (!entry) throw new Error('The original action is unavailable.');
      const correctionPath = `${first.path}/${string(entry.id)}/corrections`;
      const correctionKey = randomUUID();
      const correctionInput = {
        text: 'Corrected facts before authority loss',
        declaredDate: null,
        reason: 'Retain the original declaration.',
        expectedRevision: 2,
      };
      const correction = await request(correctionPath, {
        method: 'POST',
        key: correctionKey,
        value: correctionInput,
      });
      expect(correction.status).toBe(201);
      expect((await body(correction)).revision).toBe(3);
      const before = await journalEffects(original);
      if (lost === 'client') {
        await harness.pool.query(
          `UPDATE client_company_relationships SET status = 'archived'
          WHERE company_id = $1 AND client_account_id = $2`,
          [companyId, original.clientAccountId],
        );
      } else {
        const revoked = await request(
          `/company-complaints-${lost}-assignments/${original.membershipId}/${companyId}`,
          { method: 'DELETE' },
        );
        expect(revoked.status).toBe(200);
      }
      for (const command of [
        { path: first.path, key: first.key, value: first.input },
        {
          path: first.path,
          key: randomUUID(),
          value: { ...first.input, expectedRevision: 3 },
        },
        { path: correctionPath, key: correctionKey, value: correctionInput },
        {
          path: correctionPath,
          key: randomUUID(),
          value: { ...correctionInput, expectedRevision: 3 },
        },
      ]) {
        const denied = await request(command.path, {
          method: 'POST',
          key: command.key,
          value: command.value,
        });
        expect(denied.status).toBe(lost === 'client' ? 404 : 403);
        const payload = JSON.stringify(await body(denied));
        expect(payload).not.toContain(first.input.text);
        expect(payload).not.toContain(original.intake.subject);
      }
      // Check persisted effects without restoring lost authority or reading a
      // protected record through an unauthorized actor.
      const stored = await harness.pool.query<{
        revision: number;
        receipts: number;
        events: number;
        client_version: number;
      }>(
        `SELECT revision,
        (SELECT count(*)::integer FROM complaint_receipts WHERE complaint_id = $1) AS receipts,
        (SELECT count(*)::integer FROM complaint_events WHERE complaint_id = $1) AS events,
        (SELECT version FROM client_accounts WHERE id = $2) AS client_version
        FROM complaints WHERE id = $1`,
        [original.id, original.clientAccountId],
      );
      expect(stored.rows).toEqual([
        {
          revision: 3,
          receipts: before.receipts,
          events: before.events,
          client_version: before.client.version,
        },
      ]);
    },
  );

  it('preserves authorized superseded-original history and committed receipt while refusing new journal mutations', async () => {
    const original = await createComplaint();
    const first = await appendJournal({
      complaintId: original.id,
      expectedRevision: 1,
    });
    const prior = await request(`/complaints/${original.id}/history`);
    expect(prior.status).toBe(200);
    const priorHistory = await body(prior);
    const action = rows(priorHistory.entries).find(
      (row) => row.kind === 'action',
    );
    if (!action) throw new Error('The original action is unavailable.');
    const canonicalResponse = await request('/clients', {
      method: 'POST',
      value: {
        displayName: 'Synthetic canonical Client',
        taxId: '737-canonical',
      },
    });
    expect(canonicalResponse.status).toBe(201);
    const canonicalId = string((await body(canonicalResponse)).id);
    // Persisted legacy duplicates are a synthetic setup, matching the Client
    // owner's union tests. Supersession itself must use its real public command.
    await harness.pool.query(
      'UPDATE client_accounts SET tax_id = $1 WHERE id = ANY($2::uuid[])',
      ['737-legacy-shared', [original.clientAccountId, canonicalId]],
    );
    const review = await request(
      `/clients/${original.clientAccountId}/union-reviews`,
      { method: 'POST' },
    );
    expect(review.status).toBe(201);
    const comparison = await body(review);
    expect(comparison.outcome).toBe('comparison');
    const united = await request(
      `/client-union-reviews/${string(comparison.reviewReference)}/confirm`,
      {
        method: 'POST',
        value: {
          canonicalClientId: canonicalId,
          fields: {
            displayName: canonicalId,
            taxId: canonicalId,
            address: canonicalId,
            telephone: canonicalId,
            generalEmail: canonicalId,
            businessActivity: canonicalId,
          },
          companyIds: [companyId],
          reviewedDifferences: true,
          reason:
            'Synthetic duplicate identity; preserve the original reference.',
        },
      },
    );
    expect(united.status).toBe(201);
    const statuses = await harness.pool.query<{ status: string }>(
      'SELECT status FROM client_accounts WHERE id = $1',
      [original.clientAccountId],
    );
    expect(statuses.rows).toEqual([{ status: 'superseded' }]);
    const detail = await request(`/complaints/${original.id}`);
    expect(detail.status).toBe(200);
    expect(await body(detail)).toMatchObject({
      id: original.id,
      clientAccountId: original.clientAccountId,
      revision: 2,
    });
    const history = await request(`/complaints/${original.id}/history`);
    expect(history.status).toBe(200);
    expect(await body(history)).toEqual(priorHistory);
    const replay = await request(first.path, {
      method: 'POST',
      key: first.key,
      value: first.input,
    });
    expect(replay.status).toBe(201);
    expect(await body(replay)).toEqual(first.saved);
    for (const command of [
      { path: first.path, input: { ...first.input, expectedRevision: 2 } },
      {
        path: `${first.path}/${string(action.id)}/corrections`,
        input: {
          text: 'New corrected facts',
          declaredDate: null,
          reason: 'New writes require an active original.',
          expectedRevision: 2,
        },
      },
    ]) {
      const denied = await request(command.path, {
        method: 'POST',
        value: command.input,
      });
      expect(denied.status).toBe(404);
    }
    const unchanged = await request(`/complaints/${original.id}/history`);
    expect(unchanged.status).toBe(200);
    expect(await body(unchanged)).toEqual(priorHistory);
  });

  it.each([
    { kind: 'action', text: '   ', declaredDate: null, expectedRevision: 1 },
    {
      kind: 'sent',
      text: 'A declaration is not delivery.',
      declaredDate: null,
      expectedRevision: 1,
    },
    {
      kind: 'response',
      text: 'Impossible date',
      declaredDate: '2025-02-29',
      expectedRevision: 1,
    },
    { kind: 'action', text: 'Missing observed revision', declaredDate: null },
  ])(
    'rejects malformed journal input without recording partial effects: $text',
    async (input) => {
      const original = await createComplaint();
      const before = await journalEffects(original);
      const response = await request(`/complaints/${original.id}/journal`, {
        method: 'POST',
        value: input,
      });
      expect(response.status).toBe(400);
      expect(await journalEffects(original)).toEqual(before);
    },
  );

  it.each([
    { operation: 'append', failurePhase: 'SQL' },
    { operation: 'append', failurePhase: 'COMMIT' },
    { operation: 'correct-journal', failurePhase: 'SQL' },
    { operation: 'correct-journal', failurePhase: 'COMMIT' },
  ])(
    'rolls back a real $operation $failurePhase failure and permits the unchanged safe retry',
    async ({ operation, failurePhase }) => {
      const original = await createComplaint();
      // This real command supplies an original target and makes missing journal
      // implementation fail at a public assertion before any SQL trigger setup.
      await appendJournal({ complaintId: original.id, expectedRevision: 1 });
      const history = await request(`/complaints/${original.id}/history`);
      expect(history.status).toBe(200);
      const action = rows((await body(history)).entries).find(
        (row) => row.kind === 'action',
      );
      if (!action)
        throw new Error('The public original action is unavailable.');
      const path = `/complaints/${original.id}/journal${operation === 'append' ? '' : `/${string(action.id)}/corrections`}`;
      const key = 'complaints737-journal-rollback';
      const input =
        operation === 'append'
          ? {
              kind: 'response',
              text: '  Literal response awaiting safe commit.  ',
              declaredDate: null,
              expectedRevision: 2,
            }
          : {
              text: '  Literal corrected action awaiting safe commit.  ',
              declaredDate: '2026-10-19',
              reason: '  Correcting the original statement without erasure.  ',
              expectedRevision: 2,
            };
      const before = await journalEffects(original);
      const table =
        failurePhase === 'SQL' ? 'complaint_events' : 'complaint_receipts';
      await harness.pool
        .query(`CREATE FUNCTION complaints737_journal_rollback() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF ${failurePhase === 'SQL' ? 'NEW.revision = 3' : "NEW.idempotency_key = 'complaints737-journal-rollback'"} THEN
          RAISE EXCEPTION 'Synthetic journal rollback737';
        END IF;
        RETURN NEW;
      END $$`);
      try {
        await harness.pool.query(
          failurePhase === 'SQL'
            ? 'CREATE TRIGGER complaints737_journal_rollback BEFORE INSERT ON complaint_events FOR EACH ROW EXECUTE FUNCTION complaints737_journal_rollback()'
            : 'CREATE CONSTRAINT TRIGGER complaints737_journal_rollback AFTER INSERT ON complaint_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION complaints737_journal_rollback()',
        );
        const failed = await request(path, {
          method: 'POST',
          key,
          value: input,
        });
        expect(failed.status).toBe(500);
        expect(await journalEffects(original)).toEqual(before);
      } finally {
        // Table is selected from the closed local union above, never HTTP input.
        await harness.pool.query(
          `DROP TRIGGER IF EXISTS complaints737_journal_rollback ON ${table}`,
        );
        await harness.pool.query(
          'DROP FUNCTION complaints737_journal_rollback()',
        );
      }
      const retried = await request(path, {
        method: 'POST',
        key,
        value: input,
      });
      expect(retried.status).toBe(201);
      const committed = await body(retried);
      expect(committed).toEqual({ ...original.saved, revision: 3 });
      const after = await journalEffects(original);
      expect(after.history).toMatchObject({ revision: 3, total: 3 });
      expect(after.receipts).toBe(before.receipts + 1);
      expect(after.events).toBe(before.events + 1);
      expect(after.client.version).toBe(Number(before.client.version) + 1);
      const replay = await request(path, { method: 'POST', key, value: input });
      expect(replay.status).toBe(201);
      expect(await body(replay)).toEqual(committed);
      expect(await journalEffects(original)).toEqual(after);
    },
  );

  // Calendar continuation: public API proof is independent of the prepared App
  // inputs. No inferred SLA, date ordering or automatic date is introduced.
  it.each(['complaintDate', 'responseDueDate'])(
    'rejects year zero in declared intake %s without reserving a receipt or changing saved facts',
    async (field) => {
      const original = await createComplaint();
      const before = await journalEffects(original);
      const invalid = { ...original.intake, [field]: '0000-01-01' };
      const creation = await request('/complaints', {
        method: 'POST',
        value: { ...original.input, ...invalid },
      });
      expect(creation.status).toBe(400);
      const correction = await request(
        `/complaints/${original.id}/intake-corrections`,
        {
          method: 'POST',
          value: {
            ...invalid,
            expectedRevision: 1,
            reason: 'Calendar validation must precede material writes.',
          },
        },
      );
      expect(correction.status).toBe(400);
      expect(await journalEffects(original)).toEqual(before);
      const total = await harness.pool.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM complaints WHERE company_id = $1',
        [companyId],
      );
      expect(total.rows).toEqual([{ count: 1 }]);
    },
  );

  it('round-trips declared intake calendar years0001 and9999 through creation and complete correction without ordering them', async () => {
    const original = await createComplaint();
    const intake = {
      ...original.intake,
      complaintDate: '0001-01-01',
      responseDueDate: '9999-12-31',
    };
    const created = await request('/complaints', {
      method: 'POST',
      value: { ...original.input, ...intake },
    });
    expect(created.status).toBe(201);
    const saved = await body(created);
    expect(saved).toMatchObject({
      revision: 1,
      originalIntake: intake,
      currentIntake: intake,
    });
    const correctedIntake = {
      ...intake,
      complaintDate: '9999-12-31',
      responseDueDate: '0001-01-01',
    };
    const corrected = await request(
      `/complaints/${string(saved.id)}/intake-corrections`,
      {
        method: 'POST',
        value: {
          ...correctedIntake,
          expectedRevision: 1,
          reason: 'Declared facts are not an inferred legal deadline.',
        },
      },
    );
    expect(corrected.status).toBe(201);
    const successor = await body(corrected);
    expect(successor).toMatchObject({
      revision: 2,
      originalIntake: intake,
      currentIntake: correctedIntake,
    });
    const reopened = await request(`/complaints/${string(saved.id)}`);
    expect(reopened.status).toBe(200);
    expect(await body(reopened)).toEqual(successor);
  });

  it('rejects year zero for both new journal facts and motivated corrections without partial effects', async () => {
    const original = await createComplaint();
    await appendJournal({ complaintId: original.id, expectedRevision: 1 });
    const before = await journalEffects(original);
    const action = rows(before.history.entries).find(
      (entry) => entry.kind === 'action',
    );
    if (!action) throw new Error('The original action is unavailable.');
    const appended = await request(`/complaints/${original.id}/journal`, {
      method: 'POST',
      value: {
        kind: 'response',
        text: 'Invalid declared date',
        declaredDate: '0000-01-01',
        expectedRevision: 2,
      },
    });
    expect(appended.status).toBe(400);
    const corrected = await request(
      `/complaints/${original.id}/journal/${string(action.id)}/corrections`,
      {
        method: 'POST',
        value: {
          text: 'Invalid corrected declared date',
          declaredDate: '0000-01-01',
          reason: 'Year zero is not a PostgreSQL calendar date.',
          expectedRevision: 2,
        },
      },
    );
    expect(corrected.status).toBe(400);
    expect(await journalEffects(original)).toEqual(before);
  });

  it('round-trips journal calendar years0001 and9999 while preserving the original declared date', async () => {
    const original = await createComplaint();
    const first = await appendJournal({
      complaintId: original.id,
      expectedRevision: 1,
      declaredDate: '0001-01-01',
    });
    expect(first.saved.revision).toBe(2);
    const current = await request(`/complaints/${original.id}/history`);
    expect(current.status).toBe(200);
    const action = rows((await body(current)).entries).find(
      (entry) => entry.kind === 'action',
    );
    if (!action) throw new Error('The original action is unavailable.');
    const corrected = await request(
      `/complaints/${original.id}/journal/${string(action.id)}/corrections`,
      {
        method: 'POST',
        value: {
          text: 'Corrected factual calendar declaration',
          declaredDate: '9999-12-31',
          reason: 'Retain the earlier declared date.',
          expectedRevision: 2,
        },
      },
    );
    expect(corrected.status).toBe(201);
    expect((await body(corrected)).revision).toBe(3);
    const history = await request(`/complaints/${original.id}/history`);
    expect(history.status).toBe(200);
    expect(rows((await body(history)).entries)).toEqual([
      expect.objectContaining({ kind: 'intake', revision: 1 }),
      expect.objectContaining({
        kind: 'action',
        declaredDate: '0001-01-01',
        corrected: true,
        revision: 2,
      }),
      expect.objectContaining({
        kind: 'correction',
        declaredDate: '9999-12-31',
        revision: 3,
        original: expect.objectContaining({ declaredDate: '0001-01-01' }),
      }),
    ]);
  });

  it.each([
    { operation: 'record', failurePhase: 'SQL' },
    { operation: 'record', failurePhase: 'COMMIT' },
    { operation: 'correct-intake', failurePhase: 'SQL' },
    { operation: 'correct-intake', failurePhase: 'COMMIT' },
  ])(
    'keeps a true $operation $failurePhase failure confidential and atomic, then permits the exact safe retry',
    async ({ operation, failurePhase }) => {
      const original = await createComplaint();
      const subject = 'Synthetic confidential complaint subject737';
      const complainant = 'Synthetic confidential complainant737';
      const severityDescription =
        'Synthetic confidential severity description737';
      const reason = 'Synthetic confidential intake correction reason737';
      const key = 'complaints737-private-failure';
      const path =
        operation === 'record'
          ? '/complaints'
          : `/complaints/${original.id}/intake-corrections`;
      const input =
        operation === 'record'
          ? { ...original.input, subject, complainant, severityDescription }
          : {
              ...original.intake,
              subject,
              complainant,
              severityDescription,
              expectedRevision: 1,
              reason,
            };
      const effects = async () => {
        const result = await harness.pool.query<{
          complaints: string;
          versions: string;
          receipts: string;
          events: string;
        }>(
          `SELECT
        (SELECT count(*)::text FROM complaints WHERE company_id = $1) AS complaints,
        (SELECT count(*)::text FROM complaint_intake_versions WHERE company_id = $1) AS versions,
        (SELECT count(*)::text FROM complaint_receipts WHERE company_id = $1) AS receipts,
        (SELECT count(*)::text FROM complaint_events WHERE company_id = $1) AS events`,
          [companyId],
        );
        const row = result.rows[0];
        if (!row)
          throw new Error('Synthetic Complaint effects are unavailable.');
        return row;
      };
      const before = await effects();
      const clientBefore = await request(
        `/clients/${original.clientAccountId}`,
      );
      expect(clientBefore.status).toBe(200);
      const clientVersion = (await body(clientBefore)).version;
      if (
        typeof clientVersion !== 'number' ||
        !Number.isSafeInteger(clientVersion)
      )
        throw new Error('The synthetic Client version is unavailable.');
      if (failurePhase === 'SQL') {
        await harness.pool.query(`
        CREATE FUNCTION complaints737_private_failure() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.intake->>'subject' = 'Synthetic confidential complaint subject737' THEN
            RAISE EXCEPTION 'Synthetic Complaint driver detail: %, %', NEW.intake, NEW.reason;
          END IF;
          RETURN NEW;
        END $$;
      `);
        await harness.pool.query(`CREATE TRIGGER complaints737_private_failure
        BEFORE INSERT ON complaint_intake_versions FOR EACH ROW
        EXECUTE FUNCTION complaints737_private_failure()`);
      } else {
        await harness.pool.query(`
        CREATE FUNCTION complaints737_private_failure() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE correction_reason text;
        BEGIN
          IF NEW.idempotency_key = 'complaints737-private-failure' THEN
            SELECT reason INTO correction_reason FROM complaint_intake_versions
              WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id
              AND complaint_id = NEW.complaint_id
              AND revision = (NEW.response->>'revision')::integer;
            RAISE EXCEPTION 'Synthetic Complaint driver detail: %, %', NEW.response, correction_reason;
          END IF;
          RETURN NEW;
        END $$;
      `);
        await harness.pool
          .query(`CREATE CONSTRAINT TRIGGER complaints737_private_failure
        AFTER INSERT ON complaint_receipts DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION complaints737_private_failure()`);
      }
      const diagnostics = vi.spyOn(Logger.prototype, 'error');
      const stderr = vi.spyOn(process.stderr, 'write');
      const stdout = vi.spyOn(process.stdout, 'write');
      try {
        new Logger('SyntheticComplaintDiagnostics').error(
          'Synthetic capture control737',
        );
        const failed = await request(path, {
          method: 'POST',
          key,
          value: input,
        });
        expect(failed.status).toBe(500);
        const failedBody = await body(failed);
        expect(await effects()).toEqual(before);
        const reopened = await request(`/complaints/${original.id}`);
        expect(reopened.status).toBe(200);
        expect(await body(reopened)).toEqual(original.saved);
        const clientAfter = await request(
          `/clients/${original.clientAccountId}`,
        );
        expect(clientAfter.status).toBe(200);
        expect((await body(clientAfter)).version).toBe(clientVersion);
        const loggerOutput = diagnostics.mock.calls
          .map((args) => format(...args))
          .join('\n');
        expect(loggerOutput).toContain('Synthetic capture control737');
        const output = [
          JSON.stringify(failedBody),
          loggerOutput,
          ...stderr.mock.calls.map((args) => diagnosticText(args[0])),
          ...stdout.mock.calls.map((args) => diagnosticText(args[0])),
        ].join('\n');
        for (const privateValue of [
          subject,
          complainant,
          severityDescription,
          reason,
          'Failed query:',
          'Synthetic Complaint driver detail:',
          'complaints737_private_failure',
          'insert into "complaint_receipts"',
          'insert into "complaint_intake_versions"',
        ])
          expect(output).not.toContain(privateValue);
      } finally {
        diagnostics.mockRestore();
        stderr.mockRestore();
        stdout.mockRestore();
        if (failurePhase === 'SQL')
          await harness.pool.query(
            'DROP TRIGGER complaints737_private_failure ON complaint_intake_versions',
          );
        else
          await harness.pool.query(
            'DROP TRIGGER complaints737_private_failure ON complaint_receipts',
          );
        await harness.pool.query(
          'DROP FUNCTION complaints737_private_failure()',
        );
      }
      const success = await request(path, {
        method: 'POST',
        key,
        value: input,
      });
      expect(success.status).toBe(201);
      const saved = await body(success);
      expect(saved).toMatchObject({
        companyId,
        clientAccountId: original.clientAccountId,
        revision: operation === 'record' ? 1 : 2,
        currentIntake: { subject, complainant, severityDescription },
      });
      const afterSuccess = await effects();
      expect(Number(afterSuccess.complaints)).toBe(
        Number(before.complaints) + (operation === 'record' ? 1 : 0),
      );
      for (const field of ['versions', 'receipts', 'events'] as const)
        expect(Number(afterSuccess[field])).toBe(Number(before[field]) + 1);
      const replay = await request(path, { method: 'POST', key, value: input });
      expect(replay.status).toBe(201);
      expect(await body(replay)).toEqual(saved);
      expect(await effects()).toEqual(afterSuccess);
      const clientAfterReplay = await request(
        `/clients/${original.clientAccountId}`,
      );
      expect(clientAfterReplay.status).toBe(200);
      expect((await body(clientAfterReplay)).version).toBe(clientVersion + 1);
    },
    15_000,
  );

  it.each([
    { view: 'list', readerState: 'unchanged' },
    { view: 'detail', readerState: 'unchanged' },
    { view: 'history', readerState: 'unchanged' },
    { view: 'list', readerState: 'revoked' },
    { view: 'detail', readerState: 'revoked' },
    { view: 'history', readerState: 'revoked' },
  ])(
    'revalidates $view after a real blocked identity update and $readerState Reader authority',
    async ({ view, readerState }) => {
      const original = await createComplaint();
      const current = await request('/access/current-actor');
      expect(current.status).toBe(200);
      const internalUserId = string((await body(current)).internalUserId);
      // This is the actual AccessService profile-update row, before the feature
      // transaction starts. Do not pretend the unlocked Reader query is a waiter.
      const identity = await hold(async (connection) => {
        await connection.query(
          'UPDATE internal_users SET display_name = display_name WHERE id = $1',
          [internalUserId],
        );
      });
      const path =
        view === 'list'
          ? '/complaints'
          : `/complaints/${original.id}${view === 'history' ? '/history' : ''}`;
      const pending = request(path);
      try {
        await blockedBy(identity.pid, 'update "internal_users"');
        if (readerState === 'revoked') {
          await identity.connection.query(
            `UPDATE company_role_assignments SET revoked_at = now()
          WHERE company_id = $1 AND workspace_membership_id = $2
          AND bundle::text = 'company_complaints_reader' AND revoked_at IS NULL`,
            [companyId, original.membershipId],
          );
        }
        await identity.release();
        const response = await pending;
        expect(response.status).toBe(readerState === 'revoked' ? 403 : 200);
        const value = await body(response);
        if (readerState === 'revoked') {
          expect(JSON.stringify(value)).not.toContain(original.intake.subject);
          expect(value).not.toHaveProperty('complaints');
          expect(value).not.toHaveProperty('entries');
          expect(value).not.toHaveProperty('originalIntake');
        } else if (view === 'list') {
          // Until list() is implemented, this is an ordinary list-contract RED,
          // not evidence that identity synchronization produced PostgreSQL40001.
          expect(value).toMatchObject({
            total: 1,
            complaints: [original.saved],
          });
        } else if (view === 'detail') {
          expect(value).toEqual(original.saved);
        } else {
          expect(value).toMatchObject({
            complaintId: original.id,
            total: 1,
            entries: [{ kind: 'intake', intake: original.intake }],
          });
        }
      } finally {
        await identity.release();
        await pending;
      }
    },
  );

  it.each(['detail', 'history'])(
    'keeps $view valid when identity changes while its real Client-authority read waits',
    async (view) => {
      const original = await createComplaint();
      const current = await request('/access/current-actor');
      expect(current.status).toBe(200);
      const internalUserId = string((await body(current)).internalUserId);
      const authority = await hold(async (connection) => {
        await connection.query(
          `SELECT id FROM workspace_permission_grants
        WHERE workspace_id = $1 AND workspace_membership_id = $2
        AND permission = 'client.manage' FOR UPDATE`,
          [workspaceId, original.membershipId],
        );
      });
      const path = `/complaints/${original.id}${view === 'history' ? '/history' : ''}`;
      const pending = request(path);
      let identity: PoolClient | undefined;
      let update: Promise<unknown> | undefined;
      try {
        const readPid = await blockedBy(authority.pid, 'for share');
        identity = await harness.pool.connect();
        await identity.query('BEGIN');
        await identity.query("SET LOCAL lock_timeout = '1500ms'");
        // This creates the same harmless identity tuple change as profile sync.
        // If the reader already protects identity, observe that real waiter and
        // allow the read to finish before the update. Do not demand weaker locks.
        update = identity.query(
          'UPDATE internal_users SET display_name = display_name WHERE id = $1',
          [internalUserId],
        );
        const observation = new AbortController();
        const identityWaiter = blockedBy(
          readPid,
          'UPDATE internal_users',
          observation.signal,
        );
        let order: 'identity-first' | 'read-first';
        try {
          order = await Promise.race([
            update.then((): 'identity-first' => 'identity-first'),
            identityWaiter.then((): 'read-first' => 'read-first'),
          ]);
        } finally {
          observation.abort();
          await identityWaiter.catch((error: unknown) => {
            if (!(error instanceof DOMException && error.name === 'AbortError'))
              throw error;
          });
        }
        if (order === 'identity-first') await identity.query('COMMIT');
        await authority.release();
        const response = await pending;
        expect(response.status).toBe(200);
        const value = await body(response);
        if (view === 'detail') expect(value).toEqual(original.saved);
        else
          expect(value).toMatchObject({
            complaintId: original.id,
            total: 1,
            entries: [{ kind: 'intake', intake: original.intake }],
          });
        await update;
        if (order === 'read-first') await identity.query('COMMIT');
      } finally {
        await authority.release();
        if (identity) {
          try {
            // A rollback after successful COMMIT is harmless and ensures a failed
            // assertion never returns an open fixture transaction to the pool.
            await identity.query('ROLLBACK');
          } finally {
            identity.release();
          }
        }
        if (update) await update.catch(() => undefined);
        await pending;
      }
    },
  );

  async function hold(acquire: (connection: PoolClient) => Promise<void>) {
    const connection = await harness.pool.connect();
    let released = false;
    try {
      await connection.query('BEGIN');
      await connection.query("SET LOCAL lock_timeout = '1500ms'");
      const result = await connection.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const pid = result.rows[0]?.pid;
      if (pid === undefined)
        throw new Error('Synthetic barrier backend is unavailable.');
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
      try {
        await connection.query('ROLLBACK');
      } finally {
        connection.release();
      }
      throw error;
    }
  }

  async function blockedBy(
    holderPid: number,
    queryFragment: string,
    signal?: AbortSignal,
  ): Promise<number> {
    const deadline = Date.now() + 1500;
    do {
      const result = await harness.pool.query<{ pid: number }>(
        `SELECT pid FROM pg_stat_activity
        WHERE datname = current_database()
        AND $1::integer = ANY(pg_blocking_pids(pid))
        AND position($2::text in query) > 0`,
        [holderPid, queryFragment],
      );
      const waiter = result.rows[0]?.pid;
      if (waiter !== undefined) return waiter;
    } while (!signal?.aborted && Date.now() < deadline);
    if (signal?.aborted)
      throw new DOMException(
        'Synthetic barrier observation cancelled.',
        'AbortError',
      );
    throw new Error(
      'PostgreSQL did not observe the required real holder/waiter barrier.',
    );
  }
});
