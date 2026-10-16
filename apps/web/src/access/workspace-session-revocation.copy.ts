import { defineMessages, useMessages } from '../localization/messages';

export const sessionRevocationCopy = {
  title: 'Identity-provider sessions',
  description:
    'Suspended members remain blocked from this Workspace even if session revocation needs another attempt. Revocation signs the person out of all sessions in this application, including sessions used for other Workspaces.',
  refresh: 'Check session revocations',
  more: 'Next suspended members',
  retry: 'Retry session revocation',
  pending: 'Checking session revocations…',
  empty: 'No suspended members on this page.',
  error:
    'Session revocation status could not be verified. Workspace access remains suspended.',
  status: {
    pending: 'Session revocation pending.',
    running: 'Session revocation in progress. Check again shortly.',
    retry_required:
      'Session revocation needs another attempt. Retry after 30 seconds.',
    complete:
      'Existing provider sessions revoked. Workspace access remains suspended.',
  },
};

const keys = [
  'title',
  'description',
  'refresh',
  'more',
  'retry',
  'pending',
  'empty',
  'error',
  'statusPending',
  'statusRunning',
  'statusRetryRequired',
  'statusComplete',
] as const;

export const sessionRevocationMessages = defineMessages(keys, {
  ro: {
    title: 'Sesiunile furnizorului de identitate',
    description:
      'Membrii suspendați rămân blocați în acest spațiu de lucru chiar dacă revocarea sesiunilor necesită o nouă încercare. Revocarea deconectează persoana din toate sesiunile acestei aplicații, inclusiv cele folosite pentru alte spații de lucru.',
    refresh: 'Verifică revocarea sesiunilor',
    more: 'Următorii membri suspendați',
    retry: 'Reîncearcă revocarea sesiunilor',
    pending: 'Se verifică revocarea sesiunilor…',
    empty: 'Nu există membri suspendați pe această pagină.',
    error:
      'Starea revocării sesiunilor nu a putut fi verificată. Accesul la spațiul de lucru rămâne suspendat.',
    statusPending: 'Revocarea sesiunilor este în așteptare.',
    statusRunning:
      'Revocarea sesiunilor este în curs. Verifică din nou în curând.',
    statusRetryRequired:
      'Revocarea sesiunilor necesită o nouă încercare. Reîncearcă după 30 de secunde.',
    statusComplete:
      'Sesiunile existente ale furnizorului au fost revocate. Accesul la spațiul de lucru rămâne suspendat.',
  },
  ru: {
    title: 'Сеансы поставщика идентификации',
    description:
      'Участники с приостановленным доступом остаются заблокированными в этом рабочем пространстве, даже если отзыв сеансов требует ещё одной попытки. Отзыв завершает все сеансы человека в этом приложении, включая сеансы для других рабочих пространств.',
    refresh: 'Проверить отзыв сеансов',
    more: 'Следующие участники с приостановленным доступом',
    retry: 'Повторить отзыв сеансов',
    pending: 'Проверка отзыва сеансов…',
    empty: 'На этой странице нет участников с приостановленным доступом.',
    error:
      'Не удалось проверить состояние отзыва сеансов. Доступ к рабочему пространству остаётся приостановленным.',
    statusPending: 'Отзыв сеансов ожидает выполнения.',
    statusRunning: 'Отзыв сеансов выполняется. Проверьте ещё раз чуть позже.',
    statusRetryRequired:
      'Требуется ещё одна попытка отзыва сеансов. Повторите через 30 секунд.',
    statusComplete:
      'Существующие сеансы поставщика отозваны. Доступ к рабочему пространству остаётся приостановленным.',
  },
  fr: {
    title: 'Sessions du fournisseur d’identité',
    description:
      'Les membres suspendus restent bloqués dans cet espace de travail même si la révocation des sessions nécessite une nouvelle tentative. La révocation déconnecte la personne de toutes ses sessions dans cette application, y compris celles utilisées pour d’autres espaces de travail.',
    refresh: 'Vérifier la révocation des sessions',
    more: 'Membres suspendus suivants',
    retry: 'Réessayer la révocation des sessions',
    pending: 'Vérification de la révocation des sessions…',
    empty: 'Aucun membre suspendu sur cette page.',
    error:
      'Impossible de vérifier la révocation des sessions. L’accès à l’espace de travail reste suspendu.',
    statusPending: 'Révocation des sessions en attente.',
    statusRunning:
      'Révocation des sessions en cours. Vérifiez à nouveau dans un instant.',
    statusRetryRequired:
      'La révocation des sessions nécessite une nouvelle tentative. Réessayez après 30 secondes.',
    statusComplete:
      'Les sessions existantes du fournisseur sont révoquées. L’accès à l’espace de travail reste suspendu.',
  },
  en: {
    title: sessionRevocationCopy.title,
    description: sessionRevocationCopy.description,
    refresh: sessionRevocationCopy.refresh,
    more: sessionRevocationCopy.more,
    retry: sessionRevocationCopy.retry,
    pending: sessionRevocationCopy.pending,
    empty: sessionRevocationCopy.empty,
    error: sessionRevocationCopy.error,
    statusPending: sessionRevocationCopy.status.pending,
    statusRunning: sessionRevocationCopy.status.running,
    statusRetryRequired: sessionRevocationCopy.status.retry_required,
    statusComplete: sessionRevocationCopy.status.complete,
  },
});

export function useSessionRevocationCopy() {
  const message = useMessages(sessionRevocationMessages);
  return {
    title: message('title'),
    description: message('description'),
    refresh: message('refresh'),
    more: message('more'),
    retry: message('retry'),
    pending: message('pending'),
    empty: message('empty'),
    error: message('error'),
    status: {
      pending: message('statusPending'),
      running: message('statusRunning'),
      retry_required: message('statusRetryRequired'),
      complete: message('statusComplete'),
    },
  };
}
