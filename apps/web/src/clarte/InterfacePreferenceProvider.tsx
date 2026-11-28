import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  adoptInterfaceParameter,
  clearInterfacePreference,
  type InterfacePreference,
} from './interface-preference';

type InterfacePreferenceContextValue = Readonly<{
  preference: InterfacePreference;
  /** Leaves Clarté: forgets the stored choice and shows the current interface. */
  leave: () => void;
  /** True while a mounted Clarté frame offers the interface language itself. */
  frameOffersLanguage: boolean;
  /** The Clarté frame claims the language control while mounted; returns the release. */
  claimLanguageControl: () => () => void;
}>;

const InterfacePreferenceContext =
  createContext<InterfacePreferenceContextValue>({
    preference: 'current',
    leave: () => undefined,
    frameOffersLanguage: false,
    claimLanguageControl: () => () => undefined,
  });

/**
 * Holds the interface preference for the page. The first render applies an
 * opt-in URL parameter; the choice then survives navigation, reload and
 * sign-in through browser storage. Without this provider App shows the
 * current interface.
 */
export function InterfacePreferenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Idempotent: a repeated initializer finds the parameter already removed.
  const [preference, setPreference] = useState(adoptInterfaceParameter);
  const [languageClaims, setLanguageClaims] = useState(0);
  const leave = useCallback(() => {
    clearInterfacePreference();
    setPreference('current');
  }, []);
  const claimLanguageControl = useCallback(() => {
    setLanguageClaims((claims) => claims + 1);
    return () => setLanguageClaims((claims) => claims - 1);
  }, []);
  const value = useMemo(
    () => ({
      preference,
      leave,
      frameOffersLanguage: languageClaims > 0,
      claimLanguageControl,
    }),
    [preference, leave, languageClaims, claimLanguageControl],
  );
  return (
    <InterfacePreferenceContext value={value}>
      {children}
    </InterfacePreferenceContext>
  );
}

export function useInterfacePreference(): InterfacePreferenceContextValue {
  return useContext(InterfacePreferenceContext);
}
