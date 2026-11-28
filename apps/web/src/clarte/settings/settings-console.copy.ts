import { defineMessages, useMessages } from '../../localization/messages';

const keys = [
  'sections',
  'homeLabel',
  'homeDescription',
  'back',
  'groupYou',
  'groupOrganisation',
  'groupCommercial',
  'groupTraceability',
  'languageLabel',
  'languageDescription',
  'languageChoice',
  'languageDefault',
  'languageSynced',
  'languageFormats',
  'languageFormatsHint',
] as const;

export const settingsConsoleMessages = defineMessages(keys, {
  ro: {
    sections: 'Secțiunile setărilor',
    homeLabel: 'Toate setările',
    homeDescription:
      'Tot ce se configurează o dată și se schimbă rar, secțiune cu secțiune.',
    back: 'Toate setările',
    groupYou: 'Dvs.',
    groupOrganisation: 'Organizație',
    groupCommercial: 'Ofertă comercială',
    groupTraceability: 'Trasabilitate',
    languageLabel: 'Limbă și regiune',
    languageDescription:
      'Limba interfeței și felul în care sunt scrise datele și numerele. Se aplică doar pentru dvs.',
    languageChoice: 'Limba interfeței dvs.',
    languageDefault: 'Implicită',
    languageSynced: 'Aceeași alegere ca în meniul utilizatorului.',
    languageFormats: 'Date și numere',
    languageFormatsHint: 'Exemplu în limba aleasă',
  },
  ru: {
    sections: 'Разделы настроек',
    homeLabel: 'Все настройки',
    homeDescription:
      'Всё, что настраивается один раз и редко меняется, по разделам.',
    back: 'Все настройки',
    groupYou: 'Вы',
    groupOrganisation: 'Организация',
    groupCommercial: 'Коммерческое предложение',
    groupTraceability: 'Прослеживаемость',
    languageLabel: 'Язык и регион',
    languageDescription:
      'Язык интерфейса и формат дат и чисел. Действует только для вас.',
    languageChoice: 'Ваш язык интерфейса',
    languageDefault: 'По умолчанию',
    languageSynced: 'Тот же выбор, что и в меню пользователя.',
    languageFormats: 'Даты и числа',
    languageFormatsHint: 'Пример на выбранном языке',
  },
  fr: {
    sections: 'Sections des réglages',
    homeLabel: 'Tous les réglages',
    homeDescription:
      'Tout ce qui se configure une fois et change rarement, section par section.',
    back: 'Tous les réglages',
    groupYou: 'Vous',
    groupOrganisation: 'Organisation',
    groupCommercial: 'Offre commerciale',
    groupTraceability: 'Traçabilité',
    languageLabel: 'Langue et région',
    languageDescription:
      'La langue de l’interface et l’écriture des dates et des nombres. Elle ne s’applique qu’à vous.',
    languageChoice: 'Votre langue d’interface',
    languageDefault: 'Par défaut',
    languageSynced: 'Le même choix que dans le menu de l’utilisateur.',
    languageFormats: 'Dates et nombres',
    languageFormatsHint: 'Exemple dans la langue choisie',
  },
  en: {
    sections: 'Settings sections',
    homeLabel: 'All settings',
    homeDescription:
      'Everything set up once and rarely changed, section by section.',
    back: 'All settings',
    groupYou: 'You',
    groupOrganisation: 'Organisation',
    groupCommercial: 'Commercial offer',
    groupTraceability: 'Traceability',
    languageLabel: 'Language and region',
    languageDescription:
      'The interface language and how dates and numbers are written. It applies to you only.',
    languageChoice: 'Your interface language',
    languageDefault: 'Default',
    languageSynced: 'The same choice as in the user menu.',
    languageFormats: 'Dates and numbers',
    languageFormatsHint: 'Example in the chosen language',
  },
});

export type SettingsGroup =
  'you' | 'organisation' | 'commercial' | 'traceability';

export function useSettingsConsoleCopy() {
  const message = useMessages(settingsConsoleMessages);
  const groups = {
    you: message('groupYou'),
    organisation: message('groupOrganisation'),
    commercial: message('groupCommercial'),
    traceability: message('groupTraceability'),
  } satisfies Record<SettingsGroup, string>;
  return {
    sections: message('sections'),
    homeLabel: message('homeLabel'),
    homeDescription: message('homeDescription'),
    back: message('back'),
    group: (group: SettingsGroup) => groups[group],
    languageLabel: message('languageLabel'),
    languageDescription: message('languageDescription'),
    languageChoice: message('languageChoice'),
    languageDefault: message('languageDefault'),
    languageSynced: message('languageSynced'),
    languageFormats: message('languageFormats'),
    languageFormatsHint: message('languageFormatsHint'),
  };
}
