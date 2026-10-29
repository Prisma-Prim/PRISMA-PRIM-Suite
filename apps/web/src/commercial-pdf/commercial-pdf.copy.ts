import { useInterfaceLocale } from '../localization/interface-locale';
const copy = {
  ro: {
    selectedHtml: 'HTML-ul exact selectat',
    exactTarget: 'Ținta exactă PDF',
    limit:
      'Conținutul depășește limita copiei PDF. HTML-ul exact rămâne disponibil.',
    unavailable:
      'Această versiune nu este disponibilă ca PDF. Consultați HTML-ul exact când este autorizat.',
    offer: 'Ofertă',
    contract: 'Contract',
    action: 'Descarcă PDF neoficial',
    pending: 'Se pregătește copia PDF exactă…',
    offered: 'Copia PDF neoficială a fost oferită pentru descărcare.',
    denied: 'Accesul la această copie nu mai este disponibil.',
    unsupported:
      'PDF indisponibil pentru acest conținut. Consultați sau descărcați HTML-ul exact.',
    stale: 'Sursa nu mai corespunde. Redeschideți această versiune exactă.',
    malformed: 'Răspunsul PDF nu este valid. HTML-ul exact rămâne disponibil.',
    error: 'Copia PDF nu a putut fi descărcată. Reîncercați.',
    retry: 'Reîncearcă PDF neoficial',
  },
  ru: {
    selectedHtml: 'Выбранный точный HTML',
    exactTarget: 'Точная цель PDF',
    limit:
      'Содержимое превышает лимит PDF-копии. Точный HTML остаётся доступным.',
    unavailable:
      'Эта версия недоступна в PDF. Откройте точный HTML при наличии доступа.',
    offer: 'Предложение',
    contract: 'Договор',
    action: 'Скачать неофициальный PDF',
    pending: 'Подготовка точной PDF-копии…',
    offered: 'Неофициальный PDF предложен для скачивания.',
    denied: 'Доступ к этой копии больше недоступен.',
    unsupported:
      'PDF недоступен для этого содержимого. Откройте или скачайте точный HTML.',
    stale: 'Источник не совпадает. Откройте эту точную версию заново.',
    malformed: 'Некорректный ответ PDF. Точный HTML остаётся доступным.',
    error: 'Не удалось скачать PDF. Повторите попытку.',
    retry: 'Повторить скачивание неофициального PDF',
  },
  fr: {
    selectedHtml: 'HTML exact sélectionné',
    exactTarget: 'Cible PDF exacte',
    limit:
      'Le contenu dépasse la limite de la copie PDF. Le HTML exact reste disponible.',
    unavailable:
      'Cette version est indisponible en PDF. Consultez le HTML exact si vous y avez accès.',
    offer: 'Offre',
    contract: 'Contrat',
    action: 'Télécharger le PDF non officiel',
    pending: 'Préparation de la copie PDF exacte…',
    offered: 'La copie PDF non officielle a été proposée au téléchargement.',
    denied: 'L’accès à cette copie n’est plus disponible.',
    unsupported:
      'PDF indisponible pour ce contenu. Consultez ou téléchargez le HTML exact.',
    stale: 'La source ne correspond plus. Rouvrez cette version exacte.',
    malformed: 'La réponse PDF est invalide. Le HTML exact reste disponible.',
    error: 'Le téléchargement du PDF a échoué. Réessayez.',
    retry: 'Réessayer le PDF non officiel',
  },
  en: {
    selectedHtml: 'Selected exact HTML',
    exactTarget: 'Exact PDF target',
    limit:
      'The content exceeds the PDF copy limit. The exact HTML remains available.',
    unavailable:
      'This Version is unavailable as PDF. View its exact HTML when authorized.',
    offer: 'Offer',
    contract: 'Contract',
    action: 'Download non-official PDF',
    pending: 'Preparing the exact PDF copy…',
    offered: 'The non-official PDF copy was offered for download.',
    denied: 'Access to this copy is no longer available.',
    unsupported:
      'PDF unavailable for this content. View or download the exact HTML.',
    stale: 'The source no longer matches. Reopen this exact Version.',
    malformed: 'The PDF response is invalid. The exact HTML remains available.',
    error: 'The PDF download failed. Try again.',
    retry: 'Retry non-official PDF',
  },
};
export function useCommercialPdfCopy() {
  return copy[useInterfaceLocale().locale];
}
