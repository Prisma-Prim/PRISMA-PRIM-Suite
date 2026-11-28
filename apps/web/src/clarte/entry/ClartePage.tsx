import { useLayoutEffect, type ReactNode } from 'react';
import { ClarteLanguageChoice } from '../ClarteLanguageChoice';
import { ClarteMark } from '../ClarteMark';
import { useInterfacePreference } from '../InterfacePreferenceProvider';
import '../clarte-tokens.css';
import '../clarte-frame.css';
import '../components/clarte-components.css';
import './clarte-entry.css';

/**
 * A Clarté screen shown outside the frame: before sign-in, while access is
 * checked, during an invitation and in the ChatGPT callback window. The root
 * carries the frame's scope class for the tokens and base components, and
 * `clarte-page` instead of the frame's layout. The page offers the interface
 * language itself, so the floating selector steps aside while it is shown.
 */
export function ClartePage({ children }: Readonly<{ children: ReactNode }>) {
  const { claimLanguageControl } = useInterfacePreference();
  useLayoutEffect(() => claimLanguageControl(), [claimLanguageControl]);
  return (
    <main className="clarte-frame clarte-page">
      <div className="clarte-page-card">
        <p className="clarte-page-brand">
          <ClarteMark />
          <span>PRISMA-PRIM Suite</span>
        </p>
        {children}
        <div className="clarte-page-language">
          <ClarteLanguageChoice />
        </div>
      </div>
    </main>
  );
}
