import {
  interfaceLocales,
  useInterfaceLocale,
  type InterfaceLocale,
} from '../../localization/interface-locale';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteCard } from '../components/ClarteCard';
import { useSettingsConsoleCopy } from './settings-console.copy';

/** Each language named in itself, so a reader finds it in any interface language. */
const languageNames = {
  ro: 'Română',
  ru: 'Русский',
  fr: 'Français',
  en: 'English',
} as const satisfies Record<InterfaceLocale, string>;

/** A fixed example, so the preview shows only how the language writes it. */
const exampleDate = '2026-11-30T00:00:00.000Z';
const exampleNumber = 41200.5;

/**
 * Language and region (EX-258): the interface language through the same
 * preference as the user menu, with dates and numbers written for it.
 */
export function ClarteLanguageSettings() {
  const copy = useSettingsConsoleCopy();
  const { locale, changeLocale, formatDate, formatNumber } =
    useInterfaceLocale();
  return (
    <ClarteCard>
      <fieldset className="clarte-settings-languages">
        <legend>{copy.languageChoice}</legend>
        <p className="clarte-settings-hint">{copy.languageSynced}</p>
        <div className="clarte-settings-language-options">
          {interfaceLocales.map((language) => (
            <label key={language}>
              <input
                type="radio"
                name="clarte-settings-language"
                value={language}
                checked={locale === language}
                onChange={() => changeLocale(language)}
              />
              <span lang={language}>{languageNames[language]}</span>
              {language === 'ro' && (
                <ClarteBadge tone="neutral">{copy.languageDefault}</ClarteBadge>
              )}
            </label>
          ))}
        </div>
      </fieldset>
      <dl className="clarte-settings-formats">
        <dt>{copy.languageFormats}</dt>
        <dd>{`${formatDate(exampleDate)} · ${formatNumber(exampleNumber)}`}</dd>
        <dd className="clarte-settings-hint">{copy.languageFormatsHint}</dd>
      </dl>
    </ClarteCard>
  );
}
