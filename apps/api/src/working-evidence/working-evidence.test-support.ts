import { createHash, randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  PDF_A,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';

export { json, record, text, PDF_A };
export type { MissionDocumentFixture };
export const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

export async function openWorkingEvidenceFixture(databaseUrl: string) {
  const native = await createMissionDocumentFixture(databaseUrl);
  let companyId = '';
  let membershipId = '';
  let clientId = '';
  async function prepare() {
    ({ companyId, membershipId, clientId } = await native.reset());
    for (const path of [
      '/company-project-assignments',
      '/company-working-evidence-case-reader-assignments',
      '/company-working-evidence-case-recorder-assignments',
      '/company-received-audit-source-access-assignments',
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
      '/company-document-approver-assignments',
    ])
      await native.grant(path);
    const response = await native.call('/projects', {
      method: 'POST',
      body: {
        title: 'Fictional process observation',
        clientAccountId: clientId,
      },
    });
    expect(response.status).toBe(201);
    const projectId = text((await json(response)).id);
    return { companyId, membershipId, clientId, projectId };
  }
  async function source(
    options: { bytes?: Buffer; title?: string; clientId?: string } = {},
  ) {
    const bytes = options.bytes ?? PDF_A;
    const registrationKey = randomUUID();
    const registrationBody = {
      type: 'received-audit-source',
      clientId: options.clientId ?? clientId,
      title: options.title ?? 'Fictional received working source',
      purpose: 'Literal unverified source; no certification claim',
    };
    const response = await native.call('/documents', {
      method: 'POST',
      key: registrationKey,
      body: registrationBody,
    });
    expect(response.status).toBe(201);
    const document = await json(response);
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    const uploaded = await native.upload({
      documentId,
      versionId,
      revision: 1,
      bytes,
    });
    expect(uploaded.status).toBe(201);
    const representationId = text((await json(uploaded)).representationId);
    const designated = await native.call(
      `/documents/${documentId}/versions/${versionId}/official-designation`,
      { method: 'POST', body: { expectedRevision: 2 } },
    );
    expect(designated.status).toBe(200);
    return {
      documentId,
      versionId,
      representationId,
      bytes,
      registrationKey,
      registrationBody,
    };
  }
  function values(
    sources: readonly {
      documentId: string;
      versionId: string;
      representationId: string;
    }[],
  ) {
    return {
      title: 'Fictional working observation',
      declaredContext: 'Human-declared context; duration and method unverified',
      process: 'Fictional receipt handling',
      statement:
        '<script>untrusted literal</script> https://example.test/inert',
      observationNote: null,
      supports: sources.map((source, index) => ({
        documentId: source.documentId,
        versionId: source.versionId,
        representationId: source.representationId,
        locator: index === 0 ? 'Human hint: opening paragraph' : null,
        supportNote: `Fictional support ${index + 1}; human interpretation only`,
      })),
    };
  }
  function recordBody(sources: Parameters<typeof values>[0]) {
    return {
      format: 'WORKING_EVIDENCE_CASE_COMMAND/1',
      commandId: randomUUID(),
      expectedRevision: 0,
      values: values(sources),
    };
  }
  async function revoke(path: string) {
    const response = await native.call(`${path}/${membershipId}/${companyId}`, {
      method: 'DELETE',
      company: null,
    });
    expect(response.status).toBe(200);
  }
  return {
    native,
    prepare,
    source,
    values,
    recordBody,
    revoke,
    call: native.call,
    grant: native.grant,
    close: native.close,
    restart: native.restart,
    get origin() {
      return native.origin;
    },
    get pool() {
      return native.pool;
    },
  };
}
export type WorkingEvidenceFixture = Awaited<
  ReturnType<typeof openWorkingEvidenceFixture>
>;
