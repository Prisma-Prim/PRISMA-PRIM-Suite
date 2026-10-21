import { useInterfaceLocale } from '../localization/interface-locale';
import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';

const keys = [
  'compare',
  'comparisonEyebrow',
  'affectedCompanies',
  'contactCount',
  'retainedSource',
  'decisions',
  'chooseFields',
  'reasonLimit',
  'incomplete',
  'uncertain',
  'canonical',
  'choose',
  'reason',
  'reviewed',
  'confirmedCompanies',
  'confirm',
  'saving',
  'error',
  'preserved',
  'capacity',
  'saved',
] as const;

export const clientUnionConfirmationMessages = defineMessages(keys, {
  ro: {
    compare: 'Compară cei doi Clienți existenți',
    comparisonEyebrow: 'Dosare de Client salvate',
    affectedCompanies: 'Setul complet al Companiilor implicate',
    contactCount: 'Contacte din ambele surse: {count}. Maximum: {maximum}.',
    retainedSource: 'Valoarea de păstrat din Sursa {source}',
    decisions: 'Alege dosarul și valorile de păstrat',
    chooseFields:
      'Pentru fiecare câmp, alege sursa salvată a cărei valoare curentă va fi păstrată. Valorile nu pot fi editate aici.',
    reasonLimit: 'Obligatoriu. Maximum 2.000 de caractere.',
    incomplete:
      'Alege un Client canonic și o sursă pentru fiecare câmp, introdu un motiv și confirmă ambele declarații.',
    uncertain:
      'Nu s-a primit nicio confirmare. Alegerile și motivul sunt păstrate. Confirmă din nou pentru a reîncerca aceeași intenție sau închide revizuirea pentru a elimina alegerile locale. Închiderea nu anulează o comandă deja primită de server.',
    canonical: 'Dosarul canonic al Clientului',
    choose: 'Alege o sursă',
    reason: 'Motivul acestei uniri',
    reviewed:
      'Am revizuit baza identității și fiecare diferență semnificativă.',
    confirmedCompanies: 'Confirm setul complet al Companiilor implicate:',
    confirm: 'Confirmă unirea',
    saving: 'Se salvează…',
    error: 'Cererea nu a putut fi finalizată. Poți reîncerca în siguranță.',
    preserved:
      'Ambele dosare originale, Contactele și relațiile cu sursele sunt păstrate. Contactele identice rămân înregistrări separate.',
    capacity:
      'Dosarul combinat depășește 50 de Contacte. Această unire nu poate fi confirmată.',
    saved:
      'Unirea a fost confirmată. Dosarul canonic este acum disponibil în Companiile implicate.',
  },
  ru: {
    compare: 'Сравнить двух существующих Клиентов',
    comparisonEyebrow: 'Сохранённые досье Клиентов',
    affectedCompanies: 'Полный набор затронутых Компаний',
    contactCount: 'Контакты из обоих источников: {count}. Максимум: {maximum}.',
    retainedSource: 'Сохраняемое значение из Источника {source}',
    decisions: 'Выберите сохраняемое досье и значения',
    chooseFields:
      'Для каждого поля выберите сохранённый источник, текущее значение которого будет сохранено. Здесь нельзя редактировать значения.',
    reasonLimit: 'Обязательно. Не более 2 000 символов.',
    incomplete:
      'Выберите канонического Клиента и источник каждого поля, укажите причину и подтвердите оба заявления.',
    uncertain:
      'Подтверждение не получено. Ваш выбор и причина сохранены. Подтвердите снова, чтобы повторить то же намерение, или закройте проверку, чтобы сбросить локальный выбор. Закрытие не отменяет команду, уже полученную сервером.',
    canonical: 'Каноническое досье Клиента',
    choose: 'Выберите источник',
    reason: 'Причина этого объединения',
    reviewed:
      'Я проверил основание идентичности и каждое существенное различие.',
    confirmedCompanies: 'Подтверждаю полный набор затронутых Компаний:',
    confirm: 'Подтвердить объединение',
    saving: 'Сохранение…',
    error: 'Не удалось выполнить запрос. Можно безопасно повторить попытку.',
    preserved:
      'Оба исходных досье, Контакты и исходные связи сохраняются. Одинаковые Контакты остаются отдельными записями.',
    capacity:
      'В объединённом досье более 50 Контактов. Это объединение нельзя подтвердить.',
    saved:
      'Объединение подтверждено. Каноническое досье теперь доступно в затронутых Компаниях.',
  },
  fr: {
    compare: 'Comparer les deux Clients existants',
    comparisonEyebrow: 'Dossiers de Clients enregistrés',
    affectedCompanies: 'Ensemble complet des Entreprises concernées',
    contactCount: 'Contacts des deux sources : {count}. Maximum : {maximum}.',
    retainedSource: 'Valeur à conserver de la Source {source}',
    decisions: 'Choisissez le dossier et les valeurs à conserver',
    chooseFields:
      'Pour chaque champ, choisissez la source enregistrée dont la valeur actuelle sera conservée. Les valeurs ne peuvent pas être modifiées ici.',
    reasonLimit: 'Obligatoire. Maximum 2 000 caractères.',
    incomplete:
      'Choisissez un Client canonique et une source pour chaque champ, indiquez un motif et confirmez les deux déclarations.',
    uncertain:
      'Aucune confirmation n’a été reçue. Vos choix et votre motif sont conservés. Confirmez à nouveau pour réessayer cette intention, ou fermez l’examen pour abandonner les choix locaux. La fermeture n’annule pas une commande déjà reçue par le serveur.',
    canonical: 'Dossier canonique du Client',
    choose: 'Choisissez une source',
    reason: 'Motif de cette union',
    reviewed:
      'J’ai examiné le fondement de l’identité et chaque différence significative.',
    confirmedCompanies:
      'Je confirme l’ensemble complet des Entreprises concernées :',
    confirm: 'Confirmer l’union',
    saving: 'Enregistrement…',
    error:
      'La requête n’a pas pu aboutir. Vous pouvez réessayer en toute sécurité.',
    preserved:
      'Les deux dossiers d’origine, les Contacts et les relations sources sont conservés. Les Contacts identiques restent des entrées distinctes.',
    capacity:
      'Le dossier combiné dépasse 50 Contacts. Cette union ne peut pas être confirmée.',
    saved:
      'Union confirmée. Le dossier canonique est maintenant disponible dans les Entreprises concernées.',
  },
  en: {
    compare: 'Compare the two existing Clients',
    comparisonEyebrow: 'Saved Client dossiers',
    affectedCompanies: 'Complete affected Company set',
    contactCount:
      'Contact entries from both sources: {count}. Maximum: {maximum}.',
    retainedSource: 'Value to retain from Source {source}',
    decisions: 'Choose the retained dossier and values',
    chooseFields:
      'For each field, choose the saved source whose current value will be retained. Values cannot be edited here.',
    reasonLimit: 'Required. Maximum 2,000 characters.',
    incomplete:
      'Choose a canonical Client and a source for every field, give a reason and confirm both acknowledgements.',
    uncertain:
      'No confirmation has been received. Your choices and reason are retained. Confirm again to retry this intention, or close the review to discard the local choices. Closing does not cancel a command already received by the server.',
    canonical: 'Canonical Client dossier',
    choose: 'Choose a source',
    reason: 'Reason for this union',
    reviewed: 'I reviewed the identity basis and every material difference.',
    confirmedCompanies: 'I confirm the complete affected Company set:',
    confirm: 'Confirm union',
    saving: 'Saving…',
    error: 'The request could not be completed. You can retry safely.',
    preserved:
      'Both original dossiers, Contact entries and source relationships are preserved. Identical Contacts remain separate entries.',
    capacity:
      'The combined dossier exceeds 50 Contacts. This union cannot be confirmed.',
    saved:
      'Union confirmed. The canonical dossier is now available in the affected Companies.',
  },
});

export function useClientUnionConfirmationCopy() {
  const message = useMessages(clientUnionConfirmationMessages);
  const { formatNumber } = useInterfaceLocale();
  return {
    compare: message('compare'),
    comparisonEyebrow: message('comparisonEyebrow'),
    affectedCompanies: message('affectedCompanies'),
    contactCount: (count: number) =>
      formatMessage(message('contactCount'), {
        count: formatNumber(count),
        maximum: formatNumber(50),
      }),
    retainedSource: (source: number) =>
      formatMessage(message('retainedSource'), {
        source: formatNumber(source),
      }),
    decisions: message('decisions'),
    chooseFields: message('chooseFields'),
    reasonLimit: message('reasonLimit'),
    incomplete: message('incomplete'),
    uncertain: message('uncertain'),
    canonical: message('canonical'),
    choose: message('choose'),
    reason: message('reason'),
    reviewed: message('reviewed'),
    confirmedCompanies: message('confirmedCompanies'),
    confirm: message('confirm'),
    saving: message('saving'),
    error: message('error'),
    preserved: message('preserved'),
    capacity: message('capacity'),
    saved: message('saved'),
  };
}
