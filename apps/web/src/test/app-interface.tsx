import type { ReactNode } from 'react';
import { InterfacePreferenceProvider } from '../clarte/InterfacePreferenceProvider';
import {
  interfacePreferenceStorageKey,
  type InterfacePreference,
} from '../clarte/interface-preference';
import { render, type RenderOptions } from './render-with-interface-locale';

/**
 * Both interfaces, for `describe.each(appInterfaces)` in App-level tests. The
 * switch-over (#1548) removes `current`, and with it the parameterization.
 */
export const appInterfaces = [
  'current',
  'clarte',
] as const satisfies readonly InterfacePreference[];

/**
 * Renders a historical business test in the chosen interface: the stored
 * tester choice is set as after an opt-in and the real preference provider
 * reads it, inside the explicit English interface locale of `render`.
 */
export function renderInInterface(
  appInterface: InterfacePreference,
  ui: ReactNode,
  options: RenderOptions = {},
) {
  if (appInterface === 'clarte')
    localStorage.setItem(interfacePreferenceStorageKey, 'clarte');
  else localStorage.removeItem(interfacePreferenceStorageKey);
  const ExistingWrapper = options.wrapper;
  return render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <InterfacePreferenceProvider>
        {ExistingWrapper ? (
          <ExistingWrapper>{children}</ExistingWrapper>
        ) : (
          children
        )}
      </InterfacePreferenceProvider>
    ),
  });
}
