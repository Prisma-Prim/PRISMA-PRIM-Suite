import { describe, expect, it, vi } from 'vitest';
import {
  createIdempotentCleanup,
  rethrowAfterCleanup,
} from './owned-resource-cleanup.js';

describe('owned resource cleanup', () => {
  it('attempts every named cleanup and preserves a primary failure', async () => {
    const primaryFailure = new Error('setup failed');
    const firstCleanupFailure = new Error('raw pool close failed');
    const secondCleanupFailure = new Error('application close failed');
    const cleanupOrder: string[] = [];
    const firstCleanup = vi.fn(async () => {
      cleanupOrder.push('raw pool');
      throw firstCleanupFailure;
    });
    const secondCleanup = vi.fn(async () => {
      cleanupOrder.push('application');
      throw secondCleanupFailure;
    });

    let lifecycleFailure: unknown;
    try {
      await rethrowAfterCleanup({
        primaryFailure,
        resources: [
          { name: 'raw pool', cleanup: firstCleanup },
          { name: 'application', cleanup: secondCleanup },
        ],
        message: 'Setup failed and cleanup also failed.',
        failureAction: 'clean up',
      });
    } catch (error) {
      lifecycleFailure = error;
    }

    expect(cleanupOrder).toEqual(['raw pool', 'application']);
    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(secondCleanup).toHaveBeenCalledOnce();
    expect(lifecycleFailure).toBeInstanceOf(AggregateError);
    if (!(lifecycleFailure instanceof AggregateError)) {
      throw new Error('Expected an aggregate lifecycle failure.');
    }
    expect(lifecycleFailure.cause).toBe(primaryFailure);
    expect(lifecycleFailure.errors[0]).toBe(primaryFailure);
    expect(lifecycleFailure.errors[1]).toEqual(
      expect.objectContaining({ cause: firstCleanupFailure }),
    );
    expect(lifecycleFailure.errors[2]).toEqual(
      expect.objectContaining({ cause: secondCleanupFailure }),
    );
  });

  it('throws one named cleanup failure once and ignores later close calls', async () => {
    const cleanupFailure = new Error('pool close failed');
    const cleanup = vi.fn(async () => {
      throw cleanupFailure;
    });
    const close = createIdempotentCleanup({
      resources: [{ name: 'PostgreSQL pool', cleanup }],
      multipleFailuresMessage: 'Multiple resources failed to close.',
      failureAction: 'clean up',
    });

    let firstFailure: unknown;
    try {
      await close();
    } catch (error) {
      firstFailure = error;
    }
    await close();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(firstFailure).toBeInstanceOf(Error);
    if (!(firstFailure instanceof Error)) {
      throw new Error('Expected a cleanup failure.');
    }
    expect(firstFailure).not.toBeInstanceOf(AggregateError);
    expect(firstFailure.cause).toBe(cleanupFailure);
    expect(firstFailure.message).toBe('Failed to clean up PostgreSQL pool.');
  });
});
