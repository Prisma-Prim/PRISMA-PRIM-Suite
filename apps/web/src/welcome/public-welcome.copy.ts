import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'product',
  'eyebrow',
  'title',
  'description',
  'invitationOnly',
  'signIn',
  'workflowLabel',
  'workflowRequests',
  'workflowDocuments',
  'workflowDecisions',
] as const;

export const publicWelcomeMessages = defineMessages(keys, {
  ro: {
    product: 'PRISMA-PRIM Suite',
    eyebrow: 'Lucrați cu claritate',
    title: 'Faceți fiecare decizie trasabilă.',
    description:
      'Un spațiu de lucru clar pentru solicitări de consultanță, documente guvernate și livrare responsabilă.',
    invitationOnly: 'Accesul se face numai pe bază de invitație.',
    signIn: 'Continuați pentru autentificare',
    workflowLabel: 'Fluxul produsului',
    workflowRequests: 'Solicitări',
    workflowDocuments: 'Documente',
    workflowDecisions: 'Decizii',
  },
  ru: {
    product: 'PRISMA-PRIM Suite',
    eyebrow: 'Работайте ясно',
    title: 'Сделайте каждое решение отслеживаемым.',
    description:
      'Единое рабочее пространство для консультационных запросов, управляемых документов и ответственного выполнения.',
    invitationOnly: 'Доступ предоставляется только по приглашению.',
    signIn: 'Перейти ко входу',
    workflowLabel: 'Рабочий процесс продукта',
    workflowRequests: 'Запросы',
    workflowDocuments: 'Документы',
    workflowDecisions: 'Решения',
  },
  fr: {
    product: 'PRISMA-PRIM Suite',
    eyebrow: 'Travaillez avec clarté',
    title: 'Rendez chaque décision traçable.',
    description:
      'Un espace de travail clair pour les demandes de conseil, les documents gouvernés et une livraison responsable.',
    invitationOnly: 'L’accès se fait uniquement sur invitation.',
    signIn: 'Continuer vers la connexion',
    workflowLabel: 'Parcours du produit',
    workflowRequests: 'Demandes',
    workflowDocuments: 'Documents',
    workflowDecisions: 'Décisions',
  },
  en: {
    product: 'PRISMA-PRIM Suite',
    eyebrow: 'Work with clarity',
    title: 'Make every decision traceable.',
    description:
      'A focused workspace for consulting requests, governed documents and accountable delivery.',
    invitationOnly: 'Access is invitation-only.',
    signIn: 'Continue to sign in',
    workflowLabel: 'Product workflow',
    workflowRequests: 'Requests',
    workflowDocuments: 'Documents',
    workflowDecisions: 'Decisions',
  },
});

export function usePublicWelcomeCopy() {
  const message = useMessages(publicWelcomeMessages);
  return {
    product: message('product'),
    eyebrow: message('eyebrow'),
    title: message('title'),
    description: message('description'),
    invitationOnly: message('invitationOnly'),
    signIn: message('signIn'),
    workflowLabel: message('workflowLabel'),
    workflow: [
      message('workflowRequests'),
      message('workflowDocuments'),
      message('workflowDecisions'),
    ],
  };
}
