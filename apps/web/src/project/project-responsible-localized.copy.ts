import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'title',
  'none',
  'lastChangedBy',
  'on',
  'loading',
  'denied',
  'missing',
  'error',
  'reload',
  'change',
  'choose',
  'selectMember',
  'save',
  'clear',
  'cancel',
  'membersLoading',
  'membersError',
  'noMembers',
  'readOnly',
  'closedReadOnly',
  'saving',
  'saved',
  'unchanged',
  'conflict',
  'rejected',
  'responsibleRequired',
  'closedRefusal',
  'uncertain',
  'retry',
] as const;

export const projectResponsibleMessages = defineMessages(keys, {
  ro: {
    title: 'Membru responsabil',
    none: 'Niciun membru responsabil',
    lastChangedBy: 'Ultima modificare de',
    on: 'la',
    loading: 'Se încarcă membrul responsabil…',
    denied:
      'Pentru a vedea membrul responsabil sunt necesare accesul la Proiect și citirea Clientului.',
    missing: 'Acest Proiect nu a fost găsit. Reîncărcați lista de Proiecte.',
    error: 'Membrul responsabil nu a putut fi încărcat.',
    reload: 'Reîncărcați membrul responsabil',
    change: 'Modificați',
    choose: 'Alegeți membrul responsabil',
    selectMember: 'Selectați un membru',
    save: 'Salvați',
    clear: 'Eliminați membrul responsabil',
    cancel: 'Anulați',
    membersLoading: 'Se încarcă membrii eligibili…',
    membersError:
      'Membrii eligibili nu au putut fi încărcați. Anulați și alegeți din nou Modificați.',
    noMembers:
      'Niciun membru nu poate fi numit responsabil acum. Proiectul poate rămâne fără membru responsabil.',
    readOnly:
      'Doar pentru citire: Clientul inițial a fost înlocuit. Membrul responsabil rămâne vizibil.',
    closedReadOnly:
      'Doar pentru citire: acest Proiect este închis. Membrul responsabil rămâne vizibil.',
    saving: 'Se salvează membrul responsabil…',
    saved: 'Membrul responsabil a fost salvat.',
    unchanged: 'Membrul responsabil era deja setat astfel.',
    conflict:
      'Membrul responsabil sau accesul dumneavoastră s-a schimbat. Reîncărcați înainte de o altă modificare.',
    rejected:
      'Membrul selectat nu mai poate fi numit responsabil. Reîncărcați și alegeți din nou.',
    responsibleRequired:
      'Un Proiect activ sau suspendat are nevoie de un membru responsabil. Alegeți un înlocuitor.',
    closedRefusal:
      'Acest Proiect a fost închis. Reîncărcați pentru a vedea starea actuală.',
    uncertain:
      'Modificarea nu este confirmată. Reîncercați aceeași modificare pentru a recupera în siguranță rezultatul înregistrat.',
    retry: 'Reîncercați modificarea membrului responsabil',
  },
  ru: {
    title: 'Ответственный участник',
    none: 'Ответственный участник не назначен',
    lastChangedBy: 'Последнее изменение:',
    on: 'в',
    loading: 'Загрузка ответственного участника…',
    denied:
      'Для просмотра ответственного участника нужны доступ к Проекту и право чтения Клиента.',
    missing: 'Проект не найден. Перезагрузите список Проектов.',
    error: 'Не удалось загрузить ответственного участника.',
    reload: 'Перезагрузить ответственного участника',
    change: 'Изменить',
    choose: 'Выберите ответственного участника',
    selectMember: 'Выберите участника',
    save: 'Сохранить',
    clear: 'Убрать ответственного участника',
    cancel: 'Отмена',
    membersLoading: 'Загрузка подходящих участников…',
    membersError:
      'Не удалось загрузить подходящих участников. Отмените и снова выберите «Изменить».',
    noMembers:
      'Сейчас нельзя назначить ответственного участника. Проект может остаться без него.',
    readOnly:
      'Только чтение: исходный Клиент был заменён. Ответственный участник остаётся видимым.',
    closedReadOnly:
      'Только чтение: этот Проект закрыт. Ответственный участник остаётся видимым.',
    saving: 'Сохранение ответственного участника…',
    saved: 'Ответственный участник сохранён.',
    unchanged: 'Ответственный участник уже был указан так же.',
    conflict:
      'Ответственный участник или ваш доступ изменился. Перезагрузите данные перед новым изменением.',
    rejected:
      'Выбранного участника больше нельзя назначить ответственным. Перезагрузите данные и выберите снова.',
    responsibleRequired:
      'Активному или приостановленному Проекту нужен ответственный участник. Выберите замену.',
    closedRefusal:
      'Этот Проект был закрыт. Перезагрузите данные, чтобы увидеть текущее состояние.',
    uncertain:
      'Изменение не подтверждено. Повторите то же изменение, чтобы безопасно получить записанный результат.',
    retry: 'Повторить изменение ответственного участника',
  },
  fr: {
    title: 'Membre responsable',
    none: 'Aucun membre responsable',
    lastChangedBy: 'Dernière modification par',
    on: 'le',
    loading: 'Chargement du membre responsable…',
    denied:
      'L’accès au Projet et la lecture du Client sont requis pour voir le membre responsable.',
    missing: 'Ce Projet est introuvable. Rechargez la liste des Projets.',
    error: 'Le membre responsable n’a pas pu être chargé.',
    reload: 'Recharger le membre responsable',
    change: 'Modifier',
    choose: 'Choisissez le membre responsable',
    selectMember: 'Sélectionnez un membre',
    save: 'Enregistrer',
    clear: 'Retirer le membre responsable',
    cancel: 'Annuler',
    membersLoading: 'Chargement des membres admissibles…',
    membersError:
      'Les membres admissibles n’ont pas pu être chargés. Annulez et choisissez de nouveau Modifier.',
    noMembers:
      'Aucun membre ne peut être désigné responsable actuellement. Le Projet peut rester sans membre responsable.',
    readOnly:
      'Lecture seule : le Client initial a été remplacé. Le membre responsable reste visible.',
    closedReadOnly:
      'Lecture seule : ce Projet est clos. Le membre responsable reste visible.',
    saving: 'Enregistrement du membre responsable…',
    saved: 'Membre responsable enregistré.',
    unchanged: 'Le membre responsable était déjà défini ainsi.',
    conflict:
      'Le membre responsable ou votre accès a changé. Rechargez avant une nouvelle modification.',
    rejected:
      'Le membre sélectionné ne peut plus être désigné responsable. Rechargez et choisissez de nouveau.',
    responsibleRequired:
      'Un Projet actif ou suspendu a besoin d’un membre responsable. Choisissez un remplaçant.',
    closedRefusal: 'Ce Projet a été clos. Rechargez pour voir son état actuel.',
    uncertain:
      'La modification n’est pas confirmée. Réessayez la même modification pour récupérer son résultat enregistré en toute sécurité.',
    retry: 'Réessayer la modification du membre responsable',
  },
  en: {
    title: 'Responsible member',
    none: 'No responsible member',
    lastChangedBy: 'Last changed by',
    on: 'on',
    loading: 'Loading the responsible member…',
    denied:
      'Project and Client read access are required to see the responsible member.',
    missing: 'This Project could not be found. Reload the Project list.',
    error: 'The responsible member could not be loaded.',
    reload: 'Reload responsible member',
    change: 'Change',
    choose: 'Choose the responsible member',
    selectMember: 'Select a member',
    save: 'Save',
    clear: 'Clear responsible member',
    cancel: 'Cancel',
    membersLoading: 'Loading eligible members…',
    membersError:
      'Eligible members could not be loaded. Cancel and choose Change again.',
    noMembers:
      'No member can currently be named responsible. The Project can stay without a responsible member.',
    readOnly:
      'Read-only: the original Client has been superseded. The responsible member remains visible.',
    closedReadOnly:
      'Read-only: this Project is closed. The responsible member remains visible.',
    saving: 'Saving the responsible member…',
    saved: 'Responsible member saved.',
    unchanged: 'The responsible member was already set this way.',
    conflict:
      'The responsible member or your access changed. Reload before making another change.',
    rejected:
      'The selected member can no longer be named responsible. Reload and choose again.',
    responsibleRequired:
      'An active or on-hold Project needs a responsible member. Choose a replacement instead.',
    closedRefusal: 'This Project was closed. Reload to see its current state.',
    uncertain:
      'The change is not confirmed. Retry the same change to safely recover its recorded result.',
    retry: 'Retry responsible member change',
  },
});

export function useProjectResponsibleCopy() {
  const message = useMessages(projectResponsibleMessages);
  return {
    title: message('title'),
    none: message('none'),
    lastChangedBy: message('lastChangedBy'),
    on: message('on'),
    loading: message('loading'),
    denied: message('denied'),
    missing: message('missing'),
    error: message('error'),
    reload: message('reload'),
    change: message('change'),
    choose: message('choose'),
    selectMember: message('selectMember'),
    save: message('save'),
    clear: message('clear'),
    cancel: message('cancel'),
    membersLoading: message('membersLoading'),
    membersError: message('membersError'),
    noMembers: message('noMembers'),
    readOnly: message('readOnly'),
    closedReadOnly: message('closedReadOnly'),
    saving: message('saving'),
    saved: message('saved'),
    unchanged: message('unchanged'),
    conflict: message('conflict'),
    rejected: message('rejected'),
    responsibleRequired: message('responsibleRequired'),
    closedRefusal: message('closedRefusal'),
    uncertain: message('uncertain'),
    retry: message('retry'),
  };
}
