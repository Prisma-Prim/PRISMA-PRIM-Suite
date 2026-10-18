import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';

const keys = [
  'title',
  'list',
  'loading',
  'error',
  'retry',
  'unavailable',
  'readOnly',
  'version',
  'statusDraft',
  'statusOfficial',
  'statusSuperseded',
  'createdBy',
  'designatedBy',
  'frozenTitle',
  'frozenPurpose',
  'supersededBy',
  'frozenNotice',
  'references',
  'formEditable',
  'formRendered',
  'formSigned',
  'formOther',
  'position',
  'primary',
  'appendedAfterDesignation',
  'addedBy',
  'openReference',
  'referenceDenied',
  'designate',
  'startDraft',
  'form',
  'url',
  'invalidUrl',
  'addReference',
  'appendReference',
  'removeReference',
  'confirmOfficialAppend',
  'confirmAppend',
  'cancelAppend',
  'confirmDesignationNone',
  'confirmDesignationSuperseding',
  'confirm',
  'cancel',
  'pending',
  'designated',
  'drafted',
  'referenceAdded',
  'referenceRemoved',
  'conflict',
  'unavailableCommand',
  'versionCapacity',
  'draftReferenceCapacity',
  'officialReferenceCapacity',
  'denied',
  'uncertain',
  'retryCommand',
  'reload',
] as const;

