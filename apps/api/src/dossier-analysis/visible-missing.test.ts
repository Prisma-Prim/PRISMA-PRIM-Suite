import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { requireVisibleMissing } from './visible-missing.js';

describe('saved missing-document visibility', () => {
  it('permits a historical title only while its native document remains visible', () => {
    expect(() =>
      requireVisibleMissing(
        [{ documentId: 'one', title: 'old' }],
        [{ documentId: 'one', title: 'current' }],
      ),
    ).not.toThrow();
  });
  it('uses the same generic unavailable response for a revoked or missing document', () => {
    const check = () =>
      requireVisibleMissing([{ documentId: 'hidden', title: 'private' }], []);
    expect(check).toThrow(NotFoundException);
    try {
      check();
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      expect(JSON.stringify(error.getResponse())).not.toContain('private');
      expect(JSON.stringify(error.getResponse())).not.toContain('hidden');
    }
  });
});
