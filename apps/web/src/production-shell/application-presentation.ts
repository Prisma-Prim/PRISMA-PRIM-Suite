import { createContext } from 'react';

// Presentation only; feature ownership and authority keys remain in App.
export const ApplicationPresentation = createContext<'classic' | 'prisme'>(
  'classic',
);
