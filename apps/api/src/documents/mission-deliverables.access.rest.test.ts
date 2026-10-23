import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  PDF_A,
  type MissionDocumentFixture,
} from './mission-document.test-support.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('D3 mission-deliverable authority REST', () => {
  let fixture: MissionDocumentFixture;
  let companyId: string;
  let membershipId: string;
  let clientId: string;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createMissionDocumentFixture(databaseUrl);
  });
  afterAll(async () => {
    await fixture?.close();
  });
  beforeEach(async () => {
    ({ companyId, membershipId, clientId } = await fixture.reset());
  });
  const call = (...args: Parameters<MissionDocumentFixture['call']>) =>
    fixture.call(...args);
  const grant = (...args: Parameters<MissionDocumentFixture['grant']>) =>
    fixture.grant(...args);
  const upload = (...args: Parameters<MissionDocumentFixture['upload']>) =>
    fixture.upload(...args);
  it('revokes mission metadata, content, history, Project discovery and Activity without hiding ordinary questionnaires', async () => {
    await grant('/company-mission-deliverable-access-assignments');
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    await grant('/company-project-assignments');
    await grant('/company-document-project-organizer-assignments');
    const projectResponse = await call('/projects', {
      method: 'POST',
      body: { title: 'Mission Project DEMO', clientAccountId: clientId },
    });
    expect(projectResponse.status).toBe(201);
    const projectId = text((await json(projectResponse)).id);
    const ordinaryResponse = await call('/documents', {
      method: 'POST',
      body: {
        clientId,
        title: 'Ordinary questionnaire DEMO',
        purpose: 'Ordinary visible reference',
        url: 'https://example.test/ordinary',
      },
    });
    expect(ordinaryResponse.status).toBe(201);
    const ordinaryId = text((await json(ordinaryResponse)).id);
    const registration = {
      type: 'mission-deliverable',
      clientId,
      title: 'Protected mission DEMO',
      purpose: 'Private preserved result',
    };
    const response = await call('/documents', {
      method: 'POST',
      body: registration,
      key: 'protected-mission-registration',
    });
    expect(response.status).toBe(201);
    const document = await json(response);
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    const other = await call('/documents', {
      method: 'POST',
      body: { ...registration, title: 'Unlinked mission DEMO' },
    });
    expect(other.status).toBe(201);
    const otherId = text((await json(other)).id);
    expect(
      (
        await upload({
          documentId,
          versionId,
          revision: 1,
          bytes: PDF_A,
          key: 'protected-pdf-upload',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call(`/documents/${documentId}`, {
          method: 'PATCH',
          body: {
            expectedRevision: 2,
            title: 'Protected revised mission DEMO',
          },
          key: 'protected-mission-correction',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(`/documents/${documentId}/project-association`, {
          method: 'POST',
          body: { action: 'link', projectId, expectedRevision: 0 },
          key: 'protected-mission-link',
        })
      ).status,
    ).toBe(201);
    const visibleActivity = await call('/activity-log');
    expect(visibleActivity.status).toBe(200);
    expect(await visibleActivity.text()).toContain(documentId);
    const revoked = await call(
      `/company-mission-deliverable-access-assignments/${membershipId}/${companyId}`,
      { method: 'DELETE', company: null },
    );
    expect(revoked.status).toBe(200);
    const listing = await call('/documents');
    expect(listing.status).toBe(200);
    const listText = await listing.text();
    expect(listText).toContain(ordinaryId);
    expect(listText).not.toContain(documentId);
    expect(listText).not.toContain(otherId);
    for (const path of [
      `/documents/${documentId}`,
      `/documents/${documentId}/versions`,
      `/documents/${documentId}/correction-history`,
      `/documents/${documentId}/versions/${versionId}/content`,
      `/documents/${documentId}/versions/${versionId}/content/history`,
    ]) {
      expect((await call(path)).status, path).toBe(404);
    }
    const linked = await call(`/projects/${projectId}/documents`);
    expect(linked.status).toBe(200);
    expect(await linked.json()).toMatchObject({ documents: [] });
    const eligible = await call(`/projects/${projectId}/eligible-documents`);
    expect(eligible.status).toBe(200);
    const eligibleText = await eligible.text();
    expect(eligibleText).toContain(ordinaryId);
    expect(eligibleText).not.toContain(otherId);
    const hiddenActivity = await call('/activity-log');
    expect(hiddenActivity.status).toBe(200);
    const activityText = await hiddenActivity.text();
    expect(activityText).toContain(ordinaryId);
    expect(activityText).not.toContain(documentId);
    expect(activityText).not.toContain(otherId);
    expect(activityText).not.toContain('Protected revised mission DEMO');
    expect(
      (
        await call('/documents', {
          method: 'POST',
          body: registration,
          key: 'protected-mission-registration',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await upload({
          documentId,
          versionId,
          revision: 1,
          bytes: PDF_A,
          key: 'protected-pdf-upload',
        })
      ).status,
    ).toBe(404);
    expect(fixture.scanCount).toBe(1);
    expect(
      (
        await call(`/documents/${documentId}`, {
          method: 'PATCH',
          body: {
            expectedRevision: 2,
            title: 'Protected revised mission DEMO',
          },
          key: 'protected-mission-correction',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(`/documents/${documentId}/project-association`, {
          method: 'POST',
          body: { action: 'link', projectId, expectedRevision: 0 },
          key: 'protected-mission-link',
        })
      ).status,
    ).toBe(404);
  });

  it('exposes a captured family assignment lifetime and changes it after explicit revoke and regrant', async () => {
    const first = await grant(
      '/company-mission-deliverable-access-assignments',
    );
    expect(first).toMatchObject({
      bundle: 'Company Mission Deliverable Access',
      permissionSetVersion: 'v1',
      active: true,
    });
    const firstActor = record(
      (await json(await call('/access/current-actor'))).activeCompany,
    );
    expect(firstActor).toMatchObject({
      missionDeliverableAccessAssignmentId: text(first.id),
      missionDeliverableAccessPermissionSetVersion: 'v1',
    });
    expect(
      (
        await call(
          `/company-mission-deliverable-access-assignments/${membershipId}/${companyId}`,
          { method: 'DELETE', company: null },
        )
      ).status,
    ).toBe(200);
    const retired = record(
      (await json(await call('/access/current-actor'))).activeCompany,
    );
    expect(retired.documentPermissions).not.toContain(
      'document.mission_deliverable.access',
    );
    expect(retired).not.toHaveProperty('missionDeliverableAccessAssignmentId');
    const next = await grant('/company-mission-deliverable-access-assignments');
    expect(next.id).not.toBe(first.id);
    const nextActor = record(
      (await json(await call('/access/current-actor'))).activeCompany,
    );
    expect(nextActor).toMatchObject({
      missionDeliverableAccessAssignmentId: text(next.id),
      missionDeliverableAccessPermissionSetVersion: 'v1',
    });
  });

  it('keeps metadata readable after content-reader revocation while hiding PDF metadata, history and bytes', async () => {
    await grant('/company-mission-deliverable-access-assignments');
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    const registered = await call('/documents', {
      method: 'POST',
      body: {
        type: 'mission-deliverable',
        clientId,
        title: 'Separate content DEMO',
        purpose: 'Independent stored-content authority',
      },
    });
    expect(registered.status).toBe(201);
    const document = await json(registered);
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    expect(
      (await upload({ documentId, versionId, revision: 1, bytes: PDF_A }))
        .status,
    ).toBe(201);
    expect(
      (
        await call(
          `/company-document-content-reader-assignments/${membershipId}/${companyId}`,
          { method: 'DELETE', company: null },
        )
      ).status,
    ).toBe(200);
    expect((await call(`/documents/${documentId}`)).status).toBe(200);
    const versions = await json(
      await call(`/documents/${documentId}/versions`),
    );
    if (!Array.isArray(versions.versions))
      throw new Error('Expected Versions.');
    expect(record(versions.versions[0]).pdfContent).toEqual({
      state: 'stored',
      access: 'denied',
    });
    for (const suffix of ['', '/history'])
      expect(
        (
          await call(
            `/documents/${documentId}/versions/${versionId}/content${suffix}`,
          )
        ).status,
      ).toBe(403);
    expect(
      (await upload({ documentId, versionId, revision: 2, bytes: PDF_A }))
        .status,
    ).toBe(403);
    expect(fixture.scanCount).toBe(1);
  });

  it('does not turn the family gate or Project visibility into ordinary Document authority', async () => {
    await grant('/company-mission-deliverable-access-assignments');
    await grant('/company-project-assignments');
    const project = await call('/projects', {
      method: 'POST',
      body: { title: 'Independent Project DEMO', clientAccountId: clientId },
    });
    expect(project.status).toBe(201);
    const projectId = text((await json(project)).id);
    expect(
      (
        await call(
          `/company-document-registrar-assignments/${membershipId}/${companyId}`,
          { method: 'DELETE', company: null },
        )
      ).status,
    ).toBe(200);
    expect((await call(`/projects/${projectId}`)).status).toBe(200);
    expect((await call('/documents')).status).toBe(403);
    expect((await call(`/projects/${projectId}/documents`)).status).toBe(403);
    expect(
      (
        await call('/documents', {
          method: 'POST',
          body: {
            type: 'mission-deliverable',
            clientId,
            title: 'Not authorized DEMO',
            purpose: 'No implicit register authority',
          },
        })
      ).status,
    ).toBe(403);
  });

  it('keeps known mission identities out of another authorized Company and rejects mismatched Versions and original Clients', async () => {
    await grant('/company-mission-deliverable-access-assignments');
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    await grant('/company-project-assignments');
    await grant('/company-document-project-organizer-assignments');
    const body = {
      type: 'mission-deliverable',
      clientId,
      title: 'Scoped mission DEMO',
      purpose: 'Exact scope',
    };
    const document = await json(
      await call('/documents', { method: 'POST', body }),
    );
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    expect(
      (await upload({ documentId, versionId, revision: 1, bytes: PDF_A }))
        .status,
    ).toBe(201);
    const second = await json(
      await call('/documents', {
        method: 'POST',
        body: { ...body, title: 'Other mission DEMO' },
      }),
    );
    expect(
      (
        await call(
          `/documents/${documentId}/versions/${text(record(second.version).id)}/content`,
        )
      ).status,
    ).toBe(404);
    const otherClient = await json(
      await call('/clients', {
        method: 'POST',
        body: { displayName: 'Other original DEMO' },
      }),
    );
    const otherProject = await json(
      await call('/projects', {
        method: 'POST',
        body: {
          title: 'Mismatched original DEMO',
          clientAccountId: text(otherClient.id),
        },
      }),
    );
    expect(
      (
        await call(`/documents/${documentId}/project-association`, {
          method: 'POST',
          body: {
            action: 'link',
            projectId: text(otherProject.id),
            expectedRevision: 0,
          },
        })
      ).status,
    ).toBe(404);
    const other = await json(
      await call('/companies', {
        method: 'POST',
        company: null,
        body: { displayName: 'Other mission Company DEMO' },
      }),
    );
    const otherId = text(other.id);
    for (const path of [
      '/company-document-registrar-assignments',
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
      '/company-mission-deliverable-access-assignments',
    ])
      expect(
        (
          await call(path, {
            method: 'POST',
            company: null,
            body: { companyId: otherId, workspaceMembershipId: membershipId },
          })
        ).status,
      ).toBe(201);
    for (const path of [
      `/documents/${documentId}`,
      `/documents/${documentId}/versions`,
      `/documents/${documentId}/correction-history`,
      `/documents/${documentId}/versions/${versionId}/content`,
      `/documents/${documentId}/versions/${versionId}/content/history`,
    ])
      expect((await call(path, { company: otherId })).status, path).toBe(404);
    expect(
      await (await call('/documents', { company: otherId })).json(),
    ).toEqual([]);
    expect(
      (await call('/documents', { method: 'POST', company: otherId, body }))
        .status,
    ).toBe(404);
    expect((await call(`/documents/${documentId}`)).status).toBe(200);
  });

  it.each(['archived', 'superseded'])(
    'refuses new mission writes after original Client %s during a scan',
    async (status) => {
      await grant('/company-mission-deliverable-access-assignments');
      await grant('/company-document-content-reader-assignments');
      await grant('/company-document-content-uploader-assignments');
      const document = await json(
        await call('/documents', {
          method: 'POST',
          body: {
            type: 'mission-deliverable',
            clientId,
            title: 'Original Client DEMO',
            purpose: 'No redirection',
          },
        }),
      );
      const documentId = text(document.id);
      const versionId = text(record(document.version).id);
      let union: { second: string; review: string } | undefined;
      if (status === 'superseded') {
        await grant('/company-director-client-assignments');
        const second = text(
          (
            await json(
              await call('/clients', {
                method: 'POST',
                body: { displayName: 'Canonical mission Client DEMO' },
              }),
            )
          ).id,
        );
        await fixture.pool.query(
          "UPDATE client_accounts SET tax_id='MISSION-UNION-DEMO' WHERE id=ANY($1::uuid[])",
          [[clientId, second]],
        );
        const review = await call(`/clients/${clientId}/union-reviews`, {
          method: 'POST',
          body: {},
        });
        expect(review.status).toBe(201);
        union = { second, review: text((await json(review)).reviewReference) };
      }
      const barrier = fixture.holdNextScan();
      const pending = upload({
        documentId,
        versionId,
        revision: 1,
        bytes: PDF_A,
      });
      try {
        await Promise.race([
          barrier.reached,
          pending.then(() => {
            throw new Error('Upload missed scanner barrier.');
          }),
        ]);
        // An independently committed Client lifecycle decision wins before the scanned write.
        if (union) {
          const confirmed = await call(
            `/client-union-reviews/${union.review}/confirm`,
            {
              method: 'POST',
              body: {
                canonicalClientId: union.second,
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
                reason: 'Synthetic mission identity correction',
              },
            },
          );
          expect(confirmed.status).toBe(201);
        } else
          await fixture.pool.query(
            "UPDATE client_accounts SET status='archived' WHERE id=$1",
            [clientId],
          );
        barrier.release();
        expect((await pending).status).toBe(404);
      } finally {
        barrier.release();
        await pending.catch(() => undefined);
      }
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::int AS count FROM document_pdfs',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await fixture.pool.query(
            'SELECT working_revision FROM working_documents WHERE id=$1',
            [documentId],
          )
        ).rows,
      ).toEqual([{ working_revision: 1 }]);
      if (status === 'superseded') {
        const read = await call(`/documents/${documentId}`);
        expect(read.status).toBe(200);
        expect(await read.json()).toMatchObject({
          clientId,
          correction: 'read-only',
        });
      }
    },
  );

  it('fails closed on an unknown persisted captured family version without exposing known identities or replay', async () => {
    const assignment = await grant(
      '/company-mission-deliverable-access-assignments',
    );
    const body = {
      type: 'mission-deliverable',
      clientId,
      title: 'Future grant DEMO',
      purpose: 'Known version only',
    };
    const document = await json(
      await call('/documents', {
        method: 'POST',
        body,
        key: 'future-grant-mission',
      }),
    );
    const documentId = text(document.id);
    const definition = await fixture.pool.query<{ definition: string }>(
      "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
    );
    const check = definition.rows[0]?.definition;
    if (typeof check !== 'string' || !check.startsWith('CHECK ('))
      throw new Error('Expected the owned version CHECK.');
    // A future database version with an older application is an external boundary.
    // Permit that one synthetic persisted value only in this isolated fixture.
    await fixture.pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      await fixture.pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v999' WHERE id=$1",
        [text(assignment.id)],
      );
      const company = record(
        (await json(await call('/access/current-actor'))).activeCompany,
      );
      expect(company.documentPermissions).not.toContain(
        'document.mission_deliverable.access',
      );
      expect(company).not.toHaveProperty(
        'missionDeliverableAccessAssignmentId',
      );
      expect(await (await call('/documents')).json()).toEqual([]);
      for (const path of [
        `/documents/${documentId}`,
        `/documents/${documentId}/versions`,
        `/documents/${documentId}/correction-history`,
      ])
        expect((await call(path)).status, path).toBe(404);
      expect(
        (
          await call('/documents', {
            method: 'POST',
            body,
            key: 'future-grant-mission',
          })
        ).status,
      ).toBe(403);
    } finally {
      await fixture.pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v1' WHERE id=$1",
        [text(assignment.id)],
      );
      await fixture.pool.query(
        `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${check}`,
      );
    }
  });
  it('keeps mission associations read-only after explicit Project closure without changing Document Versions', async () => {
    for (const path of [
      '/company-mission-deliverable-access-assignments',
      '/company-project-assignments',
      '/company-project-approver-assignments',
      '/company-document-project-organizer-assignments',
    ])
      await grant(path);
    const project = await json(
      await call('/projects', {
        method: 'POST',
        body: {
          title: 'Closed mission Project DEMO',
          clientAccountId: clientId,
        },
      }),
    );
    const projectId = text(project.id);
    const document = await json(
      await call('/documents', {
        method: 'POST',
        body: {
          type: 'mission-deliverable',
          clientId,
          title: 'Linked mission DEMO',
          purpose: 'Independent Project lifecycle',
        },
      }),
    );
    const documentId = text(document.id);
    expect(
      (
        await call(`/documents/${documentId}/project-association`, {
          method: 'POST',
          body: { action: 'link', projectId, expectedRevision: 0 },
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call(`/projects/${projectId}/lifecycle-transitions`, {
          method: 'POST',
          body: {
            action: 'cancel',
            expectedLifecycleRevision: 0,
            reason: 'Synthetic explicit cancellation',
          },
        })
      ).status,
    ).toBe(200);
    const refused = await call(`/documents/${documentId}/project-association`, {
      method: 'POST',
      body: { action: 'unlink', projectId, expectedRevision: 1 },
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: 'project_closed' });
    const linked = await call(`/projects/${projectId}/documents`);
    expect(linked.status).toBe(200);
    expect(await linked.json()).toMatchObject({
      mutable: false,
      documents: [
        {
          document: { id: documentId, type: 'mission-deliverable' },
          revision: 1,
        },
      ],
    });
    const versions = await call(`/documents/${documentId}/versions`);
    expect(versions.status).toBe(200);
    expect(await versions.json()).toMatchObject({
      workingRevision: 1,
      versions: [{ status: 'draft', pdfContent: { state: 'absent' } }],
    });
  });
});
