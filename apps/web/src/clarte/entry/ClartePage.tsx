import { useLayoutEffect, type ReactNode } from 'react';
import { InterfaceLocaleSelect } from '../../localization/InterfaceLocaleSelect';
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
 * `clarte-page` instead of the frame's layout.
 */
export function ClartePage({
  children,
  kind = 'standard',
}: Readonly<{
  children: ReactNode;
  kind?: 'standard' | 'welcome' | 'invitation';
}>) {
  const { claimLanguageControl } = useInterfacePreference();
  useLayoutEffect(() => claimLanguageControl(), [claimLanguageControl]);
  return (
    <main className={`clarte-frame clarte-page clarte-page--${kind}`}>
      {kind === 'invitation' && <InterfaceLocaleSelect />}
      <div className="clarte-page-card">
        <p className="clarte-page-brand">
          <ClarteMark />
          {kind === 'standard' && <span>PRISMA-PRIM Suite</span>}
        </p>
        {children}
        {kind !== 'invitation' && (
          <div className="clarte-page-language">
            <ClarteLanguageChoice />
          </div>
        )}
      </div>
    </main>
  );
}
