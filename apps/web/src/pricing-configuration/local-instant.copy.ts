import {
  defineMessages,
  formatMessage,
  resolveMessage,
  useMessages,
} from '../localization/messages';

const keys = [
  'skippedFrom',
  'skippedTo',
  'repeatedFrom',
  'repeatedTo',
] as const;
type Key = (typeof keys)[number];

export const localInstantMessages = defineMessages(keys, {
  ro: {
    skippedFrom:
      'Începutul nu există în {zone}: schimbarea orei sare peste acest moment. Alegeți o oră în afara schimbării.',
    skippedTo:
      'Sfârșitul nu există în {zone}: schimbarea orei sare peste acest moment. Alegeți o oră în afara schimbării.',
    repeatedFrom:
      'Începutul este ambiguu în {zone}: schimbarea orei repetă acest moment. Alegeți o oră în afara schimbării.',
    repeatedTo:
      'Sfârșitul este ambiguu în {zone}: schimbarea orei repetă acest moment. Alegeți o oră în afara schimbării.',
  },
  ru: {
    skippedFrom:
      'Начало не существует в часовом поясе {zone}: при переводе часов это время пропускается. Выберите время вне перехода.',
    skippedTo:
      'Окончание не существует в часовом поясе {zone}: при переводе часов это время пропускается. Выберите время вне перехода.',
    repeatedFrom:
      'Начало неоднозначно в часовом поясе {zone}: при переводе часов это время повторяется. Выберите время вне перехода.',
    repeatedTo:
      'Окончание неоднозначно в часовом поясе {zone}: при переводе часов это время повторяется. Выберите время вне перехода.',
  },
  fr: {
    skippedFrom:
      'Le début n’existe pas dans le fuseau {zone} : le changement d’heure saute cet instant. Choisissez une heure hors du changement.',
    skippedTo:
      'La fin n’existe pas dans le fuseau {zone} : le changement d’heure saute cet instant. Choisissez une heure hors du changement.',
    repeatedFrom:
      'Le début est ambigu dans le fuseau {zone} : le changement d’heure répète cet instant. Choisissez une heure hors du changement.',
    repeatedTo:
      'La fin est ambiguë dans le fuseau {zone} : le changement d’heure répète cet instant. Choisissez une heure hors du changement.',
  },
  en: {
    skippedFrom:
      'The start does not exist in {zone}: a clock change skips that time. Choose a time outside the change.',
    skippedTo:
      'The end does not exist in {zone}: a clock change skips that time. Choose a time outside the change.',
    repeatedFrom:
      'The start is ambiguous in {zone}: a clock change repeats that time. Choose a time outside the change.',
    repeatedTo:
      'The end is ambiguous in {zone}: a clock change repeats that time. Choose a time outside the change.',
  },
});

function createCopy(message: (key: Key) => string) {
  return {
    skippedTime: {
      effectiveFrom: (zone: string) =>
        formatMessage(message('skippedFrom'), { zone }),
      effectiveTo: (zone: string) =>
        formatMessage(message('skippedTo'), { zone }),
    },
    repeatedTime: {
      effectiveFrom: (zone: string) =>
        formatMessage(message('repeatedFrom'), { zone }),
      effectiveTo: (zone: string) =>
        formatMessage(message('repeatedTo'), { zone }),
    },
  };
}

// Preserve the shared parser and existing Tariff consumers’ English copy.
export const localInstantCopy = createCopy((key) =>
  resolveMessage(localInstantMessages, 'en', key),
);

export function useLocalInstantCopy() {
  return createCopy(useMessages(localInstantMessages));
}
