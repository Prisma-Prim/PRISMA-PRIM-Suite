import { describe, expect, it, vi } from 'vitest';
import { resolveIdempotentDisplayNameCommand } from './idempotent-display-name-command';

describe('resolveIdempotentDisplayNameCommand', () => {
  it('rejects a blank display name without allocating a command key', () => {
    const createKey = vi.fn(() => 'unused');

    expect(
      resolveIdempotentDisplayNameCommand('   ', undefined, createKey),
    ).toBeUndefined();
    expect(createKey).not.toHaveBeenCalled();
  });

  it('reuses the command only when the normalized display name is unchanged', () => {
    const previous = {
      displayName: 'Same Name',
      idempotencyKey: 'existing-key',
    };
    const createKey = vi.fn(() => 'new-key');

    expect(
      resolveIdempotentDisplayNameCommand('  Same Name ', previous, createKey),
    ).toBe(previous);
    expect(
      resolveIdempotentDisplayNameCommand('Other Name', previous, createKey),
    ).toEqual({ displayName: 'Other Name', idempotencyKey: 'new-key' });
    expect(createKey).toHaveBeenCalledOnce();
  });
});
