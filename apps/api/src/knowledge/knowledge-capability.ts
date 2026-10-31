import { ServiceUnavailableException } from '@nestjs/common';

/** Versioned capability registration; no environment setting grants business authority. */
export const KNOWLEDGE_CAPABILITY = {
  id: 'knowledge.cited-evidence',
  version: '1',
  purpose: 'cited-evidence',
  owner: 'Knowledge',
  outputs: 'permitted exact-Version curated passages; no generated answer',
  recipients: 'operator-selected ChatGPT/Codex client',
  controls:
    'read-only, separate captured grant, source admission and native Document visibility',
  qualification:
    'software contract tests; representative production evaluation required before promotion',
  productionDefault: 'disabled',
} as const;

export function requireKnowledgeCapability(): void {
  if (process.env.KNOWLEDGE_EVIDENCE_ENABLED !== 'true')
    throw new ServiceUnavailableException('Cited evidence is unavailable.');
}
