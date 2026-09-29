import { defineMessages, useMessages } from '../localization/messages';

const english = {
  title: 'Workspace invitations',
  description:
    'Invite a person to this Workspace. An invitation does not grant membership, Company access or business permissions.',
  email: 'Recipient email',
  expiry: 'Expires in days',
  emailRequired: 'Enter the recipient email.',
  emailInvalid: 'Enter a valid email address.',
  expiryRequired: 'Enter the number of days before expiry.',
  expiryInvalid: 'Enter a whole number between 1 and 30.',
  send: 'Send invitation',
  loading: 'Loading invitations…',
  empty: 'No invitations on this page.',
  error:
    'The request could not be confirmed. Retry the same request to check its result.',
  forbidden: 'You no longer have permission to manage invitations.',
  refresh: 'Check invitation status',
  reload: 'Reload invitations',
  more: 'Next page',
  first: 'First page',
  revoke: 'Revoke invitation',
  confirm: 'Confirm revocation',
  cancel: 'Cancel',
  confirmation:
    'Revoke this invitation? A revoked invitation cannot be used to join this Workspace.',
  revocationPending:
    'Revocation recorded. The email link still requires confirmation from Clerk.',
  usedBeforeRevocation:
    'Clerk reports that this invitation was already used. Local revocation remains recorded; no Workspace access is granted here.',
  checkAfter: 'Next provider check available after',
  expires: 'Expires',
  consumed:
    'Accepted into the Workspace. Business access is assigned separately.',
  statuses: {
    uncertain:
      'Delivery unconfirmed — check status before sending another invitation.',
    pending: 'Invitation sent; awaiting use.',
    accepted:
      'Used at Clerk; Workspace admission is not granted by this invitation screen.',
    revoked: 'Revoked',
    expired: 'Expired',
    rejected:
      'Clerk rejected the invitation. Check the recipient and provider configuration.',
  },
  activityActionLabels: {
    'workspace_invitation.accepted': 'accepted a Workspace invitation',
    'workspace_invitation.issued': 'issued a Workspace invitation',
    'workspace_invitation.revoked': 'revoked a Workspace invitation',
  },
} as const;

const keys = [
  'title',
  'description',
  'email',
  'expiry',
  'emailRequired',
  'emailInvalid',
  'expiryRequired',
  'expiryInvalid',
  'send',
  'loading',
  'empty',
  'error',
  'forbidden',
  'refresh',
  'reload',
  'more',
  'first',
  'revoke',
  'confirm',
  'cancel',
  'confirmation',
  'revocationPending',
  'usedBeforeRevocation',
  'checkAfter',
  'expires',
  'consumed',
  'statusUncertain',
  'statusPending',
  'statusAccepted',
  'statusRevoked',
  'statusExpired',
  'statusRejected',
  'activityAccepted',
  'activityIssued',
  'activityRevoked',
] as const;

