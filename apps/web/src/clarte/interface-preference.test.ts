import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adoptInterfaceParameter,
  clearInterfacePreference,
  interfacePreferenceStorageKey,
  readInterfacePreference,
  setInterfacePreference,
} from './interface-preference';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('interface preference', () => {
  it('reads the current interface when nothing is stored', () => {
    expect(readInterfacePreference()).toBe('current');
  });

  it('persists the Clarté choice and forgets it when cleared', () => {
    expect(setInterfacePreference('clarte')).toBe('clarte');
    expect(localStorage.getItem(interfacePreferenceStorageKey)).toBe('clarte');
    expect(readInterfacePreference()).toBe('clarte');

    expect(clearInterfacePreference()).toBe('current');
    expect(localStorage.getItem(interfacePreferenceStorageKey)).toBeNull();
    expect(readInterfacePreference()).toBe('current');
  });

  it('reads an unrecognized stored value as the current interface', () => {
    localStorage.setItem(interfacePreferenceStorageKey, 'prisme');

    expect(readInterfacePreference()).toBe('current');
  });

  it('falls back to the current interface when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage is disabled.', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is disabled.', 'SecurityError');
    });

    expect(readInterfacePreference()).toBe('current');
    expect(setInterfacePreference('clarte')).toBe('current');
  });

  it('keeps the current interface when storage refuses the opt-in', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded.', 'QuotaExceededError');
    });
    window.history.replaceState(null, '', '/?interface=clarte');

    expect(adoptInterfaceParameter()).toBe('current');
    expect(window.location.search).toBe('');
  });
});

describe('opt-in URL parameter', () => {
  it('stores Clarté and removes only its own parameter from the URL', () => {
    const state = { recovery: 'opaque' };
    window.history.replaceState(
      state,
      '',
      '/accept?source=a%20b&interface=clarte&next=%2Fx#clients',
    );

    expect(adoptInterfaceParameter()).toBe('clarte');

    expect(window.location.pathname).toBe('/accept');
    expect(window.location.search).toBe('?source=a%20b&next=%2Fx');
    expect(window.location.hash).toBe('#clients');
    expect(window.history.state).toEqual(state);
    expect(readInterfacePreference()).toBe('clarte');
  });

  it('turns Clarté off with the same parameter', () => {
    setInterfacePreference('clarte');
    window.history.replaceState(null, '', '/?interface=current');

    expect(adoptInterfaceParameter()).toBe('current');
    expect(window.location.search).toBe('');
    expect(localStorage.getItem(interfacePreferenceStorageKey)).toBeNull();
  });

  it('ignores an unrecognized value and keeps the stored choice', () => {
    setInterfacePreference('clarte');
    window.history.replaceState(null, '', '/?interface=prisme&keep=1');

    expect(adoptInterfaceParameter()).toBe('clarte');
    expect(window.location.search).toBe('?keep=1');
  });

  it('follows the stored choice when the URL carries no parameter', () => {
    window.history.replaceState(null, '', '/?source=preserved');
    expect(adoptInterfaceParameter()).toBe('current');

    setInterfacePreference('clarte');
    expect(adoptInterfaceParameter()).toBe('clarte');
    expect(window.location.search).toBe('?source=preserved');
  });
});
