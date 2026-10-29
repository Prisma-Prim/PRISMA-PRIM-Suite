import type { ClerkProviderProps } from '@clerk/react';
import type { InterfaceLocale } from '../localization/interface-locale';
import { resolveMessage } from '../localization/messages';
import {
  clerkAuthenticationMessages,
  isClerkLocalizationBranch,
  upstreamClerkLocalizations,
  type ClerkAuthenticationMessages,
} from './clerk-authentication.copy';

type ClerkLocalization = NonNullable<ClerkProviderProps['localization']>;

function setMessage(
  resource: Record<string, unknown>,
  path: string,
  value: string,
): void {
  const segments = path.split('.');
  const leaf = segments.pop();
  if (!leaf) throw new Error('Clerk translation path is empty.');
  let current = resource;
  for (const segment of segments) {
    const previous = current[segment];
    const child = isClerkLocalizationBranch(previous) ? { ...previous } : {};
    current[segment] = child;
    current = child;
  }
  current[leaf] = value;
}

export function createClerkAuthenticationLocalizations(
  catalog: ClerkAuthenticationMessages,
): Record<InterfaceLocale, ClerkLocalization> {
  function build(locale: InterfaceLocale): ClerkLocalization {
    const resource = { ...upstreamClerkLocalizations[locale] };
    for (const key of clerkAuthenticationMessages.keys)
      setMessage(resource, key, resolveMessage(catalog, locale, key));
    return resource;
  }
  return { ro: build('ro'), ru: build('ru'), fr: build('fr'), en: build('en') };
}

const localizations = createClerkAuthenticationLocalizations(
  clerkAuthenticationMessages,
);

export function clerkAuthenticationLocalization(
  locale: InterfaceLocale,
): ClerkLocalization {
  return localizations[locale];
}
