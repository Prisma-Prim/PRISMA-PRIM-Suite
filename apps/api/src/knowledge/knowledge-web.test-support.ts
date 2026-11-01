import { createKnowledgeDocumentFixture } from './knowledge.test-support.js';

/** Public native commands preserve equal bytes under distinct R1/R2 identities. */
export function createKnowledgeWebDocumentFixture(
  options: Parameters<typeof createKnowledgeDocumentFixture>[0],
) {
  return createKnowledgeDocumentFixture({ ...options, equalByteUploads: true });
}
