import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';

const keys = [
  'title',
  'description',
  'loading',
  'empty',
  'error',
  'retry',
  'unavailable',
  'list',
  'legalNameLabel',
  'taxIdLabel',
  'legalAddressLabel',
  'notRecorded',
  'add',
  'addTitle',
  'correct',
  'correctEntity',
  'save',
  'saving',
  'cancel',
  'recorded',
  'corrected',
  'legalNameRequired',
  'legalNameTooLong',
  'taxIdTooLong',
  'legalAddressTooLong',
  'unchanged',
  'invalid',
  'uncertain',
  'stale',
  'reload',
  'capacity',
] as const;

export const clientLegalEntitiesMessages = defineMessages(keys, {
  ro: {
    title: 'Entități juridice și sucursale',
    description:
      'Sucursale sau alte entități juridice legate de organizația principală a acestui Client.',
    loading: 'Se încarcă entitățile juridice și sucursalele…',
    empty:
      'Nu sunt înregistrate entități juridice sau sucursale suplimentare. Identitatea din dosarul de mai sus este organizația principală.',
    error:
      'Entitățile juridice și sucursalele nu au putut fi încărcate. Dosarul rămâne disponibil.',
    retry: 'Reîncearcă încărcarea entităților juridice și sucursalelor',
    unavailable:
      'Entitățile juridice și sucursalele nu sunt disponibile cu accesul dvs. actual.',
    list: 'Entități juridice și sucursale înregistrate',
    legalNameLabel: 'Denumirea juridică exactă',
    taxIdLabel: 'IDNO / cod fiscal',
    legalAddressLabel: 'Adresa juridică',
    notRecorded: 'Neînregistrat',
    add: 'Adaugă o entitate juridică sau sucursală',
    addTitle: 'Adăugarea unei entități juridice sau sucursale',
    correct: 'Corectează',
    correctEntity: 'Corectează {legalName}',
    save: 'Salvează entitatea juridică',
    saving: 'Se salvează entitatea juridică…',
    cancel: 'Anulează',
    recorded: 'Entitatea juridică sau sucursala a fost înregistrată.',
    corrected: 'Entitatea juridică sau sucursala a fost corectată.',
    legalNameRequired: 'Introduceți denumirea juridică exactă.',
    legalNameTooLong:
      'Denumirea juridică trebuie să aibă cel mult 200 de caractere.',
    taxIdTooLong:
      'IDNO / codul fiscal trebuie să aibă cel mult 500 de caractere.',
    legalAddressTooLong:
      'Adresa juridică trebuie să aibă cel mult 2.000 de caractere.',
    unchanged: 'Modificați cel puțin o valoare înainte de salvare.',
    invalid: 'Verificați valorile entității juridice și încercați din nou.',
    uncertain:
      'Nu am putut confirma dacă această modificare a fost salvată. Salvați din nou pentru a reîncerca în siguranță exact aceeași modificare.',
    stale:
      'Acest dosar al Clientului s-a modificat înainte de salvarea modificării dvs. Reîncărcați entitățile juridice și sucursalele înainte de a încerca din nou.',
    reload: 'Reîncarcă entitățile juridice și sucursalele',
    capacity:
      'Acest Client are deja numărul maxim de 50 de entități juridice sau sucursale suplimentare. Nu s-a adăugat nimic.',
  },
  ru: {
    title: 'Юридические лица и филиалы',
    description:
      'Филиалы или другие юридические лица, связанные с основной организацией этого Клиента.',
    loading: 'Загрузка юридических лиц и филиалов…',
    empty:
      'Дополнительные юридические лица или филиалы не зарегистрированы. Данные досье выше относятся к основной организации.',
    error:
      'Не удалось загрузить юридические лица и филиалы. Досье остаётся доступным.',
    retry: 'Повторить загрузку юридических лиц и филиалов',
    unavailable:
      'Юридические лица и филиалы недоступны при вашем текущем доступе.',
    list: 'Зарегистрированные юридические лица и филиалы',
    legalNameLabel: 'Точное юридическое наименование',
    taxIdLabel: 'IDNO / налоговый код',
    legalAddressLabel: 'Юридический адрес',
    notRecorded: 'Не указано',
    add: 'Добавить юридическое лицо или филиал',
    addTitle: 'Добавление юридического лица или филиала',
    correct: 'Исправить',
    correctEntity: 'Исправить {legalName}',
    save: 'Сохранить юридическое лицо',
    saving: 'Сохранение юридического лица…',
    cancel: 'Отмена',
    recorded: 'Юридическое лицо или филиал зарегистрированы.',
    corrected: 'Юридическое лицо или филиал исправлены.',
    legalNameRequired: 'Введите точное юридическое наименование.',
    legalNameTooLong:
      'Юридическое наименование должно содержать не более 200 символов.',
    taxIdTooLong:
      'IDNO / налоговый код должен содержать не более 500 символов.',
    legalAddressTooLong:
      'Юридический адрес должен содержать не более 2 000 символов.',
    unchanged: 'Перед сохранением измените хотя бы одно значение.',
    invalid: 'Проверьте данные юридического лица и повторите попытку.',
    uncertain:
      'Не удалось подтвердить, сохранено ли это изменение. Сохраните снова, чтобы безопасно повторить точно такое же изменение.',
    stale:
      'Досье этого Клиента изменилось до сохранения вашего изменения. Перезагрузите юридические лица и филиалы перед повторной попыткой.',
    reload: 'Перезагрузить юридические лица и филиалы',
    capacity:
      'У этого Клиента уже зарегистрировано максимально допустимое количество дополнительных юридических лиц или филиалов: 50. Ничего не добавлено.',
  },
  fr: {
    title: 'Entités juridiques et succursales',
    description:
      'Succursales ou autres entités juridiques liées à l’organisation principale de ce Client.',
    loading: 'Chargement des entités juridiques et succursales…',
    empty:
      'Aucune entité juridique ou succursale supplémentaire enregistrée. L’identité du dossier ci-dessus est l’organisation principale.',
    error:
      'Impossible de charger les entités juridiques et succursales. Le dossier reste disponible.',
    retry: 'Réessayer le chargement des entités juridiques et succursales',
    unavailable:
      'Les entités juridiques et succursales ne sont pas disponibles avec votre accès actuel.',
    list: 'Entités juridiques et succursales enregistrées',
    legalNameLabel: 'Dénomination juridique exacte',
    taxIdLabel: 'IDNO / code fiscal',
    legalAddressLabel: 'Adresse juridique',
    notRecorded: 'Non renseigné',
    add: 'Ajouter une entité juridique ou une succursale',
    addTitle: 'Ajout d’une entité juridique ou d’une succursale',
    correct: 'Corriger',
    correctEntity: 'Corriger {legalName}',
    save: 'Enregistrer l’entité juridique',
    saving: 'Enregistrement de l’entité juridique…',
    cancel: 'Annuler',
    recorded: 'Entité juridique ou succursale enregistrée.',
    corrected: 'Entité juridique ou succursale corrigée.',
    legalNameRequired: 'Saisissez la dénomination juridique exacte.',
    legalNameTooLong:
      'La dénomination juridique doit contenir au plus 200 caractères.',
    taxIdTooLong: 'L’IDNO / code fiscal doit contenir au plus 500 caractères.',
    legalAddressTooLong:
      'L’adresse juridique doit contenir au plus 2 000 caractères.',
    unchanged: 'Modifiez au moins une valeur avant d’enregistrer.',
    invalid: 'Vérifiez les valeurs de l’entité juridique et réessayez.',
    uncertain:
      'Nous n’avons pas pu confirmer si cette modification a été enregistrée. Enregistrez à nouveau pour réessayer exactement la même modification en toute sécurité.',
    stale:
      'Le dossier de ce Client a changé avant l’enregistrement de votre modification. Rechargez les entités juridiques et succursales avant de réessayer.',
    reload: 'Recharger les entités juridiques et succursales',
    capacity:
      'Ce Client a déjà atteint le maximum de 50 entités juridiques ou succursales supplémentaires. Aucun ajout n’a été effectué.',
  },
  en: {
    title: 'Legal entities and branches',
    description:
      'Branches or other legal entities linked to the main organization of this Client.',
    loading: 'Loading legal entities and branches…',
    empty:
      'No additional legal entities or branches recorded. The dossier identity above is the main organization.',
    error:
      'Legal entities and branches could not be loaded. The dossier remains available.',
    retry: 'Retry legal entities and branches',
    unavailable:
      'Legal entities and branches are not available with your current access.',
    list: 'Recorded legal entities and branches',
    legalNameLabel: 'Exact legal name',
    taxIdLabel: 'IDNO / tax code',
    legalAddressLabel: 'Legal address',
    notRecorded: 'Not recorded',
    add: 'Add legal entity or branch',
    addTitle: 'Add a legal entity or branch',
    correct: 'Correct',
    correctEntity: 'Correct {legalName}',
    save: 'Save legal entity',
    saving: 'Saving legal entity…',
    cancel: 'Cancel',
    recorded: 'Legal entity or branch recorded.',
    corrected: 'Legal entity or branch corrected.',
    legalNameRequired: 'Enter the exact legal name.',
    legalNameTooLong: 'The legal name must be 200 characters or fewer.',
    taxIdTooLong: 'The IDNO / tax code must be 500 characters or fewer.',
    legalAddressTooLong: 'The legal address must be 2,000 characters or fewer.',
    unchanged: 'Change at least one value before saving.',
    invalid: 'Check the legal entity values and try again.',
    uncertain:
      'We could not confirm whether this change was saved. Save again to retry exactly the same change safely.',
    stale:
      'This Client dossier changed before your change was saved. Reload the legal entities and branches before trying again.',
    reload: 'Reload legal entities and branches',
    capacity:
      'This Client already records the maximum of 50 additional legal entities or branches. Nothing was added.',
  },
});

