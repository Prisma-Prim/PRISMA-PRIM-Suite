import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { createKnowledgeWebDocumentFixture } from '../../api/dist/knowledge/knowledge-web.test-support.js';
export const apiOrigin = 'http://127.0.0.1:4174';
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
export const reader = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected synthetic public record.');
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected synthetic identity.');
  return value;
}
export async function evidenceFixture(
  request: APIRequestContext,
  label: string,
  options: { reader?: false } = {},
) {
  const membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
  const created = await request.post(apiOrigin + '/api/companies', {
    headers: { ...owner, 'idempotency-key': randomUUID() },
    data: { displayName: 'Evidence ' + label + ' ' + randomUUID().slice(0, 8) },
  });
  expect(created.status()).toBe(201);
  const company = record(await created.json()),
    companyId = text(company.id);
  async function command(
    path: string,
    body: unknown,
    companyScoped = true,
    status = 201,
  ) {
    const result = await request.post(apiOrigin + '/api' + path, {
      headers: {
        ...reader,
        'idempotency-key': randomUUID(),
        ...(companyScoped ? { 'x-company-context-id': companyId } : {}),
      },
      data: body,
    });
    expect(result.status(), path).toBe(status);
    return record(await result.json());
  }
  const context = await request.post(
    apiOrigin + '/api/company-context-assignments',
    {
      headers: { ...owner, 'idempotency-key': randomUUID() },
      data: { companyId, workspaceMembershipId: membershipId },
    },
  );
  expect(context.status()).toBe(201);
  for (const role of ['administrators', 'readers']) {
    if (role === 'readers' && options.reader === false) continue;
    const grant = await request.post(
      apiOrigin + '/api/knowledge/assignments/' + role,
      {
        headers: { ...owner, 'idempotency-key': randomUUID() },
        data: { companyId, workspaceMembershipId: membershipId },
      },
    );
    expect(grant.status()).toBe(201);
  }
  const sources = [];
  for (const language of ['ro', 'ru', 'en'] as const) {
    const passageText =
      language === 'ro'
        ? '  În atelierul fictiv sunt patru cutii. e\u0301  '
        : language === 'ru'
          ? '  В вымышленном архиве четыре коробки. e\u0301  '
          : '  There are four fictional boxes. e\u0301  ';
    const document = await createKnowledgeWebDocumentFixture({
      origin: apiOrigin,
      companyId,
      membershipId,
      callerHeaders: reader,
      grantHeaders: owner,
      language,
      passageText,
      title: `Exact ${language} ${label}`,
    });
    const receipt = await command('/knowledge/sources', document.draftBody);
    const sourceId = text(receipt.sourceId);
    await command(
      `/knowledge/sources/${sourceId}/admission`,
      {
        expectedRevision: 1,
        attestation: 'exact-version-source-and-use-reviewed/v1',
        sourceSha256: receipt.sourceSha256,
        projectionSha256: receipt.projectionSha256,
      },
      true,
      200,
    );
    sources.push({
      ...document,
      sourceId,
      passageText,
      title: `Exact ${language} ${label}`,
    });
  }
  async function supersede(documentId: string) {
    const response = await request.get(
      apiOrigin + `/api/documents/${documentId}/versions`,
      { headers: { ...reader, 'x-company-context-id': companyId } },
    );
    expect(response.status()).toBe(200);
    const versions = record(await response.json());
    const draft = await command(`/documents/${documentId}/versions`, {
      expectedRevision: versions.workingRevision,
    });
    await command(
      `/documents/${documentId}/versions/${text(draft.versionId)}/official-designation`,
      { expectedRevision: draft.workingRevision },
      true,
      200,
    );
  }
  return {
    companyId,
    companyName: text(company.displayName),
    sources,
    supersede,
  };
}
