import { defineMessages, useMessages } from '../localization/messages';

const keys = ['ruleSet', 'adjustedSnapshot'] as const;

export const offerBindingMessages = defineMessages(keys, {
  en: {
    ruleSet: 'Quality Check rule set',
    adjustedSnapshot:
      'This version references an adjusted Pricing Snapshot. Each fixed discount is shown as recorded and is not recalculated.',
  },
  fr: {
    ruleSet: 'Ensemble de règles des contrôles qualité',
    adjustedSnapshot:
      'Cette version référence un instantané de tarification ajusté. Chaque remise fixe est affichée telle qu’enregistrée et n’est pas recalculée.',
  },
  ro: {
    ruleSet: 'Setul de reguli pentru verificările de calitate',
    adjustedSnapshot:
      'Această versiune folosește un instantaneu de preț ajustat. Fiecare reducere fixă este afișată așa cum a fost înregistrată și nu este recalculată.',
  },
  ru: {
    ruleSet: 'Набор правил проверок качества',
    adjustedSnapshot:
      'Эта версия ссылается на скорректированный снимок цены. Каждая фиксированная скидка показана в записанном виде и не пересчитывается.',
  },
});

export const useOfferBindingCopy = () => useMessages(offerBindingMessages);
