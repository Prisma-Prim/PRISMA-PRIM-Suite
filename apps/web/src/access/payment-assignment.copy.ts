import { defineMessages, useMessages } from '../localization/messages';

export const paymentAssignmentMessages = defineMessages(
  [
    'readerBundle',
    'recorderBundle',
    'confirmerBundle',
    'reverserBundle',
    'familyBundle',
    'prerequisites',
    'readerGranted',
    'readerRevoked',
    'recorderGranted',
    'recorderRevoked',
    'confirmerGranted',
    'confirmerRevoked',
    'reverserGranted',
    'reverserRevoked',
    'familyGranted',
    'familyRevoked',
  ],
  {
    ro: {
      readerBundle: 'Cititor de plăți al companiei',
      recorderBundle: 'Responsabil cu înregistrarea plăților companiei',
      confirmerBundle: 'Responsabil cu confirmarea plăților companiei',
      reverserBundle: 'Responsabil cu inversarea plăților companiei',
      familyBundle: 'Acces la dovezile de plată ale companiei',
      prerequisites:
        'Fiecare rol permite citirea dovezilor de plată împreună cu accesul separat la familie, Documente și Client. Numai responsabilul cu înregistrarea poate modifica sursa. Copierea și afișarea identității complete a plătitorului necesită separat citirea identității Clientului companiei; conținutul PDF are drepturi proprii.',
      readerGranted: 'a acordat: Cititor de plăți al companiei',
      readerRevoked: 'a revocat: Cititor de plăți al companiei',
      recorderGranted:
        'a acordat: Responsabil cu înregistrarea plăților companiei',
      recorderRevoked:
        'a revocat: Responsabil cu înregistrarea plăților companiei',
      confirmerGranted:
        'a acordat: Responsabil cu confirmarea plăților companiei',
      confirmerRevoked:
        'a revocat: Responsabil cu confirmarea plăților companiei',
      reverserGranted:
        'a acordat: Responsabil cu inversarea plăților companiei',
      reverserRevoked:
        'a revocat: Responsabil cu inversarea plăților companiei',
      familyGranted: 'a acordat: Acces la dovezile de plată ale companiei',
      familyRevoked: 'a revocat: Acces la dovezile de plată ale companiei',
    },
    ru: {
      readerBundle: 'Чтение платежей Компании',
      recorderBundle: 'Регистрация платежей Компании',
      confirmerBundle: 'Подтверждение платежей Компании',
      reverserBundle: 'Сторнирование платежей Компании',
      familyBundle: 'Доступ к платёжным доказательствам Компании',
      prerequisites:
        'Каждая роль позволяет читать платёжные доказательства при отдельном доступе к семейству, Документам и Клиенту. Только регистратор может изменять источник. Копирование и показ полной сохранённой личности плательщика требуют отдельного чтения данных Клиента Компании; PDF имеет собственные права доступа.',
      readerGranted: '— предоставление: Чтение платежей Компании',
      readerRevoked: '— отзыв: Чтение платежей Компании',
      recorderGranted: '— предоставление: Регистрация платежей Компании',
      recorderRevoked: '— отзыв: Регистрация платежей Компании',
      confirmerGranted: '— предоставление: Подтверждение платежей Компании',
      confirmerRevoked: '— отзыв: Подтверждение платежей Компании',
      reverserGranted: '— предоставление: Сторнирование платежей Компании',
      reverserRevoked: '— отзыв: Сторнирование платежей Компании',
      familyGranted:
        '— предоставление: Доступ к платёжным доказательствам Компании',
      familyRevoked: '— отзыв: Доступ к платёжным доказательствам Компании',
    },
    fr: {
      readerBundle: 'Lecteur des paiements de la société',
      recorderBundle: 'Responsable de la saisie des paiements de la société',
      confirmerBundle:
        'Responsable de la confirmation des paiements de la société',
      reverserBundle: 'Responsable de l’inversion des paiements de la société',
      familyBundle: 'Accès aux preuves de paiement de la société',
      prerequisites:
        'Chaque rôle permet de lire les preuves de paiement avec les accès distincts à la famille, aux Documents et au Client. Seul le responsable de la saisie peut modifier la source. Copier et afficher l’identité complète du payeur demande aussi la lecture de l’identité du Client de la société ; le PDF conserve ses propres droits.',
      readerGranted: 'a accordé : Lecteur des paiements de la société',
      readerRevoked: 'a révoqué : Lecteur des paiements de la société',
      recorderGranted:
        'a accordé : Responsable de la saisie des paiements de la société',
      recorderRevoked:
        'a révoqué : Responsable de la saisie des paiements de la société',
      confirmerGranted:
        'a accordé : Responsable de la confirmation des paiements de la société',
      confirmerRevoked:
        'a révoqué : Responsable de la confirmation des paiements de la société',
      reverserGranted:
        'a accordé : Responsable de l’inversion des paiements de la société',
      reverserRevoked:
        'a révoqué : Responsable de l’inversion des paiements de la société',
      familyGranted: 'a accordé : Accès aux preuves de paiement de la société',
      familyRevoked: 'a révoqué : Accès aux preuves de paiement de la société',
    },
    en: {
      readerBundle: 'Company Payment Reader',
      recorderBundle: 'Company Payment Recorder',
      confirmerBundle: 'Company Payment Confirmer',
      reverserBundle: 'Company Payment Reverser',
      familyBundle: 'Company Payment Evidence Access',
      prerequisites:
        'Each role permits payment-evidence reading with separate family, Document and Client access. Only Recorder permits source editing. Copying and displaying the full payer identity also requires Company Client identity read; PDF content retains its own rights.',
      readerGranted: 'granted: Company Payment Reader',
      readerRevoked: 'revoked: Company Payment Reader',
      recorderGranted: 'granted: Company Payment Recorder',
      recorderRevoked: 'revoked: Company Payment Recorder',
      confirmerGranted: 'granted: Company Payment Confirmer',
      confirmerRevoked: 'revoked: Company Payment Confirmer',
      reverserGranted: 'granted: Company Payment Reverser',
      reverserRevoked: 'revoked: Company Payment Reverser',
      familyGranted: 'granted: Company Payment Evidence Access',
      familyRevoked: 'revoked: Company Payment Evidence Access',
    },
  },
);
export function usePaymentAssignmentCopy() {
  return useMessages(paymentAssignmentMessages);
}
