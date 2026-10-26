import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import { PDF_A } from '../documents/mission-document.test-support.js';
import { openEstimateOfferFixture, responseRecord, responseString } from '../offer/offer-estimate-preparation.test-support.js';
import { prepareReportedSigning } from './reported-contract-signing.test-support.js';
import { revokeModelContractFixtureGrant } from './model-contract.test-fixture.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Private anonymous whole-case acceptance on current main', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  beforeAll(async () => { scanner = await openDocumentScannerFixture(); fixture = await openEstimateOfferFixture({ scannerEnvironment: scanner.environment }); });
  afterAll(async () => { await fixture?.close(); await scanner?.close(); });
  it('preserves the full approved source, declaration, thirteen exact results/PDFs and ordinary closure across two API restarts', async () => {
    const ready = await prepareReportedSigning(fixture), source = ready.f.ready.source;
    const { target } = ready;
    for (const path of ['/company-project-template-user-assignments', '/company-project-assignments', '/company-task-manager-assignments', '/company-mission-deliverable-access-assignments', '/company-document-project-organizer-assignments', '/company-task-result-recorder-assignments', '/company-project-approver-assignments'])
      await fixture.grant({ path, companyId: target.companyId, membershipId: source.preparerMembershipId });
    async function mutate(method: string, path: string, body: unknown, status: number, key = randomUUID()) {
      const response = await fixture.request({ ...target, path, init: { method, headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) } });
      expect(response.status, path).toBe(status);
      return responseRecord(await response.json());
    }
    function revision(value: unknown) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Missing observed revision'); return value; }
    const offerBefore = await fixture.read({ ...target, path: ready.f.ready.flow.path });
    const project = responseRecord(await fixture.command({ ...target, path: '/projects/from-template', body: { title: 'Representative whole-case pilot DEMO', clientAccountId: source.clientId, templateKey: 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE', templateVersion: 1 } }));
    const projectId = responseString(project, 'id'), declarationKey = randomUUID();
    const declaration = await fixture.command({ ...target, path: ready.path, body: ready.body, key: declarationKey });
    const linkPath = ready.f.ready.path + '/projects', linkKey = randomUUID(), linkBody = { expectedContractRevision: 3, projectId };
    const link = await fixture.command({ ...target, path: linkPath, body: linkBody, key: linkKey });
    const planBefore = await fixture.read({ ...target, path: `/projects/${projectId}/template` });
    expect(responseRecord(responseRecord(planBefore).template).activities).toHaveLength(13);
    const listing = responseRecord(await fixture.read({ ...target, path: `/projects/${projectId}/tasks` }));
    if (!Array.isArray(listing.tasks) || listing.tasks.length !== 13) throw new Error('Expected thirteen ordinary Tasks');
    const rows = listing.tasks.map(responseRecord);
    const responsible = responseRecord(await fixture.read({ ...target, path: `/projects/${projectId}/responsible` }));
    await mutate('PUT', `/projects/${projectId}/responsible`, { expectedRevision: revision(responsible.revision), workspaceMembershipId: source.preparerMembershipId }, 200);
    for (const row of rows)
      await mutate('PATCH', `/tasks/${responseString(row, 'id')}`, { expectedVersion: revision(row.version), assigneeMembershipId: source.preparerMembershipId, dueDate: '2026-12-31' }, 200);
    // Deliberate synthetic human assertions; no automated factual certification.
    await mutate('POST', `/projects/${projectId}/lifecycle-transitions`, { action: 'activate', expectedLifecycleRevision: 0, declaration: { approvedOffer: 'present', contractOrPrecontract: 'present', projectPlan: 'present', initialDocuments: 'present', deadlines: 'present', financialConditions: 'present', risks: 'present' } }, 200);
    const premature = await fixture.post({ ...target, path: `/projects/${projectId}/lifecycle-transitions`, body: { action: 'complete', expectedLifecycleRevision: 1, note: 'Premature closure must refuse' } });
    expect(premature.status).toBe(409);
    const outputs: { taskId: string; documentId: string; versionId: string; declaration: string; bytes: Buffer; recorded: unknown }[] = [];
    for (const [index, row] of rows.entries()) {
      const taskId = responseString(row, 'id'), ordinal = String(index + 1).padStart(2, '0');
      const doc = responseRecord(await fixture.command({ ...target, path: '/documents', body: { type: 'mission-deliverable', clientId: source.clientId, title: 'Representative output ' + ordinal + ' DEMO', purpose: 'Anonymous exact evidence for ordinary activity ' + ordinal } }));
      const documentId = responseString(doc, 'id'), versionId = responseString(responseRecord(doc.version), 'id');
      const bytes = Buffer.from(PDF_A), marker = bytes.indexOf('DEMO');
      if (marker < 0) throw new Error('Missing synthetic PDF marker');
      bytes.write('R' + String(index + 1).padStart(3, '0'), marker, 'ascii');
      const upload = await fixture.request({ ...target, path: `/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=result-${ordinal}-demo.pdf`, init: { method: 'POST', headers: { 'content-type': 'application/pdf', 'idempotency-key': randomUUID() }, body: new Uint8Array(bytes) } });
      expect(upload.status).toBe(201);
      await mutate('POST', `/documents/${documentId}/versions/${versionId}/official-designation`, { expectedRevision: 2 }, 200);
      await fixture.command({ ...target, path: `/documents/${documentId}/project-association`, body: { action: 'link', projectId, expectedRevision: 0 } });
      const task = responseRecord(responseRecord(await fixture.read({ ...target, path: `/tasks/${taskId}` })).task), observedVersion = revision(task.version);
      const text = 'Anonymous result for activity ' + ordinal + ': ' + responseString(row, 'title');
      await fixture.command({ ...target, path: `/tasks/${taskId}/results`, body: { expectedTaskVersion: observedVersion, expectedResultRevision: 0, documentId, versionId, declaration: text } });
      await fixture.command({ ...target, path: `/tasks/${taskId}/complete`, body: { expectedVersion: observedVersion } });
      const recorded = await fixture.read({ ...target, path: `/tasks/${taskId}/results` });
      expect(recorded).toMatchObject({ revision: 1, current: { declaration: text, reference: { documentId, versionId, status: 'official' } } });
      const download = await fixture.request({ ...target, path: `/documents/${documentId}/versions/${versionId}/content` });
      expect(download.status).toBe(200); expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
      outputs.push({ taskId, documentId, versionId, declaration: text, bytes, recorded });
    }
    await fixture.restart();
    expect(await fixture.command({ ...target, path: ready.path, body: ready.body, key: declarationKey })).toEqual(declaration);
    expect(await fixture.command({ ...target, path: linkPath, body: linkBody, key: linkKey })).toEqual(link);
    const after = responseRecord(await fixture.read({ ...target, path: `/projects/${projectId}/tasks` }));
    if (!Array.isArray(after.tasks)) throw new Error('Missing Tasks after restart');
    expect(after.tasks).toHaveLength(13); expect(after.tasks.map(responseRecord).every((row) => row.status === 'done')).toBe(true);
    expect(after.tasks.map(responseRecord).map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort());
    const closeBody = { action: 'complete', expectedLifecycleRevision: 1, note: 'All thirteen ordinary Tasks explicitly completed with exact anonymous result/PDF Versions' }, closeKey = randomUUID();
    const closed = await mutate('POST', `/projects/${projectId}/lifecycle-transitions`, closeBody, 200, closeKey);
    await fixture.restart();
    expect(await mutate('POST', `/projects/${projectId}/lifecycle-transitions`, closeBody, 200, closeKey)).toEqual(closed);
    expect(await fixture.read({ ...target, path: `/projects/${projectId}/lifecycle` })).toMatchObject({ status: 'completed', mutable: false });
    expect(await fixture.read({ ...target, path: `/projects/${projectId}/template` })).toEqual(planBefore);
    expect(await fixture.read({ ...target, path: ready.f.ready.flow.path })).toEqual(offerBefore);
    for (const output of outputs) {
      expect(await fixture.read({ ...target, path: `/tasks/${output.taskId}/results` })).toMatchObject({ mutable: false, current: { declaration: output.declaration, reference: { documentId: output.documentId, versionId: output.versionId } } });
      const download = await fixture.request({ ...target, path: `/documents/${output.documentId}/versions/${output.versionId}/content` });
      expect(download.status).toBe(200); expect(Buffer.from(await download.arrayBuffer())).toEqual(output.bytes);
    }
    expect((await fixture.pool.query<{ count: number }>('SELECT count(*)::int count FROM projects WHERE company_id=$1',[target.companyId])).rows[0]?.count).toBe(1);
    await revokeModelContractFixtureGrant(fixture, '/company-document-content-reader-assignments', target.companyId, source.preparerMembershipId);
    const last = outputs.at(-1); if (!last) throw new Error('Missing last output');
    expect((await fixture.request({ ...target, path: `/documents/${last.documentId}/versions/${last.versionId}/content` })).status).toBe(403);
    expect(await fixture.read({ ...target, path: `/projects/${projectId}/lifecycle` })).toMatchObject({ status: 'completed' });
    const conserved = responseRecord(responseRecord(await fixture.read({ ...target, path: ready.f.ready.path })).contract);
    expect(conserved).toMatchObject({ revision: 4, linkedProjects: [expect.objectContaining({ id: projectId })], version: { executionState: 'EXECUTED', signature: { pdf: { access: 'denied' } } } });
  }, 120_000);
});
