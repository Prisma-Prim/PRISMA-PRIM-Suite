import { defineMessages, useMessages } from '../localization/messages';
const keys = [
  'create',
  'banner',
  'source',
  'pending',
  'accepted',
  'unavailable',
  'choose',
  'reload',
  'offer',
  'version',
  'scope',
  'commercial',
  'price',
] as const;
export const contractPreparationMessages = defineMessages(keys, {
  en: {
    scope: 'Source scope',
    commercial: 'Source commercial conditions',
    price: 'Source pricing',
    create: 'Prepare Contract before acceptance',
    banner:
      'This internal draft records no acceptance. Approval and signature require explicit acceptance of its exact source Offer Version.',
    source: 'Source Offer',
    pending: 'Awaiting Client response',
    accepted: 'Source Offer accepted',
    unavailable:
      'This source is unavailable for a new preparation. Reload and select an eligible same-party Offer Version.',
    choose: 'Choose a source Offer Version',
    reload: 'Reload available source',
    offer: 'Offer',
    version: 'Version',
  },
  fr: {
    scope: 'Périmètre de l’offre source',
    commercial: 'Conditions commerciales de l’offre source',
    price: 'Prix de l’offre source',
    create: 'Préparer le contrat avant acceptation',
    banner:
      'Ce brouillon interne n’enregistre aucune acceptation. L’approbation et la signature exigent l’acceptation explicite de sa version exacte d’offre source.',
    source: 'Offre source',
    pending: 'En attente de réponse du client',
    accepted: 'Offre source acceptée',
    unavailable:
      'Cette source est indisponible pour une nouvelle préparation. Rechargez et sélectionnez une version éligible pour le même cocontractant.',
    choose: 'Choisir une version d’offre source',
    reload: 'Recharger la source disponible',
    offer: 'Offre',
    version: 'Version',
  },
  ro: {
    scope: 'Domeniul Ofertei sursă',
    commercial: 'Condițiile comerciale ale Ofertei sursă',
    price: 'Prețurile Ofertei sursă',
    create: 'Pregătește Contractul înainte de acceptare',
    banner:
      'Această schiță internă nu înregistrează acceptarea. Aprobarea și semnarea necesită acceptarea explicită a versiunii exacte a Ofertei sursă.',
    source: 'Oferta sursă',
    pending: 'În așteptarea răspunsului Clientului',
    accepted: 'Oferta sursă acceptată',
    unavailable:
      'Sursa nu este disponibilă pentru o pregătire nouă. Reîncarcă și selectează o versiune eligibilă pentru aceeași parte juridică.',
    choose: 'Alege versiunea Ofertei sursă',
    reload: 'Reîncarcă sursa disponibilă',
    offer: 'Ofertă',
    version: 'Versiune',
  },
  ru: {
    scope: 'Объём исходного предложения',
    commercial: 'Коммерческие условия исходного предложения',
    price: 'Цена исходного предложения',
    create: 'Подготовить договор до принятия предложения',
    banner:
      'Этот внутренний черновик не регистрирует принятие. Для одобрения и подписи требуется явное принятие точной версии исходного предложения.',
    source: 'Исходное предложение',
    pending: 'Ожидается ответ клиента',
    accepted: 'Исходное предложение принято',
    unavailable:
      'Источник недоступен для новой подготовки. Обновите и выберите допустимую версию для того же юридического лица.',
    choose: 'Выберите версию исходного предложения',
    reload: 'Обновить доступный источник',
    offer: 'Предложение',
    version: 'Версия',
  },
});
export const useContractPreparationCopy = () =>
  useMessages(contractPreparationMessages);