export const documentVersionsMessages = defineMessages(keys, {
  ro: {
    title: 'Versiuni',
    list: 'Versiunile Documentului, cele mai noi primele',
    loading: 'Se încarcă Versiunile…',
    error: 'Versiunile nu au putut fi încărcate. Documentul rămâne disponibil.',
    retry: 'Reîncearcă încărcarea Versiunilor',
    unavailable: 'Versiunile nu sunt disponibile cu accesul tău actual.',
    readOnly:
      'Doar citire: Clientul inițial a fost înlocuit. Toate Versiunile rămân vizibile.',
    version: 'Versiunea {number}',
    statusDraft: 'În lucru',
    statusOfficial: 'Oficială',
    statusSuperseded: 'Înlocuită',
    createdBy: 'Creată de {actor}',
    designatedBy: 'Desemnată oficială de {actor}',
    frozenTitle: 'Titlu fixat',
    frozenPurpose: 'Scop fixat',
    supersededBy: 'Înlocuită de Versiunea {number}',
    frozenNotice:
      'Referințele înregistrate, formele lor și titlul acestei Versiuni oficiale sunt fixate. Conținutul extern indicat nu este păstrat sau verificat aici și se poate schimba la sursă.',
    references: 'Referințe pentru Versiunea {number}',
    formEditable: 'Editabilă',
    formRendered: 'Redată',
    formSigned: 'Semnată',
    formOther: 'Alta',
    position: 'Poziția {position}',
    primary: 'Principală',
    appendedAfterDesignation: 'Adăugată după desemnare',
    addedBy: 'Adăugată de {actor}',
    openReference: 'Deschide referința Versiunii {number}',
    referenceDenied: 'Nu ai permisiunea de a deschide această referință.',
    designate: 'Desemnează ca oficială',
    startDraft: 'Începe o Versiune de lucru nouă',
    form: 'Forma referinței',
    url: 'URL HTTPS',
    invalidUrl: 'Introdu un URL HTTPS fără date de autentificare.',
    addReference: 'Adaugă referință',
    appendReference: 'Adaugă referință la Versiunea oficială',
    removeReference: 'Elimină',
    confirmOfficialAppend:
      'Adaugi această referință la Versiunea oficială {number}? Va aparține exact acestei Versiuni și nu va putea fi eliminată niciodată.',
    confirmAppend: 'Adaugă referința ireversibilă',
    cancelAppend: 'Anulează adăugarea referinței',
    confirmDesignationNone:
      'Desemnezi Versiunea {number} ca Versiune oficială? Nicio Versiune nu va fi înlocuită.',
    confirmDesignationSuperseding:
      'Desemnezi Versiunea {number} ca Versiune oficială? Versiunea {superseded} va fi înlocuită.',
    confirm: 'Confirmă desemnarea oficială',
    cancel: 'Anulează desemnarea',
    pending: 'Se salvează modificarea Versiunii…',
    designated: 'Versiunea {number} este acum oficială.',
    drafted: 'Versiunea {number} a fost începută ca Versiune de lucru.',
    referenceAdded: 'A fost adăugată o referință la Versiunea {number}.',
    referenceRemoved:
      'A fost eliminată o referință de lucru din Versiunea {number}.',
    conflict:
      'Acest Document s-a schimbat. Reîncarcă Documentul și Versiunile înainte de o nouă încercare.',
    unavailableCommand:
      'Acest Document nu mai poate fi modificat aici. Reîncarcă Documentul și Versiunile.',
    versionCapacity:
      'Acest Document a atins limita de Versiuni. Nu se poate începe o Versiune de lucru nouă.',
    draftReferenceCapacity:
      'Această Versiune de lucru are deja cinci referințe. Elimină una înainte de a adăuga alta.',
    officialReferenceCapacity:
      'Această Versiune oficială are deja zece referințe. Nu mai pot fi adăugate altele.',
    denied: 'Nu mai ai permisiunea pentru această modificare a Versiunii.',
    uncertain:
      'Rezultatul acestei modificări a Versiunii este incert. Reîncearcă în siguranță exact aceeași modificare.',
    retryCommand: 'Reîncearcă aceeași modificare a Versiunii',
    reload: 'Reîncarcă Documentul și Versiunile',
  },
  ru: {
    title: 'Версии',
    list: 'Версии Документа, сначала новые',
    loading: 'Загрузка Версий…',
    error: 'Не удалось загрузить Версии. Документ остаётся доступным.',
    retry: 'Повторить загрузку Версий',
    unavailable: 'Версии недоступны при ваших текущих правах.',
    readOnly:
      'Только чтение: исходный Клиент заменён. Все Версии остаются видимыми.',
    version: 'Версия {number}',
    statusDraft: 'Черновик',
    statusOfficial: 'Официальная',
    statusSuperseded: 'Заменённая',
    createdBy: 'Создал: {actor}',
    designatedBy: 'Назначил официальной: {actor}',
    frozenTitle: 'Зафиксированное название',
    frozenPurpose: 'Зафиксированное назначение',
    supersededBy: 'Заменена Версией {number}',
    frozenNotice:
      'Записанные ссылки, их формы и название этой официальной Версии зафиксированы. Внешнее содержимое по ссылкам здесь не хранится и не проверяется и может измениться в источнике.',
    references: 'Ссылки Версии {number}',
    formEditable: 'Редактируемая',
    formRendered: 'Визуализированная',
    formSigned: 'Подписанная',
    formOther: 'Другая',
    position: 'Позиция {position}',
    primary: 'Основная',
    appendedAfterDesignation: 'Добавлена после назначения',
    addedBy: 'Добавил: {actor}',
    openReference: 'Открыть ссылку Версии {number}',
    referenceDenied: 'У вас нет права открывать эту ссылку.',
    designate: 'Назначить официальной',
    startDraft: 'Начать новый черновик',
    form: 'Форма ссылки',
    url: 'HTTPS URL',
    invalidUrl: 'Введите HTTPS URL без учётных данных.',
    addReference: 'Добавить ссылку',
    appendReference: 'Добавить ссылку к официальной Версии',
    removeReference: 'Убрать',
    confirmOfficialAppend:
      'Добавить эту ссылку к официальной Версии {number}? Она будет принадлежать именно этой Версии, и её нельзя будет удалить.',
    confirmAppend: 'Добавить необратимую ссылку',
    cancelAppend: 'Отменить добавление ссылки',
    confirmDesignationNone:
      'Назначить Версию {number} официальной? Ни одна Версия не будет заменена.',
    confirmDesignationSuperseding:
      'Назначить Версию {number} официальной? Версия {superseded} будет заменена.',
    confirm: 'Подтвердить официальное назначение',
    cancel: 'Отменить назначение',
    pending: 'Сохранение изменения Версии…',
    designated: 'Версия {number} теперь официальная.',
    drafted: 'Версия {number} создана как черновик.',
    referenceAdded: 'К Версии {number} добавлена ссылка.',
    referenceRemoved: 'Из Версии {number} убрана черновая ссылка.',
    conflict:
      'Этот Документ изменился. Обновите Документ и его Версии перед новой попыткой.',
    unavailableCommand:
      'Этот Документ больше нельзя изменить здесь. Обновите Документ и его Версии.',
    versionCapacity:
      'Достигнут предел Версий этого Документа. Новый черновик создать нельзя.',
    draftReferenceCapacity:
      'У этого черновика уже пять ссылок. Уберите одну перед добавлением новой.',
    officialReferenceCapacity:
      'У этой официальной Версии уже десять ссылок. Больше добавить нельзя.',
    denied: 'У вас больше нет права на это изменение Версии.',
    uncertain:
      'Результат этого изменения Версии неизвестен. Безопасно повторите точно то же изменение.',
    retryCommand: 'Повторить то же изменение Версии',
    reload: 'Обновить Документ и Версии',
  },
  fr: {
    title: 'Versions',
    list: 'Versions du Document, les plus récentes d’abord',
    loading: 'Chargement des Versions…',
    error:
      'Les Versions n’ont pas pu être chargées. Le Document reste disponible.',
    retry: 'Réessayer le chargement des Versions',
    unavailable:
      'Les Versions ne sont pas disponibles avec vos droits actuels.',
    readOnly:
      'Lecture seule : le Client d’origine a été remplacé. Toutes les Versions restent visibles.',
    version: 'Version {number}',
    statusDraft: 'Brouillon',
    statusOfficial: 'Officielle',
    statusSuperseded: 'Remplacée',
    createdBy: 'Créée par {actor}',
    designatedBy: 'Désignée officielle par {actor}',
    frozenTitle: 'Titre figé',
    frozenPurpose: 'Objet figé',
    supersededBy: 'Remplacée par la Version {number}',
    frozenNotice:
      'Les références enregistrées, leurs formes et le titre de cette Version officielle sont figés. Le contenu externe lié n’est ni stocké ni vérifié ici et peut changer à la source.',
    references: 'Références de la Version {number}',
    formEditable: 'Modifiable',
    formRendered: 'Rendue',
    formSigned: 'Signée',
    formOther: 'Autre',
    position: 'Position {position}',
    primary: 'Principale',
    appendedAfterDesignation: 'Ajoutée après désignation',
    addedBy: 'Ajoutée par {actor}',
    openReference: 'Ouvrir la référence de la Version {number}',
    referenceDenied: 'Vous n’avez pas l’autorisation d’ouvrir cette référence.',
    designate: 'Désigner comme officielle',
    startDraft: 'Créer un nouveau brouillon',
    form: 'Forme de la référence',
    url: 'URL HTTPS',
    invalidUrl: 'Saisissez une URL HTTPS sans identifiants.',
    addReference: 'Ajouter une référence',
    appendReference: 'Ajouter une référence à la Version officielle',
    removeReference: 'Retirer',
    confirmOfficialAppend:
      'Ajouter cette référence à la Version officielle {number} ? Elle appartiendra à cette Version exacte et ne pourra jamais être retirée.',
    confirmAppend: 'Ajouter la référence irréversible',
    cancelAppend: 'Annuler l’ajout de référence',
    confirmDesignationNone:
      'Désigner la Version {number} comme Version officielle ? Aucune Version ne sera remplacée.',
    confirmDesignationSuperseding:
      'Désigner la Version {number} comme Version officielle ? La Version {superseded} sera remplacée.',
    confirm: 'Confirmer la désignation officielle',
    cancel: 'Annuler la désignation',
    pending: 'Enregistrement de la modification de Version…',
    designated: 'La Version {number} est désormais officielle.',
    drafted: 'La Version {number} a été créée comme brouillon.',
    referenceAdded: 'Une référence a été ajoutée à la Version {number}.',
    referenceRemoved:
      'Une référence de brouillon a été retirée de la Version {number}.',
    conflict:
      'Ce Document a changé. Rechargez le Document et ses Versions avant de réessayer.',
    unavailableCommand:
      'Ce Document ne peut plus être modifié ici. Rechargez le Document et ses Versions.',
    versionCapacity:
      'Ce Document a atteint sa limite de Versions. Aucun nouveau brouillon ne peut être créé.',
    draftReferenceCapacity:
      'Ce brouillon possède déjà cinq références. Retirez-en une avant d’en ajouter une autre.',
    officialReferenceCapacity:
      'Cette Version officielle possède déjà dix références. Aucun ajout supplémentaire n’est possible.',
    denied:
      'Vous n’avez plus l’autorisation d’effectuer cette modification de Version.',
    uncertain:
      'Le résultat de cette modification de Version est incertain. Réessayez exactement la même modification en toute sécurité.',
    retryCommand: 'Réessayer la même modification de Version',
    reload: 'Recharger le Document et ses Versions',
  },
  en: {
    title: 'Versions',
    list: 'Document Versions, newest first',
    loading: 'Loading Versions…',
    error: 'The Versions could not be loaded. The Document remains available.',
    retry: 'Retry loading Versions',
    unavailable: 'Versions are not available with your current access.',
    readOnly:
      'Read-only: the original Client has been superseded. Every Version remains visible.',
    version: 'Version {number}',
    statusDraft: 'Draft',
    statusOfficial: 'Official',
    statusSuperseded: 'Superseded',
    createdBy: 'Created by {actor}',
    designatedBy: 'Designated official by {actor}',
    frozenTitle: 'Frozen title',
    frozenPurpose: 'Frozen purpose',
    supersededBy: 'Superseded by Version {number}',
    frozenNotice:
      'The recorded references, their forms, and the title of this official Version are frozen. The linked external content is not stored or verified here and may change at its source.',
    references: 'References for Version {number}',
    formEditable: 'Editable',
    formRendered: 'Rendered',
    formSigned: 'Signed',
    formOther: 'Other',
    position: 'Position {position}',
    primary: 'Primary',
    appendedAfterDesignation: 'Added after designation',
    addedBy: 'Added by {actor}',
    openReference: 'Open Version {number} reference',
    referenceDenied: 'You do not have permission to open this reference.',
    designate: 'Designate as official',
    startDraft: 'Start new draft',
    form: 'Reference form',
    url: 'HTTPS URL',
    invalidUrl: 'Enter an HTTPS URL without credentials.',
    addReference: 'Add reference',
    appendReference: 'Add reference to official Version',
    removeReference: 'Remove',
    confirmOfficialAppend:
      'Add this reference to official Version {number}? It will belong to this exact Version and can never be removed.',
    confirmAppend: 'Add irreversible reference',
    cancelAppend: 'Cancel reference addition',
    confirmDesignationNone:
      'Designate Version {number} as the official Version? No Version will be superseded.',
    confirmDesignationSuperseding:
      'Designate Version {number} as the official Version? Version {superseded} will become superseded.',
    confirm: 'Confirm official designation',
    cancel: 'Cancel designation',
    pending: 'Saving the Version change…',
    designated: 'Version {number} is now official.',
    drafted: 'Version {number} was started as a draft.',
    referenceAdded: 'A reference was added to Version {number}.',
    referenceRemoved: 'A draft reference was removed from Version {number}.',
    conflict:
      'This Document changed. Reload the Document and its Versions before trying again.',
    unavailableCommand:
      'This Document can no longer be changed here. Reload the Document and its Versions.',
    versionCapacity:
      'This Document has reached its Version limit. No new draft can be started.',
    draftReferenceCapacity:
      'This draft already has five references. Remove one before adding another.',
    officialReferenceCapacity:
      'This official Version already has ten references. No more can be appended.',
    denied: 'You no longer have permission for this Version change.',
    uncertain:
      'The result of this Version change is uncertain. Retry the exact same change safely.',
    retryCommand: 'Retry the same Version change',
    reload: 'Reload Document and Versions',
  },
});