export const workspaceInvitationsMessages = defineMessages(keys, {
  ro: {
    title: 'Invitații în spațiul de lucru',
    description:
      'Invitați o persoană în acest spațiu de lucru. O invitație nu acordă apartenență, acces la Companie sau permisiuni de afaceri.',
    email: 'E-mailul destinatarului',
    expiry: 'Expiră în zile',
    emailRequired: 'Introduceți e-mailul destinatarului.',
    emailInvalid: 'Introduceți o adresă de e-mail validă.',
    expiryRequired: 'Introduceți numărul de zile până la expirare.',
    expiryInvalid: 'Introduceți un număr întreg între 1 și 30.',
    send: 'Trimiteți invitația',
    loading: 'Se încarcă invitațiile…',
    empty: 'Nu există invitații pe această pagină.',
    error:
      'Solicitarea nu a putut fi confirmată. Reîncercați exact aceeași solicitare pentru a-i verifica rezultatul.',
    forbidden: 'Nu mai aveți permisiunea de a gestiona invitațiile.',
    refresh: 'Verificați starea invitației',
    reload: 'Reîncărcați invitațiile',
    more: 'Pagina următoare',
    first: 'Prima pagină',
    revoke: 'Revocați invitația',
    confirm: 'Confirmați revocarea',
    cancel: 'Anulați',
    confirmation:
      'Revocați această invitație? O invitație revocată nu poate fi folosită pentru a intra în acest spațiu de lucru.',
    revocationPending:
      'Revocarea a fost înregistrată. Linkul din e-mail încă necesită confirmarea Clerk.',
    usedBeforeRevocation:
      'Clerk raportează că această invitație a fost deja folosită. Revocarea locală rămâne înregistrată; aici nu se acordă acces la spațiul de lucru.',
    checkAfter: 'Următoarea verificare la furnizor este disponibilă după',
    expires: 'Expiră',
    consumed:
      'Acceptată în spațiul de lucru. Accesul de afaceri se atribuie separat.',
    statusUncertain:
      'Livrare neconfirmată — verificați starea înainte de a trimite altă invitație.',
    statusPending: 'Invitație trimisă; se așteaptă folosirea ei.',
    statusAccepted:
      'Folosită la Clerk; accesul la spațiul de lucru nu este acordat de acest ecran de invitații.',
    statusRevoked: 'Revocată',
    statusExpired: 'Expirată',
    statusRejected:
      'Clerk a respins invitația. Verificați destinatarul și configurarea furnizorului.',
    activityAccepted: 'a acceptat o invitație în spațiul de lucru',
    activityIssued: 'a emis o invitație în spațiul de lucru',
    activityRevoked: 'a revocat o invitație în spațiul de lucru',
  },
  ru: {
    title: 'Приглашения в рабочее пространство',
    description:
      'Пригласите человека в это рабочее пространство. Приглашение не предоставляет членство, доступ к Компании или рабочие разрешения.',
    email: 'Электронная почта получателя',
    expiry: 'Срок действия в днях',
    emailRequired: 'Введите адрес электронной почты получателя.',
    emailInvalid: 'Введите действительный адрес электронной почты.',
    expiryRequired: 'Введите количество дней до истечения срока.',
    expiryInvalid: 'Введите целое число от 1 до 30.',
    send: 'Отправить приглашение',
    loading: 'Загрузка приглашений…',
    empty: 'На этой странице нет приглашений.',
    error:
      'Не удалось подтвердить запрос. Повторите тот же запрос, чтобы проверить его результат.',
    forbidden: 'У вас больше нет разрешения управлять приглашениями.',
    refresh: 'Проверить состояние приглашения',
    reload: 'Загрузить приглашения заново',
    more: 'Следующая страница',
    first: 'Первая страница',
    revoke: 'Отозвать приглашение',
    confirm: 'Подтвердить отзыв',
    cancel: 'Отмена',
    confirmation:
      'Отозвать это приглашение? Отозванное приглашение нельзя использовать для входа в это рабочее пространство.',
    revocationPending:
      'Отзыв зарегистрирован. Ссылка в письме всё ещё требует подтверждения Clerk.',
    usedBeforeRevocation:
      'Clerk сообщает, что это приглашение уже использовано. Локальный отзыв остаётся зарегистрированным; доступ к рабочему пространству здесь не предоставляется.',
    checkAfter: 'Следующая проверка у поставщика доступна после',
    expires: 'Истекает',
    consumed:
      'Принято в рабочее пространство. Рабочий доступ назначается отдельно.',
    statusUncertain:
      'Доставка не подтверждена — проверьте состояние перед отправкой другого приглашения.',
    statusPending: 'Приглашение отправлено; ожидается его использование.',
    statusAccepted:
      'Использовано в Clerk; этот экран приглашений не предоставляет доступ к рабочему пространству.',
    statusRevoked: 'Отозвано',
    statusExpired: 'Истекло',
    statusRejected:
      'Clerk отклонил приглашение. Проверьте получателя и конфигурацию поставщика.',
    activityAccepted: 'принял приглашение в рабочее пространство',
    activityIssued: 'выдал приглашение в рабочее пространство',
    activityRevoked: 'отозвал приглашение в рабочее пространство',
  },
  fr: {
    title: 'Invitations à l’espace de travail',
    description:
      'Invitez une personne dans cet espace de travail. Une invitation n’accorde ni appartenance, ni accès à une Entreprise, ni autorisation métier.',
    email: 'E-mail du destinataire',
    expiry: 'Expire dans ce nombre de jours',
    emailRequired: 'Saisissez l’e-mail du destinataire.',
    emailInvalid: 'Saisissez une adresse e-mail valide.',
    expiryRequired: 'Saisissez le nombre de jours avant l’expiration.',
    expiryInvalid: 'Saisissez un nombre entier compris entre 1 et 30.',
    send: 'Envoyer l’invitation',
    loading: 'Chargement des invitations…',
    empty: 'Aucune invitation sur cette page.',
    error:
      'La demande n’a pas pu être confirmée. Relancez exactement la même demande pour vérifier son résultat.',
    forbidden: 'Vous n’avez plus l’autorisation de gérer les invitations.',
    refresh: 'Vérifier l’état de l’invitation',
    reload: 'Recharger les invitations',
    more: 'Page suivante',
    first: 'Première page',
    revoke: 'Révoquer l’invitation',
    confirm: 'Confirmer la révocation',
    cancel: 'Annuler',
    confirmation:
      'Révoquer cette invitation ? Une invitation révoquée ne peut plus servir à rejoindre cet espace de travail.',
    revocationPending:
      'La révocation est enregistrée. Le lien reçu par e-mail doit encore être confirmé par Clerk.',
    usedBeforeRevocation:
      'Clerk indique que cette invitation a déjà été utilisée. La révocation locale reste enregistrée ; aucun accès à l’espace de travail n’est accordé ici.',
    checkAfter:
      'Prochaine vérification auprès du fournisseur disponible après le',
    expires: 'Expire le',
    consumed:
      'Acceptée dans l’espace de travail. Les accès métier sont attribués séparément.',
    statusUncertain:
      'Livraison non confirmée — vérifiez l’état avant d’envoyer une autre invitation.',
    statusPending: 'Invitation envoyée ; en attente d’utilisation.',
    statusAccepted:
      'Utilisée chez Clerk ; cet écran d’invitation n’accorde pas l’accès à l’espace de travail.',
    statusRevoked: 'Révoquée',
    statusExpired: 'Expirée',
    statusRejected:
      'Clerk a rejeté l’invitation. Vérifiez le destinataire et la configuration du fournisseur.',
    activityAccepted: 'a accepté une invitation à l’espace de travail',
    activityIssued: 'a émis une invitation à l’espace de travail',
    activityRevoked: 'a révoqué une invitation à l’espace de travail',
  },
  en: {
    title: english.title,
    description: english.description,
    email: english.email,
    expiry: english.expiry,
    emailRequired: english.emailRequired,
    emailInvalid: english.emailInvalid,
    expiryRequired: english.expiryRequired,
    expiryInvalid: english.expiryInvalid,
    send: english.send,
    loading: english.loading,
    empty: english.empty,
    error: english.error,
    forbidden: english.forbidden,
    refresh: english.refresh,
    reload: english.reload,
    more: english.more,
    first: english.first,
    revoke: english.revoke,
    confirm: english.confirm,
    cancel: english.cancel,
    confirmation: english.confirmation,
    revocationPending: english.revocationPending,
    usedBeforeRevocation: english.usedBeforeRevocation,
    checkAfter: english.checkAfter,
    expires: english.expires,
    consumed: english.consumed,
    statusUncertain: english.statuses.uncertain,
    statusPending: english.statuses.pending,
    statusAccepted: english.statuses.accepted,
    statusRevoked: english.statuses.revoked,
    statusExpired: english.statuses.expired,
    statusRejected: english.statuses.rejected,
    activityAccepted:
      english.activityActionLabels['workspace_invitation.accepted'],
    activityIssued: english.activityActionLabels['workspace_invitation.issued'],
    activityRevoked:
      english.activityActionLabels['workspace_invitation.revoked'],
  },
});

