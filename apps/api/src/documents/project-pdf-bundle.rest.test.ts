import { FOREIGN_DOCUMENT_WORKSPACE_ID } from './mission-document.test-support.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { receivedContractEffects } from './received-contract.test-support.js';
import { DocumentPdfStorage } from './document-pdf-storage.js';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
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
  createMissionDocumentFixture,
  json,
  record,
  text,
  PDF_A,
  PDF_B,
  type MissionDocumentFixture,
} from './mission-document.test-support.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Selected Project PDF bundle REST', () => {
  let fixture: MissionDocumentFixture;
  let clientId: string;
  let companyId: string;
  let membershipId: string;
  let projectId: string;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createMissionDocumentFixture(databaseUrl);
  });
  afterAll(async () => {
    await fixture?.close();
  });
  beforeEach(async () => {
    ({ clientId, companyId, membershipId } = await fixture.reset());
    for (const path of [
      '/company-project-assignments',
      '/company-document-project-organizer-assignments',
      '/company-mission-deliverable-access-assignments',
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
    ])
      await fixture.grant(path);
    const project = await fixture.call('/projects', {
      method: 'POST',
      body: { clientAccountId: clientId, title: 'Selected originals DEMO' },
    });
    expect(project.status).toBe(201);
    projectId = text((await json(project)).id);
  });
  async function stored(
    title: string,
    bytes: Buffer,
    associatedProjectId = projectId,
  ) {
    const registered = await fixture.call('/documents', {
      method: 'POST',
      body: {
        type: 'mission-deliverable',
        clientId,
        title,
        purpose: 'Preserve exact selected original',
      },
    });
    expect(registered.status).toBe(201);
    const doc = await json(registered);
    const documentId = text(doc.id);
    const versionId = text(record(doc.version).id);
    expect(
      (await fixture.upload({ documentId, versionId, revision: 1, bytes }))
        .status,
    ).toBe(201);
    const linked = await fixture.call(
      `/documents/${documentId}/project-association`,
      {
        method: 'POST',
        body: {
          projectId: associatedProjectId,
          action: 'link',
          expectedRevision: 0,
        },
      },
    );
    expect(linked.status).toBe(201);
    const history = await json(
      await fixture.call(
        `/documents/${documentId}/versions/${versionId}/content/history`,
      ),
    );
    if (!Array.isArray(history.uploads)) throw new Error('Expected uploads');
    return {
      documentId,
      versionId,
      representationId: text(record(history.uploads[0]).representationId),
      expectedProjectRevision: 1,
    };
  }
  it('collects two explicit originals in selection order with exact bytes and factual identities', async () => {
    const first = await stored('First original DEMO', PDF_A);
    const second = await stored('Second original DEMO', PDF_B);
    const response = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
      method: 'POST',
      body: { items: [second, first] },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Content RED: a successful ZIP with the selected independent original bytes is the contract.
    expect({
      status: response.status,
      contentType: response.headers.get('content-type'),
      signature: [...bytes.slice(0, 4)],
    }).toEqual({
      status: 200,
      contentType: 'application/zip',
      signature: [80, 75, 3, 4],
    });
    const compression: number[] = [];
    const archive = unzipSync(bytes, {
      filter: (file) => {
        compression.push(file.compression);
        return true;
      },
    });
    expect(compression).toEqual([0, 0, 0]);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="selected-project-pdfs.zip"',
    );
    const manifest = record(
      JSON.parse(strFromU8(archive['manifest.json'] ?? new Uint8Array())),
    );
    expect(manifest).toMatchObject({
      formatVersion: 1,
      purpose: 'SELECTED_PROJECT_PDFS',
      projectId,
      companyId,
      clientId,
    });
    const preparedAt = text(manifest.preparedAt);
    expect(new Date(preparedAt).toISOString()).toBe(preparedAt);
    expect(Object.keys(manifest).sort()).toEqual(
      [
        'formatVersion',
        'purpose',
        'preparedAt',
        'projectId',
        'companyId',
        'clientId',
        'entries',
      ].sort(),
    );
    if (!Array.isArray(manifest.entries))
      throw new Error('Expected manifest entries');
    const entries = manifest.entries.map(record);
    expect(entries.map((e) => e.documentId)).toEqual([
      second.documentId,
      first.documentId,
    ]);
    expect(entries[0]).toMatchObject({
      documentId: second.documentId,
      title: 'Second original DEMO',
      versionId: second.versionId,
      versionNumber: 1,
      versionStatus: 'draft',
      representationId: second.representationId,
      originalFileName: 'mission-result.pdf',
    });
    expect(new Set(entries.map((entry) => entry.path)).size).toBe(2);
    for (const [index, original] of [PDF_B, PDF_A].entries()) {
      const entry = entries[index];
      if (!entry) throw new Error('Missing manifest entry');
      expect(text(entry.path)).toMatch(
        /^[0-9]{2}-[a-f0-9-]+-[a-f0-9-]+\.pdf$/u,
      );
      expect(text(entry.path)).toContain(text(entry.documentId));
      expect(text(entry.path)).toContain(text(entry.versionId));
      expect(Buffer.from(archive[text(entry.path)] ?? [])).toEqual(original);
      expect(entry).toMatchObject({
        byteSize: original.length,
        sha256: createHash('sha256').update(original).digest('hex'),
      });
    }
  });
  it('rejects malformed selections, duplicate Versions and 21 entries before releasing any PDF', async () => {
    const item = await stored('Validation original DEMO', PDF_A);
    for (const body of [
      null,
      {},
      { items: [] },
      { items: [item], extra: true },
      { items: [{ ...item, extra: 1 }] },
      { items: [{ ...item, representationId: 'bad' }] },
      { items: [{ ...item, expectedProjectRevision: -1 }] },
      { items: [{ ...item, expectedProjectRevision: 2147483648 }] },
      { items: [{ ...item, expectedProjectRevision: 1.5 }] },
      { items: [item, item] },
      { items: Array.from({ length: 21 }, () => item) },
    ]) {
      const response = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
        method: 'POST',
        body,
      });
      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).not.toBe('application/zip');
    }
  });
  it('refuses a bad later item and stale unlink/relink without a partial archive', async () => {
    const first = await stored('Kept original DEMO', PDF_A);
    const second = await stored('Later original DEMO', PDF_B);
    for (const bad of [
      { ...second, versionId: first.versionId },
      { ...second, representationId: first.representationId },
    ]) {
      const response = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
        method: 'POST',
        body: { items: [first, bad] },
      });
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('Kept original');
    }
    for (const [action, expectedRevision] of [
      ['unlink', 1],
      ['link', 2],
    ])
      expect(
        (
          await fixture.call(
            `/documents/${second.documentId}/project-association`,
            { method: 'POST', body: { projectId, action, expectedRevision } },
          )
        ).status,
      ).toBe(201);
    const response = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
      method: 'POST',
      body: { items: [first, second] },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'project_pdf_bundle_stale',
    });
  });

  it('accepts 20 unique pairs and rejects a 21st without changing native stored facts', async () => {
    const items = [];
    for (let n = 0; n < 20; n++)
      items.push(await stored(`Bounded original ${n} DEMO`, PDF_A));
    const before = await receivedContractEffects(fixture.pool);
    const response = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
      method: 'POST',
      body: { items },
    });
    expect(response.status).toBe(200);
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(archive)).toHaveLength(21);
    expect(
      (
        await fixture.call(`/projects/${projectId}/pdf-bundle`, {
          method: 'POST',
          body: { items: [...items, items[0]] },
        })
      ).status,
    ).toBe(400);
    expect(await receivedContractEffects(fixture.pool)).toEqual(before);
  });
  it('accepts exactly 20 MiB of real preserved PDFs and refuses one additional original', async () => {
    const pdf = await PDFDocument.load(PDF_A);
    const page = pdf.getPages()[0];
    if (!page) throw new Error('Expected page');
    const stream = pdf.context.register(
      PDFRawStream.of(pdf.context.obj({}), new Uint8Array()),
    );
    page.node.set(PDFName.of('Contents'), stream);
    let large = Buffer.from(await pdf.save({ useObjectStreams: false }));
    for (let n = 0; n < 3; n++) {
      const length = 5 * 1024 * 1024 - large.length;
      const current = pdf.context.lookup(stream);
      if (!(current instanceof PDFRawStream))
        throw new Error('Expected raw stream');
      pdf.context.assign(
        stream,
        PDFRawStream.of(
          pdf.context.obj({}),
          Buffer.alloc(current.contents.length + length, 32),
        ),
      );
      large = Buffer.from(await pdf.save({ useObjectStreams: false }));
    }
    expect(large.length).toBe(5 * 1024 * 1024);
    const items = [];
    for (let n = 0; n < 4; n++)
      items.push(await stored(`Five MiB original ${n} DEMO`, large));
    const extra = await stored('Over bound DEMO', PDF_B);
    const accepted = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
      method: 'POST',
      body: { items },
    });
    expect(accepted.status).toBe(200);
    const bytes = new Uint8Array(await accepted.arrayBuffer());
    expect(bytes.byteLength).toBeLessThanOrEqual(21 * 1024 * 1024);
    const archive = unzipSync(bytes);
    const pdfs = Object.entries(archive).filter(([path]) =>
      path.endsWith('.pdf'),
    );
    expect(pdfs).toHaveLength(4);
    for (const [, bytes] of pdfs) {
      expect(Buffer.from(bytes).equals(large)).toBe(true);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        createHash('sha256').update(large).digest('hex'),
      );
    }
    const refused = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
      method: 'POST',
      body: { items: [...items, extra] },
    });
    expect(refused.status).toBe(413);
    expect(refused.headers.get('content-type')).not.toBe('application/zip');
  });
  it('keeps an earlier draft upload and historical Version exact after later upload/designation', async () => {
    const first = await stored('Historical original DEMO', PDF_A);
    await fixture.grant('/company-document-approver-assignments');
    expect(
      (await fixture.upload({ ...first, revision: 2, bytes: PDF_B })).status,
    ).toBe(201);
    expect(
      (
        await fixture.call(
          `/documents/${first.documentId}/versions/${first.versionId}/official-designation`,
          { method: 'POST', body: { expectedRevision: 3 } },
        )
      ).status,
    ).toBe(200);
    const drafted = await fixture.call(
      `/documents/${first.documentId}/versions`,
      { method: 'POST', body: { expectedRevision: 4 } },
    );
    expect(drafted.status).toBe(201);
    const versionId = text((await json(drafted)).versionId);
    expect(
      (
        await fixture.upload({
          documentId: first.documentId,
          versionId,
          revision: 5,
          bytes: PDF_B,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.call(
          `/documents/${first.documentId}/versions/${versionId}/official-designation`,
          { method: 'POST', body: { expectedRevision: 6 } },
        )
      ).status,
    ).toBe(200);
    const history = await json(
      await fixture.call(
        `/documents/${first.documentId}/versions/${versionId}/content/history`,
      ),
    );
    if (!Array.isArray(history.uploads)) throw new Error('Expected uploads');
    const second = {
      ...first,
      versionId,
      representationId: text(record(history.uploads[0]).representationId),
    };
    const before = await receivedContractEffects(fixture.pool);
    const response = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
      method: 'POST',
      body: { items: [first, second] },
    });
    expect(response.status).toBe(200);
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const manifest = record(
      JSON.parse(strFromU8(archive['manifest.json'] ?? new Uint8Array())),
    );
    if (!Array.isArray(manifest.entries)) throw new Error('Expected entries');
    expect(
      manifest.entries.map((entry) => record(entry).versionStatus),
    ).toEqual(['superseded', 'official']);
    const originals = Object.entries(archive)
      .filter(([path]) => path.endsWith('.pdf'))
      .map(([, bytes]) => Buffer.from(bytes));
    expect(originals).toEqual([PDF_A, PDF_B]);
    const individual = await fixture.call(
      `/documents/${first.documentId}/versions/${first.versionId}/content/${first.representationId}`,
    );
    expect(individual.status).toBe(200);
    expect(Buffer.from(await individual.arrayBuffer())).toEqual(PDF_A);
    expect(await receivedContractEffects(fixture.pool)).toEqual(before);
  });
  it.each(['content', 'family', 'project', 'document', 'suspension'] as const)(
    'refuses current %s access loss without disclosing any original',
    async (kind) => {
      const item = await stored('Protected original DEMO', PDF_A);
      if (kind === 'suspension')
        await fixture.pool.query(
          "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
          [membershipId],
        );
      else {
        const path = {
          content: 'document-content-reader',
          family: 'mission-deliverable-access',
          project: 'project',
          document: 'document-registrar',
        }[kind];
        expect(
          (
            await fixture.call(
              `/company-${path}-assignments/${membershipId}/${companyId}`,
              { method: 'DELETE', company: null },
            )
          ).status,
        ).toBe(200);
      }
      const before = await receivedContractEffects(fixture.pool);
      const response = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
        method: 'POST',
        body: { items: [item] },
      });
      expect([401, 403, 404]).toContain(response.status);
      expect(await response.text()).not.toContain('Protected original');
      expect(await receivedContractEffects(fixture.pool)).toEqual(before);
    },
  );
  it('reports corrupted native storage as unavailable and never returns a good earlier PDF partially', async () => {
    const first = await stored('Good original DEMO', PDF_A);
    const second = await stored('Damaged original DEMO', PDF_B);
    await fixture.pool.query('ALTER TABLE document_pdfs DISABLE TRIGGER USER');
    try {
      await fixture.pool.query(
        'UPDATE document_pdfs SET content=$2 WHERE id=$1',
        [second.representationId, PDF_A],
      );
    } finally {
      await fixture.pool.query('ALTER TABLE document_pdfs ENABLE TRIGGER USER');
    }
    const before = await receivedContractEffects(fixture.pool);
    const response = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
      method: 'POST',
      body: { items: [first, second] },
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('Good original');
    expect(await receivedContractEffects(fixture.pool)).toEqual(before);
  });
  it.each(['association', 'authority'] as const)(
    'uses one read-only snapshot when a real concurrent %s change commits between reads',
    async (kind) => {
      const first = await stored('First snapshot DEMO', PDF_A);
      const second = await stored('Second snapshot DEMO', PDF_B);
      let reached: () => void = () => {};
      let release: () => void = () => {};
      const atRead = new Promise<void>((r) => {
        reached = r;
      });
      const continueRead = new Promise<void>((r) => {
        release = r;
      });
      const original = DocumentPdfStorage.prototype.read;
      let held = false;
      // Controlled barrier AFTER a real adapter/PG read; every native authorization/storage read still runs.
      const scheduled = vi
        .spyOn(DocumentPdfStorage.prototype, 'read')
        .mockImplementation(async function (this: DocumentPdfStorage, input) {
          const result = await original.call(this, input);
          if (!held && input.representationId === first.representationId) {
            held = true;
            reached();
            await continueRead;
          }
          return result;
        });
      const pending = fixture.call(`/projects/${projectId}/pdf-bundle`, {
        method: 'POST',
        body: { items: [first, second] },
      });
      try {
        await Promise.race([
          atRead,
          pending.then(() => {
            throw new Error('Bundle finished before barrier');
          }),
        ]);
        if (kind === 'association') {
          for (const [action, expectedRevision] of [
            ['unlink', 1],
            ['link', 2],
          ])
            expect(
              (
                await fixture.call(
                  `/documents/${second.documentId}/project-association`,
                  {
                    method: 'POST',
                    body: { projectId, action, expectedRevision },
                  },
                )
              ).status,
            ).toBe(201);
        } else
          expect(
            (
              await fixture.call(
                `/company-document-content-reader-assignments/${membershipId}/${companyId}`,
                { method: 'DELETE', company: null },
              )
            ).status,
          ).toBe(200);
        const afterMutation = await receivedContractEffects(fixture.pool);
        release();
        const response = await pending;
        expect(response.status).toBe(200);
        expect(
          Object.entries(
            unzipSync(new Uint8Array(await response.arrayBuffer())),
          )
            .filter(([path]) => path.endsWith('.pdf'))
            .map(([, b]) => Buffer.from(b)),
        ).toEqual([PDF_A, PDF_B]);
        const later = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
          method: 'POST',
          body: { items: [first, second] },
        });
        expect(later.status).toBe(kind === 'association' ? 409 : 403);
        expect(await receivedContractEffects(fixture.pool)).toEqual(
          afterMutation,
        );
      } finally {
        release();
        scheduled.mockRestore();
        await pending.catch(() => undefined);
      }
    },
  );
  it('rejects stale captured Client authority revoked before the read snapshot is established', async () => {
    const item = await stored('Original Client boundary DEMO', PDF_A);
    let reached: () => void = () => {};
    let release: () => void = () => {};
    const atRead = new Promise<void>((r) => {
      reached = r;
    });
    const continued = new Promise<void>((r) => {
      release = r;
    });
    const original =
      ClientOperationalReferenceService.prototype
        .requireReferenceReadAuthorityWithinReadTransaction;
    // Barrier before the first snapshot query, after ActorContextAdapter captured the actor.
    const scheduled = vi
      .spyOn(
        ClientOperationalReferenceService.prototype,
        'requireReferenceReadAuthorityWithinReadTransaction',
      )
      .mockImplementation(async function (
        this: ClientOperationalReferenceService,
        actor,
      ) {
        reached();
        await continued;
        return original.call(this, actor);
      });
    const pending = fixture.call(`/projects/${projectId}/pdf-bundle`, {
      method: 'POST',
      body: { items: [item] },
    });
    try {
      await Promise.race([
        atRead,
        pending.then(() => {
          throw new Error('Expected pre-snapshot barrier');
        }),
      ]);
      await fixture.pool.query(
        "DELETE FROM workspace_permission_grants WHERE workspace_membership_id=$1 AND permission='client.manage'",
        [membershipId],
      );
      release();
      const response = await pending;
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('Original Client boundary');
    } finally {
      release();
      scheduled.mockRestore();
      await pending.catch(() => undefined);
    }
  });
  it.each([
    'company_document_content_reader',
    'company_mission_deliverable_access',
    'company_project_access',
    'company_document_registrar',
  ] as const)(
    'fails closed for an unknown captured %s version',
    async (bundle) => {
      const item = await stored('Captured authority DEMO', PDF_A);
      const assignment = await fixture.pool.query<{
        id: string;
        permission_set_version: string;
      }>(
        'SELECT id,permission_set_version FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle=$3',
        [companyId, membershipId, bundle],
      );
      const captured = assignment.rows[0];
      if (!captured) throw new Error('Missing test assignment');
      const definition = await fixture.pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
      );
      const check = definition.rows[0]?.definition;
      if (!check?.startsWith('CHECK ('))
        throw new Error('Expected owned version CHECK');
      // Model a future provider/database capture only within this disposable fixture.
      await fixture.pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        await fixture.pool.query(
          "UPDATE company_role_assignments SET permission_set_version='future-v99' WHERE id=$1",
          [captured.id],
        );
        const response = await fixture.call(
          `/projects/${projectId}/pdf-bundle`,
          { method: 'POST', body: { items: [item] } },
        );
        expect([403, 404]).toContain(response.status);
        expect(await response.text()).not.toContain('Captured authority');
      } finally {
        await fixture.pool.query(
          'UPDATE company_role_assignments SET permission_set_version=$1 WHERE id=$2',
          [captured.permission_set_version, captured.id],
        );
        await fixture.pool.query(
          `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${check}`,
        );
      }
    },
  );
  it('retains native closed Project and superseded-original Client reads without permitting writes', async () => {
    const item = await stored('Historical original Client DEMO', PDF_A);
    await fixture.grant('/company-project-approver-assignments');
    expect(
      (
        await fixture.call(`/projects/${projectId}/lifecycle-transitions`, {
          method: 'POST',
          body: {
            action: 'cancel',
            expectedLifecycleRevision: 0,
            reason: 'Synthetic closed read proof',
          },
        })
      ).status,
    ).toBe(200);
    await fixture.grant('/company-director-client-assignments');
    const second = await fixture.call('/clients', {
      method: 'POST',
      body: { displayName: 'Current canonical DEMO' },
    });
    expect(second.status).toBe(201);
    const canonical = text((await json(second)).id);
    await fixture.pool.query(
      "UPDATE client_accounts SET tax_id='BUNDLE-UNION-DEMO' WHERE id=ANY($1::uuid[])",
      [[clientId, canonical]],
    );
    const reviewed = await fixture.call(`/clients/${clientId}/union-reviews`, {
      method: 'POST',
      body: {},
    });
    expect(reviewed.status).toBe(201);
    const review = text((await json(reviewed)).reviewReference);
    const united = await fixture.call(
      `/client-union-reviews/${review}/confirm`,
      {
        method: 'POST',
        body: {
          canonicalClientId: canonical,
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
          reason: 'Preserve original PDF identities',
        },
      },
    );
    expect(united.status).toBe(201);
    const before = await receivedContractEffects(fixture.pool);
    const response = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
      method: 'POST',
      body: { items: [item] },
    });
    expect(response.status).toBe(200);
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const manifest = record(
      JSON.parse(strFromU8(archive['manifest.json'] ?? new Uint8Array())),
    );
    expect(manifest.clientId).toBe(clientId);
    expect(
      Object.entries(archive)
        .filter(([path]) => path.endsWith('.pdf'))
        .map(([, bytes]) => Buffer.from(bytes)),
    ).toEqual([PDF_A]);
    expect(await receivedContractEffects(fixture.pool)).toEqual(before);
    const individual = await fixture.call(
      `/documents/${item.documentId}/versions/${item.versionId}/content/${item.representationId}`,
    );
    expect(individual.status).toBe(200);
    expect(Buffer.from(await individual.arrayBuffer())).toEqual(PDF_A);
    expect([404, 409]).toContain(
      (
        await fixture.call(
          `/documents/${item.documentId}/project-association`,
          {
            method: 'POST',
            body: { projectId, action: 'unlink', expectedRevision: 1 },
          },
        )
      ).status,
    );
  });
  it('returns unavailable on native storage failure and never converts it to absent content', async () => {
    const item = await stored('Unavailable original DEMO', PDF_A);
    const before = await receivedContractEffects(fixture.pool);
    await fixture.pool.query(
      'ALTER TABLE document_pdfs RENAME TO temporarily_unavailable_document_pdfs',
    );
    try {
      const response = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
        method: 'POST',
        body: { items: [item] },
      });
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('Unavailable original');
    } finally {
      await fixture.pool.query(
        'ALTER TABLE temporarily_unavailable_document_pdfs RENAME TO document_pdfs',
      );
    }
    expect(await receivedContractEffects(fixture.pool)).toEqual(before);
  });
  it('uses exactly one native read-only repeatable-read bundle transaction without locking or business writes', async () => {
    const item = await stored('Snapshot footprint DEMO', PDF_A);
    const before = await receivedContractEffects(fixture.pool);
    const measured = await fixture.measureApplicationQueries(() =>
      fixture.call(`/projects/${projectId}/pdf-bundle`, {
        method: 'POST',
        body: { items: [item] },
      }),
    );
    expect(measured.value.status).toBe(200);
    const start = measured.queries.findIndex((query) =>
      /^begin isolation level repeatable read read only$/iu.test(query),
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const bundle = measured.queries.slice(start);
    expect(bundle.at(-1)).toBe('commit');
    expect(bundle.filter((query) => /^begin/iu.test(query))).toHaveLength(1);
    expect(bundle.join(' ')).not.toMatch(
      /for share|for update|insert into|delete from|update "/iu,
    );
    expect(await receivedContractEffects(fixture.pool)).toEqual(before);
  });

  it('refuses missing and foreign-scope originals without exposing a permitted good prefix', async () => {
    const item = await stored('Local confidential original DEMO', PDF_A);
    const other = await fixture.call('/companies', {
      method: 'POST',
      company: null,
      body: { displayName: 'Other scope DEMO' },
    });
    expect(other.status).toBe(201);
    const otherCompany = text((await json(other)).id);
    for (const path of [
      '/company-project-assignments',
      '/company-document-registrar-assignments',
      '/company-document-content-reader-assignments',
    ])
      expect(
        (
          await fixture.call(path, {
            method: 'POST',
            company: null,
            body: {
              companyId: otherCompany,
              workspaceMembershipId: membershipId,
            },
          })
        ).status,
      ).toBe(201);
    const wrongCompany = await fixture.call(
      `/projects/${projectId}/pdf-bundle`,
      { method: 'POST', company: otherCompany, body: { items: [item] } },
    );
    expect(wrongCompany.status).toBe(404);
    expect(await wrongCompany.text()).not.toContain('Local confidential');
    // Explicit synthetic admission/administration fixture; business records still use native REST in the same database.
    await fixture.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)', [
      FOREIGN_DOCUMENT_WORKSPACE_ID,
      'Foreign PDF Workspace DEMO',
    ]);
    const identity = {
      subject: 'foreign-document-member',
      displayName: 'Foreign fixture reader',
      email: 'foreign@example.test',
    };
    const actor = await json(
      await fixture.call('/access/current-actor', { company: null, identity }),
    );
    const foreignMembership = text(actor.workspaceMembershipId);
    expect(actor.workspaceId).toBe(FOREIGN_DOCUMENT_WORKSPACE_ID);
    for (const permission of [
      'company.manage',
      'company.assignment.manage',
      'client.manage',
    ])
      await fixture.pool.query(
        'INSERT INTO workspace_permission_grants(workspace_id,workspace_membership_id,permission) VALUES($1,$2,$3)',
        [FOREIGN_DOCUMENT_WORKSPACE_ID, foreignMembership, permission],
      );
    const foreignCompany = await fixture.call('/companies', {
      method: 'POST',
      company: null,
      identity,
      body: { displayName: 'Foreign Company DEMO' },
    });
    expect(foreignCompany.status).toBe(201);
    const foreignCompanyId = text((await json(foreignCompany)).id);
    for (const path of [
      '/company-document-registrar-assignments',
      '/company-mission-deliverable-access-assignments',
    ])
      expect(
        (
          await fixture.call(path, {
            method: 'POST',
            company: null,
            identity,
            body: {
              companyId: foreignCompanyId,
              workspaceMembershipId: foreignMembership,
            },
          })
        ).status,
      ).toBe(201);
    const foreignClient = await fixture.call('/clients', {
      method: 'POST',
      company: foreignCompanyId,
      identity,
      body: { displayName: 'Foreign Client DEMO' },
    });
    expect(foreignClient.status).toBe(201);
    const foreignClientId = text((await json(foreignClient)).id);
    const foreignDocument = await fixture.call('/documents', {
      method: 'POST',
      company: foreignCompanyId,
      identity,
      body: {
        type: 'mission-deliverable',
        clientId: foreignClientId,
        title: 'Foreign Workspace DEMO',
        purpose: 'Separate immutable scope',
      },
    });
    expect(foreignDocument.status).toBe(201);
    const doc = await json(foreignDocument);
    const wrong = {
      ...item,
      documentId: text(doc.id),
      versionId: text(record(doc.version).id),
    };
    const denied = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
      method: 'POST',
      body: { items: [item, wrong] },
    });
    expect(denied.status).toBe(404);
    expect(await denied.text()).not.toContain('Local confidential');
  });
  it('reports an authorized stale removed association as a conflict before any file response', async () => {
    const item = await stored('Removed selected original DEMO', PDF_A);
    expect(
      (
        await fixture.call(
          `/documents/${item.documentId}/project-association`,
          {
            method: 'POST',
            body: { projectId, action: 'unlink', expectedRevision: 1 },
          },
        )
      ).status,
    ).toBe(201);
    const response = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
      method: 'POST',
      body: { items: [item] },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'project_pdf_bundle_stale',
    });
  });
  it('keeps another same-Client Project unrelated404 even for a changed claimed revision after a good earlier item', async () => {
    const first = await stored('Permitted selected original DEMO', PDF_A);
    const project = await fixture.call('/projects', {
      method: 'POST',
      body: {
        clientAccountId: clientId,
        title: 'Unrelated same-Client Project DEMO',
      },
    });
    expect(project.status).toBe(201);
    const otherProject = text((await json(project)).id);
    const unrelated = await stored(
      'Unrelated confidential original DEMO',
      PDF_B,
      otherProject,
    );
    const before = await receivedContractEffects(fixture.pool);
    for (const expectedProjectRevision of [0, 1]) {
      const response = await fixture.call(`/projects/${projectId}/pdf-bundle`, {
        method: 'POST',
        body: { items: [first, { ...unrelated, expectedProjectRevision }] },
      });
      expect(response.status).toBe(404);
      const refused = await response.text();
      expect(refused).not.toContain('Permitted selected');
      expect(refused).not.toContain('Unrelated confidential');
      expect(response.headers.get('content-type')).not.toBe('application/zip');
    }
    expect(await receivedContractEffects(fixture.pool)).toEqual(before);
  });
  it('allows an independent read-only collaborator under known Client captures and refuses missing, future or revoked Client read', async () => {
    const item = await stored('Collaborator read-only original DEMO', PDF_A);
    const identity = {
      subject: 'mission-collaborator',
      displayName: 'Read-only collaborator',
      email: 'reader@example.test',
    };
    const actor = await json(
      await fixture.call('/access/current-actor', { identity, company: null }),
    );
    const member = text(actor.workspaceMembershipId);
    for (const path of [
      '/company-director-client-assignments',
      '/company-project-assignments',
      '/company-document-registrar-assignments',
      '/company-document-content-reader-assignments',
      '/company-mission-deliverable-access-assignments',
    ])
      expect(
        (
          await fixture.call(path, {
            method: 'POST',
            company: null,
            body: { companyId, workspaceMembershipId: member },
          })
        ).status,
      ).toBe(201);
    // Legacy known Registrar v1 has no Version-management or content-upload authority.
    await fixture.pool.query(
      "UPDATE company_role_assignments SET permission_set_version='v1' WHERE workspace_membership_id=$1 AND company_id=$2 AND bundle='company_document_registrar'",
      [member, companyId],
    );
    const read = () =>
      fixture.call(`/projects/${projectId}/pdf-bundle`, {
        method: 'POST',
        identity,
        body: { items: [item] },
      });
    for (const version of ['v2', 'v1']) {
      await fixture.pool.query(
        "UPDATE company_role_assignments SET permission_set_version=$1 WHERE workspace_membership_id=$2 AND company_id=$3 AND bundle='company_director_client_access'",
        [version, member, companyId],
      );
      const response = await read();
      expect(response.status).toBe(200);
      expect(
        Object.entries(unzipSync(new Uint8Array(await response.arrayBuffer())))
          .filter(([path]) => path.endsWith('.pdf'))
          .map(([, bytes]) => Buffer.from(bytes)),
      ).toEqual([PDF_A]);
    }
    const definition = await fixture.pool.query<{ definition: string }>(
      "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
    );
    const check = definition.rows[0]?.definition;
    if (!check?.startsWith('CHECK ('))
      throw new Error('Expected owned version CHECK');
    await fixture.pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      for (const version of [null, 'future-v99']) {
        await fixture.pool.query(
          "UPDATE company_role_assignments SET permission_set_version=$1 WHERE workspace_membership_id=$2 AND company_id=$3 AND bundle='company_director_client_access'",
          [version, member, companyId],
        );
        expect((await read()).status).toBe(403);
      }
    } finally {
      await fixture.pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v2' WHERE workspace_membership_id=$1 AND company_id=$2 AND bundle='company_director_client_access'",
        [member, companyId],
      );
      await fixture.pool.query(
        `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${check}`,
      );
    }
    expect(
      (
        await fixture.call(
          `/company-director-client-assignments/${member}/${companyId}`,
          { method: 'DELETE', company: null },
        )
      ).status,
    ).toBe(200);
    expect((await read()).status).toBe(403);
  });
});
