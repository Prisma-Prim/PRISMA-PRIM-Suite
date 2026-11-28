import { defineMessages, useMessages } from '../../localization/messages';

const keys = [
  'costingSummary',
  'offerPathTitle',
  'offerPathPrepared',
  'offerPathDecision',
  'offerPathTransmission',
  'offerPathResponse',
  'offerPathNone',
  'offerPathNoneHelp',
] as const;

export type CommercialStageMessageKey = (typeof keys)[number];

/** The Costing and Offer stages of the deal page (#1534). */
export const commercialStageMessages = defineMessages(keys, {
  ro: {
    costingSummary: 'Pe scurt',
    offerPathTitle: 'Etapele Ofertei',
    offerPathPrepared: 'Pregătită',
    offerPathDecision: 'Decizie internă',
    offerPathTransmission: 'Transmitere simulată',
    offerPathResponse: 'Răspunsul Clientului',
    offerPathNone: 'Nicio Ofertă pregătită deocamdată.',
    offerPathNoneHelp:
      'Pregătiți versiunea 1 dintr-un calcul de preț, dintr-o estimare aprobată sau din modelul aprobat.',
  },
  ru: {
    costingSummary: 'Кратко',
    offerPathTitle: 'Этапы Оферты',
    offerPathPrepared: 'Подготовлена',
    offerPathDecision: 'Внутреннее решение',
    offerPathTransmission: 'Симуляция отправки',
    offerPathResponse: 'Ответ Клиента',
    offerPathNone: 'Оферта ещё не подготовлена.',
    offerPathNoneHelp:
      'Подготовьте версию 1 из расчёта цены, из утверждённой оценки или из утверждённой модели.',
  },
  fr: {
    costingSummary: 'En bref',
    offerPathTitle: 'Étapes de l’Offre',
    offerPathPrepared: 'Préparée',
    offerPathDecision: 'Décision interne',
    offerPathTransmission: 'Transmission simulée',
    offerPathResponse: 'Réponse du Client',
    offerPathNone: 'Aucune Offre préparée pour l’instant.',
    offerPathNoneHelp:
      'Préparez la version 1 à partir d’un calcul de prix, d’une estimation approuvée ou du modèle approuvé.',
  },
  en: {
    costingSummary: 'At a glance',
    offerPathTitle: 'Offer path',
    offerPathPrepared: 'Prepared',
    offerPathDecision: 'Internal decision',
    offerPathTransmission: 'Simulated transmission',
    offerPathResponse: 'Client response',
    offerPathNone: 'No Offer prepared yet.',
    offerPathNoneHelp:
      'Prepare version 1 from a pricing snapshot, an approved estimate or the approved model.',
  },
});

export function useCommercialStageCopy() {
  return useMessages(commercialStageMessages);
}