export function useWorkspaceInvitationsCopy() {
  const message = useMessages(workspaceInvitationsMessages);
  return {
    title: message('title'),
    description: message('description'),
    email: message('email'),
    expiry: message('expiry'),
    emailRequired: message('emailRequired'),
    emailInvalid: message('emailInvalid'),
    expiryRequired: message('expiryRequired'),
    expiryInvalid: message('expiryInvalid'),
    send: message('send'),
    loading: message('loading'),
    empty: message('empty'),
    error: message('error'),
    forbidden: message('forbidden'),
    refresh: message('refresh'),
    reload: message('reload'),
    more: message('more'),
    first: message('first'),
    revoke: message('revoke'),
    confirm: message('confirm'),
    cancel: message('cancel'),
    confirmation: message('confirmation'),
    revocationPending: message('revocationPending'),
    usedBeforeRevocation: message('usedBeforeRevocation'),
    checkAfter: message('checkAfter'),
    expires: message('expires'),
    consumed: message('consumed'),
    statuses: {
      uncertain: message('statusUncertain'),
      pending: message('statusPending'),
      accepted: message('statusAccepted'),
      revoked: message('statusRevoked'),
      expired: message('statusExpired'),
      rejected: message('statusRejected'),
    },
    activityActionLabels: {
      'workspace_invitation.accepted': message('activityAccepted'),
      'workspace_invitation.issued': message('activityIssued'),
      'workspace_invitation.revoked': message('activityRevoked'),
    },
  };
}
