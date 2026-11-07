import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';

/** One authenticated JSON POST through the calling suite's harness. */
export type DocumentCommandRequest = (
  path: string,
  init: { body: unknown; key: string },
) => Promise<Response>;

async function answer(response: Response) {
  return { status: response.status, body: await response.text() };
}

/**
 * A Document whose family is hidden from the actor and a Document that does
 * not exist get one identical answer (status and body) from every command that
 * starts with the family lock (#1141), whatever the request's body or key.
 * `usedAssociationKey` is an Idempotency-Key the actor already committed to an
 * association, so a receipt mismatch cannot answer differently either.
 */
export async function expectHiddenDocumentCommandsToMatchMissing(
  request: DocumentCommandRequest,
  hidden: { documentId: string; versionId: string },
  usedAssociationKey: string = randomUUID(),
) {
  const missing = { documentId: randomUUID(), versionId: randomUUID() };
  const upload = (target: typeof hidden) =>
    request(
      `/documents/${target.documentId}/versions/${target.versionId}/content?expectedRevision=1&fileName=probe.pdf`,
      { body: {}, key: randomUUID() },
    );
  const hiddenUpload = await answer(await upload(hidden));
  expect(await answer(await upload(missing))).toEqual(hiddenUpload);

  const associate = (documentId: string) =>
    request(`/documents/${documentId}/project-association`, {
      body: { action: 'link', projectId: randomUUID(), expectedRevision: 0 },
      key: usedAssociationKey,
    });
  const hiddenAssociation = await answer(await associate(hidden.documentId));
  expect(await answer(await associate(missing.documentId))).toEqual(
    hiddenAssociation,
  );
}
