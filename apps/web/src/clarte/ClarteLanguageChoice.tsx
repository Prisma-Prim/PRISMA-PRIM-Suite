import { useInterfaceLocaleCopy } from '../localization/interface-locale.copy';
import {
  interfaceLocales,
  useInterfaceLocale,
  type InterfaceLocale,
} from '../localization/interface-locale';

/** Each language named in itself, so a reader finds it in any interface language. */
const languageNames = {
  ro: 'Română',
  ru: 'Русский',
  fr: 'Français',
  en: 'English',
} as const satisfies Record<InterfaceLocale, string>;

/**
 * The interface language as one click among the four languages, through the
 * existing locale preference.
 */
export function ClarteLanguageChoice() {
  const copy = useInterfaceLocaleCopy();
  const { locale, changeLocale } = useInterfaceLocale();
  return (
    <fieldset className="clarte-language">
      <legend>{copy.label}</legend>
      <div className="clarte-language-options">
        {interfaceLocales.map((language) => (
          <label key={language}>
            <input
              type="radio"
              name="clarte-interface-language"
              value={language}
              checked={locale === language}
              onChange={() => changeLocale(language)}
            />
            <span lang={language}>{languageNames[language]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
