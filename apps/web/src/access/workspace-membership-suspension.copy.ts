import { defineMessages, useMessages } from '../localization/messages';

export const workspaceMembershipSuspensionCopy = {
  title: 'Workspace access',
  description:
    'Suspend an active member without deleting their identity, assignments, or history.',
  memberLabel: 'Member to suspend',
  selectMember: 'Select a member',
  review: 'Review suspension',
  confirmationRegionLabel: 'Confirm Workspace access suspension',
  confirmation:
    'Their application access will stop. Their identity, assignments, and history will be preserved. Existing identity-provider sessions will also be revoked across this application.',
  selectedMemberLabel: 'Selected member',
  cancel: 'Cancel',
  confirm: 'Suspend access',
  submitting: 'Suspending Workspace access…',
  suspended: 'Member suspended. Server state refreshed.',
  error: 'The suspension could not be completed. Server state was refreshed.',
  empty: 'No active member is available for suspension.',
  activityActionLabels: {
    'workspace_sessions.revoked': 'revoked existing provider sessions for',
    'workspace_sessions.revocation_retry_required':
      'recorded a required provider-session retry for',
    'workspace_membership.suspended': 'suspended Workspace access for',
  },
} as const;

const keys = [
  'title',
  'description',
  'memberLabel',
  'selectMember',
  'review',
  'confirmationRegionLabel',
  'confirmation',
  'selectedMemberLabel',
  'cancel',
  'confirm',
  'submitting',
  'suspended',
  'error',
  'empty',
] as const;

export const workspaceMembershipSuspensionMessages = defineMessages(keys, {
  ro: {
    title: 'Acces la spațiul de lucru',
    description:
      'Suspendă accesul unui membru activ fără a șterge identitatea, atribuirile sau istoricul.',
    memberLabel: 'Membru de suspendat',
    selectMember: 'Selectează un membru',
    review: 'Examinează suspendarea',
    confirmationRegionLabel:
      'Confirmă suspendarea accesului la spațiul de lucru',
    confirmation:
      'Accesul la aplicație va fi oprit. Identitatea, atribuirile și istoricul vor fi păstrate. Sesiunile existente ale furnizorului de identitate vor fi, de asemenea, revocate în întreaga aplicație.',
    selectedMemberLabel: 'Membru selectat',
    cancel: 'Anulează',
    confirm: 'Suspendă accesul',
    submitting: 'Se suspendă accesul la spațiul de lucru…',
    suspended:
      'Membrul a fost suspendat. Starea serverului a fost actualizată.',
    error:
      'Suspendarea nu a putut fi finalizată. Starea serverului a fost actualizată.',
    empty: 'Nu există niciun membru activ disponibil pentru suspendare.',
  },
  ru: {
    title: 'Доступ к рабочему пространству',
    description:
      'Приостановите доступ действующего участника без удаления идентификационных данных, назначений или истории.',
    memberLabel: 'Участник для приостановки доступа',
    selectMember: 'Выберите участника',
    review: 'Проверить приостановку доступа',
    confirmationRegionLabel:
      'Подтвердить приостановку доступа к рабочему пространству',
    confirmation:
      'Доступ к приложению будет прекращён. Идентификационные данные, назначения и история будут сохранены. Существующие сеансы поставщика идентификации также будут отозваны во всём приложении.',
    selectedMemberLabel: 'Выбранный участник',
    cancel: 'Отмена',
    confirm: 'Приостановить доступ',
    submitting: 'Приостановка доступа к рабочему пространству…',
    suspended: 'Доступ участника приостановлен. Состояние сервера обновлено.',
    error:
      'Не удалось завершить приостановку доступа. Состояние сервера обновлено.',
    empty: 'Нет действующих участников для приостановки доступа.',
  },
  fr: {
    title: 'Accès à l’espace de travail',
    description:
      'Suspendez l’accès d’un membre actif sans supprimer son identité, ses attributions ou son historique.',
    memberLabel: 'Membre à suspendre',
    selectMember: 'Sélectionnez un membre',
    review: 'Examiner la suspension',
    confirmationRegionLabel:
      'Confirmer la suspension de l’accès à l’espace de travail',
    confirmation:
      'L’accès à l’application sera interrompu. L’identité, les attributions et l’historique seront conservés. Les sessions existantes du fournisseur d’identité seront également révoquées dans toute l’application.',
    selectedMemberLabel: 'Membre sélectionné',
    cancel: 'Annuler',
    confirm: 'Suspendre l’accès',
    submitting: 'Suspension de l’accès à l’espace de travail…',
    suspended: 'Membre suspendu. L’état du serveur a été actualisé.',
    error:
      'La suspension n’a pas pu être terminée. L’état du serveur a été actualisé.',
    empty: 'Aucun membre actif n’est disponible pour une suspension.',
  },
  en: workspaceMembershipSuspensionCopy,
});

export function useWorkspaceMembershipSuspensionCopy() {
  const message = useMessages(workspaceMembershipSuspensionMessages);
  return {
    title: message('title'),
    description: message('description'),
    memberLabel: message('memberLabel'),
    selectMember: message('selectMember'),
    review: message('review'),
    confirmationRegionLabel: message('confirmationRegionLabel'),
    confirmation: message('confirmation'),
    selectedMemberLabel: message('selectedMemberLabel'),
    cancel: message('cancel'),
    confirm: message('confirm'),
    submitting: message('submitting'),
    suspended: message('suspended'),
    error: message('error'),
    empty: message('empty'),
  };
}