export function useDocumentVersionsCopy() {
  const message = useMessages(documentVersionsMessages);
  const { formatNumber } = useInterfaceLocale();
  return {
    title: message('title'),
    list: message('list'),
    loading: message('loading'),
    error: message('error'),
    retry: message('retry'),
    unavailable: message('unavailable'),
    readOnly: message('readOnly'),
    frozenTitle: message('frozenTitle'),
    frozenPurpose: message('frozenPurpose'),
    frozenNotice: message('frozenNotice'),
    primary: message('primary'),
    appendedAfterDesignation: message('appendedAfterDesignation'),
    referenceDenied: message('referenceDenied'),
    designate: message('designate'),
    startDraft: message('startDraft'),
    form: message('form'),
    url: message('url'),
    invalidUrl: message('invalidUrl'),
    addReference: message('addReference'),
    appendReference: message('appendReference'),
    removeReference: message('removeReference'),
    confirmAppend: message('confirmAppend'),
    cancelAppend: message('cancelAppend'),
    confirm: message('confirm'),
    cancel: message('cancel'),
    pending: message('pending'),
    conflict: message('conflict'),
    unavailableCommand: message('unavailableCommand'),
    versionCapacity: message('versionCapacity'),
    draftReferenceCapacity: message('draftReferenceCapacity'),
    officialReferenceCapacity: message('officialReferenceCapacity'),
    denied: message('denied'),
    uncertain: message('uncertain'),
    retryCommand: message('retryCommand'),
    reload: message('reload'),
    version: (number: number) =>
      formatMessage(message('version'), { number: formatNumber(number) }),
    supersededBy: (number: number) =>
      formatMessage(message('supersededBy'), { number: formatNumber(number) }),
    references: (number: number) =>
      formatMessage(message('references'), { number: formatNumber(number) }),
    openReference: (number: number) =>
      formatMessage(message('openReference'), { number: formatNumber(number) }),
    confirmOfficialAppend: (number: number) =>
      formatMessage(message('confirmOfficialAppend'), {
        number: formatNumber(number),
      }),
    designated: (number: number) =>
      formatMessage(message('designated'), { number: formatNumber(number) }),
    drafted: (number: number) =>
      formatMessage(message('drafted'), { number: formatNumber(number) }),
    referenceAdded: (number: number) =>
      formatMessage(message('referenceAdded'), {
        number: formatNumber(number),
      }),
    referenceRemoved: (number: number) =>
      formatMessage(message('referenceRemoved'), {
        number: formatNumber(number),
      }),
    createdBy: (displayName: string) =>
      formatMessage(message('createdBy'), { actor: displayName }),
    designatedBy: (displayName: string) =>
      formatMessage(message('designatedBy'), { actor: displayName }),
    addedBy: (displayName: string) =>
      formatMessage(message('addedBy'), { actor: displayName }),
    position: (position: number) =>
      formatMessage(message('position'), { position: formatNumber(position) }),
    confirmDesignation: (number: number, superseded: number | null) =>
      superseded === null
        ? formatMessage(message('confirmDesignationNone'), {
            number: formatNumber(number),
          })
        : formatMessage(message('confirmDesignationSuperseding'), {
            number: formatNumber(number),
            superseded: formatNumber(superseded),
          }),
    statusLabels: {
      draft: message('statusDraft'),
      official: message('statusOfficial'),
      superseded: message('statusSuperseded'),
    },
    formLabels: {
      editable: message('formEditable'),
      rendered: message('formRendered'),
      signed: message('formSigned'),
      other: message('formOther'),
    },
    formOptions: [
      { value: 'editable', label: message('formEditable') },
      { value: 'rendered', label: message('formRendered') },
      { value: 'signed', label: message('formSigned') },
      { value: 'other', label: message('formOther') },
    ] as const,
  };
}
