import { createContext } from 'react';

export type ApplicationPresentationName = 'classic' | 'prisme';

export function getApplicationPresentation(
  url: URL,
): ApplicationPresentationName {
  return url.searchParams.get('frame') === 'classic' ? 'classic' : 'prisme';
}

export function getPresentationUrl(
  currentUrl: URL,
  presentation: ApplicationPresentationName,
): URL {
  const nextUrl = new URL(currentUrl);
  if (presentation === 'classic') nextUrl.searchParams.set('frame', 'classic');
  else nextUrl.searchParams.delete('frame');
  return nextUrl;
}

// Presentation only; feature ownership and authority keys remain in App.
export const ApplicationPresentation =
  createContext<ApplicationPresentationName>('classic');
