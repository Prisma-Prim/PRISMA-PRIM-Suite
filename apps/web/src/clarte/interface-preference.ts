/**
 * The tester switch between the current interface and Clarté (#1530). It is a
 * presentation-only browser preference: it never changes authorization, data,
 * API requests or business behaviour. Without a readable stored choice the
 * browser shows the current interface.
 */
export const interfacePreferences = ['current', 'clarte'] as const;
export type InterfacePreference = (typeof interfacePreferences)[number];

/** The browser storage entry. Only the Clarté choice is ever stored. */
export const interfacePreferenceStorageKey = 'prisma-prim.interface';

/**
 * The opt-in URL parameter, distinct from the retired `frame` parameter:
 * `interface=clarte` turns Clarté on and `interface=current` turns it off.
 */
export const interfaceOptInParameter = 'interface';

export function isInterfacePreference(
  value: unknown,
): value is InterfacePreference {
  return interfacePreferences.some((preference) => preference === value);
}

/** The preference this browser holds; unavailable storage reads as current. */
export function readInterfacePreference(): InterfacePreference {
  try {
    return window.localStorage.getItem(interfacePreferenceStorageKey) ===
      'clarte'
      ? 'clarte'
      : 'current';
  } catch {
    return 'current';
  }
}

/**
 * Stores the choice and returns the preference the browser now holds, which
 * stays unchanged when storage refuses the write.
 */
export function setInterfacePreference(
  preference: InterfacePreference,
): InterfacePreference {
  try {
    if (preference === 'clarte')
      window.localStorage.setItem(interfacePreferenceStorageKey, 'clarte');
    else window.localStorage.removeItem(interfacePreferenceStorageKey);
  } catch {
    // Unavailable storage keeps whatever the browser already holds.
  }
  return readInterfacePreference();
}

/** Forgets the Clarté choice; the browser shows the current interface. */
export function clearInterfacePreference(): InterfacePreference {
  return setInterfacePreference('current');
}

/**
 * Applies an `interface` parameter of the current URL once and removes it, so
 * a later reload or leaving Clarté follows the stored choice. Every other part
 * of the URL keeps its exact spelling and the history state is kept. An
 * unrecognized value changes nothing.
 */
export function adoptInterfaceParameter(): InterfacePreference {
  const url = new URL(window.location.href);
  const requested = url.searchParams.get(interfaceOptInParameter);
  if (requested === null) return readInterfacePreference();
  const kept = url.search
    .slice(1)
    .split('&')
    .filter(
      (pair) =>
        pair !== '' && !new URLSearchParams(pair).has(interfaceOptInParameter),
    );
  url.search = kept.length === 0 ? '' : `?${kept.join('&')}`;
  // Opaque recovery state of other modules travels unchanged.
  const preservedState: unknown = window.history.state;
  window.history.replaceState(preservedState, '', url);
  return isInterfacePreference(requested)
    ? setInterfacePreference(requested)
    : readInterfacePreference();
}
