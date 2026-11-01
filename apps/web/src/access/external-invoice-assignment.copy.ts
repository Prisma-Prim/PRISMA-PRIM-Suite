import { defineMessages, useMessages } from '../localization/messages';

export const externalInvoiceAssignmentMessages = defineMessages(
  [
    'readerBundle',
    'recorderBundle',
    'familyBundle',
    'prerequisites',
    'readerGranted',
    'readerRevoked',
    'recorderGranted',
    'recorderRevoked',
    'familyGranted',
    'familyRevoked',
  ],
  {
    ro: {
      readerBundle: 'Cititor de facturi al companiei',
      recorderBundle: 'Responsabil cu înregistrarea facturilor companiei',
      familyBundle: 'Acces la facturile externe ale companiei',
      prerequisites:
        'Atribuire explicită v1. Cititorul permite citirea financiară; responsabilul permite citirea și gestionarea financiară. Accesul la familia de facturi externe, documente, conținut, Client și Contract rămâne autorizat separat. Niciun pachet nu validează emiterea fiscală.',
      readerGranted: 'a acordat acces de cititor de facturi al companiei',
      readerRevoked: 'a revocat accesul de cititor de facturi al companiei',
      recorderGranted: 'a acordat acces de înregistrare a facturilor companiei',
      recorderRevoked:
        'a revocat accesul de înregistrare a facturilor companiei',
      familyGranted: 'a acordat acces la facturile externe ale companiei',
      familyRevoked: 'a revocat accesul la facturile externe ale companiei',
    },
    ru: {
      readerBundle: 'Чтение счетов Компании',
      recorderBundle: 'Регистрация счетов Компании',
      familyBundle: 'Доступ к внешним счетам Компании',
      prerequisites:
        'Явное назначение v1. Читатель разрешает финансовое чтение; регистратор — финансовое чтение и управление. Доступ к семейству внешних счетов, документам, содержимому, Клиенту и Договору предоставляется отдельно. Ни один пакет не подтверждает фискальную выдачу.',
      readerGranted: '— предоставление доступа к чтению счетов Компании',
      readerRevoked: '— отзыв доступа к чтению счетов Компании',
      recorderGranted: '— предоставление доступа к регистрации счетов Компании',
      recorderRevoked: '— отзыв доступа к регистрации счетов Компании',
      familyGranted: '— предоставление доступа к внешним счетам Компании',
      familyRevoked: '— отзыв доступа к внешним счетам Компании',
    },
    fr: {
      readerBundle: 'Lecteur des factures de la société',
      recorderBundle: 'Responsable de la saisie des factures de la société',
      familyBundle: 'Accès aux factures externes de la société',
      prerequisites:
        'Attribution explicite v1. Le lecteur permet la lecture financière ; le responsable permet la lecture et la gestion financières. Les accès à la famille des factures externes, aux documents, au contenu, au Client et au Contrat restent autorisés séparément. Aucun lot ne valide l’émission fiscale.',
      readerGranted: 'a accordé la lecture des factures de la société',
      readerRevoked: 'a révoqué la lecture des factures de la société',
      recorderGranted: 'a accordé la saisie des factures de la société',
      recorderRevoked: 'a révoqué la saisie des factures de la société',
      familyGranted: 'a accordé l’accès aux factures externes de la société',
      familyRevoked: 'a révoqué l’accès aux factures externes de la société',
    },
    en: {
      readerBundle: 'Company Invoice Reader',
      recorderBundle: 'Company Invoice Recorder',
      familyBundle: 'Company External Invoice Access',
      prerequisites:
        'Explicit v1 assignment. Reader permits financial read; Recorder permits financial read and management. External-invoice family, Document, content, Client and Contract access remain separately authorized. No bundle validates fiscal issuance.',
      readerGranted: 'granted Company Invoice Reader access',
      readerRevoked: 'revoked Company Invoice Reader access',
      recorderGranted: 'granted Company Invoice Recorder access',
      recorderRevoked: 'revoked Company Invoice Recorder access',
      familyGranted: 'granted Company External Invoice Access',
      familyRevoked: 'revoked Company External Invoice Access',
    },
  },
);
export function useExternalInvoiceAssignmentCopy() {
  return useMessages(externalInvoiceAssignmentMessages);
}
