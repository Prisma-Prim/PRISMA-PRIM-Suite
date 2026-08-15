import { describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { createCompanyContextPreferenceStore } from './company-context-preference';

const actor = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
} as ActorContext;

describe('Company context preference store', () => {
  it('isolates preferences by Workspace Membership', () => {
    const storage = new Map<string, string>();
    const preference = createCompanyContextPreferenceStore({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    });
    const otherActor = {
      ...actor,
      internalUserId: 'user-2',
      workspaceMembershipId: 'membership-2',
    };

    preference.write(actor, 'company-a');

    expect(preference.read(actor)).toBe('company-a');
    expect(preference.read(otherActor)).toBeUndefined();
  });

  it('fails open for shell rendering when browser storage is unavailable', () => {
    const unavailableStorage = {
      getItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError');
      }),
      setItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError');
      }),
      removeItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError');
      }),
    };
    const preference = createCompanyContextPreferenceStore(unavailableStorage);

    expect(preference.read(actor)).toBeUndefined();
    expect(() => preference.write(actor, 'company-a')).not.toThrow();
    expect(() => preference.clear(actor)).not.toThrow();
  });
});
