import {
  render as testingLibraryRender,
  type RenderOptions,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';

export * from '@testing-library/react';

/** Renders a historical business test with an explicit real interface locale. */
export function render(ui: ReactNode, options: RenderOptions = {}) {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const ExistingWrapper = options.wrapper;
  return testingLibraryRender(ui, {
    ...options,
    wrapper: ({ children }) => (
      <InterfaceLocaleProvider>
        {ExistingWrapper ? (
          <ExistingWrapper>{children}</ExistingWrapper>
        ) : (
          children
        )}
      </InterfaceLocaleProvider>
    ),
  });
}