export function useClientLegalEntitiesCopy() {
  const message = useMessages(clientLegalEntitiesMessages);
  return {
    title: message('title'),
    description: message('description'),
    loading: message('loading'),
    empty: message('empty'),
    error: message('error'),
    retry: message('retry'),
    unavailable: message('unavailable'),
    list: message('list'),
    legalNameLabel: message('legalNameLabel'),
    taxIdLabel: message('taxIdLabel'),
    legalAddressLabel: message('legalAddressLabel'),
    notRecorded: message('notRecorded'),
    add: message('add'),
    addTitle: message('addTitle'),
    correct: message('correct'),
    correctEntity: (legalName: string) =>
      formatMessage(message('correctEntity'), { legalName }),
    save: message('save'),
    saving: message('saving'),
    cancel: message('cancel'),
    recorded: message('recorded'),
    corrected: message('corrected'),
    legalNameRequired: message('legalNameRequired'),
    legalNameTooLong: message('legalNameTooLong'),
    taxIdTooLong: message('taxIdTooLong'),
    legalAddressTooLong: message('legalAddressTooLong'),
    unchanged: message('unchanged'),
    invalid: message('invalid'),
    uncertain: message('uncertain'),
    stale: message('stale'),
    reload: message('reload'),
    capacity: message('capacity'),
  };
}

/** Activity wording is owned by its existing global projection. */
export const clientLegalEntitiesCopy = {
  activityActionLabels: {
    'client_legal_entity.registered': 'recorded a Client legal entity',
    'client_legal_entity.corrected': 'corrected a Client legal entity',
  },
} as const;
