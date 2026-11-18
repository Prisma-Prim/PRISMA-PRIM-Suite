import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  prepareHistoryPage,
  readHistoryManifest,
  type HistoricalSource,
} from './history.js';
import { snapshotIdentityHash } from './snapshot.js';

const source: HistoricalSource = {
  id: 'one',
  documentId: 'document',
  documentVersionId: 'version',
  representationId: null,
  sourceSha256: 'a'.repeat(64),
};
const identity = 'b'.repeat(64),
  sourceHash = 'c'.repeat(64),
  pipelineVersion = 'rules/v1',
  parserVersion = 'parser/v1',
  missingDocuments = [{ documentId: 'missing', title: 'Private title' }];
const input = {
  identity,
  sourceHash,
  pipelineVersion,
  parserVersion,
  missingDocuments,
  sources: [source],
};
const hash = snapshotIdentityHash(input);
const manifest = readHistoryManifest(
  { format: 'DOSSIER_ANALYSIS_SNAPSHOT/1', ...input },
  hash,
);
const rows = Array.from({ length: 6 }, (_, index) => ({
  id: String(index),
  snapshotHash: hash,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  manifest,
}));
describe('bounded run history', () => {
  it('authorizes each unique original once and summarizes only five rows', async () => {
    const authorize = vi.fn(async () => undefined);
    const page = await prepareHistoryPage({
      rows,
      currentIdentity: identity,
      visibleDocuments: missingDocuments,
      selected: [],
      authorize,
    });
    expect(page).toHaveLength(5);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledWith([source]);
    expect(page.every((row) => row.stale === false)).toBe(true);
  });
  it('reuses the current selected-source authority without another original read', async () => {
    const authorize = vi.fn(async () => undefined);
    await prepareHistoryPage({
      rows,
      currentIdentity: identity,
      visibleDocuments: missingDocuments,
      selected: [source],
      authorize,
    });
    expect(authorize).not.toHaveBeenCalled();
  });
  it('withholds the entire page when even its look-ahead run loses visibility', async () => {
    const authorize = vi.fn(async () => undefined);
    await expect(
      prepareHistoryPage({
        rows,
        currentIdentity: identity,
        visibleDocuments: [],
        selected: [],
        authorize,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(authorize).not.toHaveBeenCalled();
  });
  it('rejects altered compact source identities before a page can be disclosed', () => {
    expect(() =>
      readHistoryManifest(
        {
          format: 'DOSSIER_ANALYSIS_SNAPSHOT/1',
          ...input,
          sources: [{ ...source, documentId: 'other' }],
        },
        hash,
      ),
    ).toThrow();
  });
});
