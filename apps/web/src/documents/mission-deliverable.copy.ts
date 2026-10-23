import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'family',
  'questionnaire',
  'mission',
  'bundle',
  'prerequisites',
  'draft',
  'official',
  'warning',
  'granted',
  'revoked',
] as const;
export const missionDeliverableMessages = defineMessages(keys, {
  en: {
    family: 'Document family',
    questionnaire: 'Questionnaire reference',
    mission: 'Mission deliverable PDF',
    bundle: 'Company Mission Deliverable Access',
    prerequisites:
      'Allows access to mission deliverables only. Document, Client, PDF content, Version and Project rights remain separately required.',
    draft: 'Mission deliverable draft · Company-confidential',
    official: 'Official mission deliverable · Company-confidential',
    warning:
      'A mission deliverable preserves PDF content. An official Version records an internal designation; it does not prove signature or business acceptance.',
    granted: 'granted Company Mission Deliverable Access',
    revoked: 'revoked Company Mission Deliverable Access',
  },
  fr: {
    family: 'Famille de document',
    questionnaire: 'Référence de questionnaire',
    mission: 'Livrable de mission PDF',
    bundle: 'Accès aux livrables de mission de la société',
    prerequisites:
      'Permet l’accès aux livrables de mission. Les droits Document, Client, contenu PDF, Version et Projet restent nécessaires séparément.',
    draft: 'Livrable de mission en brouillon · Confidentiel société',
    official: 'Livrable de mission officiel · Confidentiel société',
    warning:
      'Un livrable de mission conserve le contenu PDF. Une Version officielle indique une désignation interne ; elle ne prouve ni signature ni acceptation métier.',
    granted: 'a accordé l’accès aux livrables de mission de la société',
    revoked: 'a révoqué l’accès aux livrables de mission de la société',
  },
  ro: {
    family: 'Familia documentului',
    questionnaire: 'Referință de chestionar',
    mission: 'Livrabil de misiune PDF',
    bundle: 'Acces la livrabilele misiunii companiei',
    prerequisites:
      'Permite accesul la livrabilele misiunii. Drepturile pentru Document, Client, conținut PDF, Versiune și Proiect rămân necesare separat.',
    draft: 'Livrabil de misiune în ciornă · Confidențial companiei',
    official: 'Livrabil de misiune oficial · Confidențial companiei',
    warning:
      'Un livrabil de misiune păstrează conținutul PDF. O Versiune oficială indică o desemnare internă; nu dovedește semnarea sau acceptarea comercială.',
    granted: 'a acordat accesul la livrabilele misiunii companiei',
    revoked: 'a revocat accesul la livrabilele misiunii companiei',
  },
  ru: {
    family: 'Семейство документа',
    questionnaire: 'Ссылка на анкету',
    mission: 'Результат миссии PDF',
    bundle: 'Доступ к результатам миссии компании',
    prerequisites:
      'Открывает доступ к результатам миссии. Права на Документ, Клиента, содержимое PDF, Версию и Проект требуются отдельно.',
    draft: 'Черновик результата миссии · Конфиденциально компании',
    official: 'Официальный результат миссии · Конфиденциально компании',
    warning:
      'Результат миссии сохраняет содержимое PDF. Официальная Версия означает внутреннее назначение; она не доказывает подписание или коммерческое принятие.',
    granted: 'предоставил доступ к результатам миссии компании',
    revoked: 'отозвал доступ к результатам миссии компании',
  },
});
export function useMissionDeliverableCopy() {
  const t = useMessages(missionDeliverableMessages);
  return {
    t,
    activityActionLabels: {
      'company_mission_deliverable_access_assignment.granted': t('granted'),
      'company_mission_deliverable_access_assignment.revoked': t('revoked'),
    },
  };
}
