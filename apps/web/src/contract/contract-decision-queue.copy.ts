import { useInterfaceLocale } from '../localization/interface-locale';

const en = {
  title: 'Contracts awaiting an internal decision',
  introduction:
    'Current Contracts, Precontracts and Addenda without an internal decision. Open a version for its current checks; pending does not mean ready to approve, accepted or signed.',
  empty: 'No agreement versions awaiting your decision.',
  laterEmpty: 'This page is now empty. Go back or refresh from the beginning.',
  loading: 'Loading pending agreements…',
  error: 'The pending agreements could not be loaded.',
  denied: 'Pending agreements are unavailable with your current access.',
  refresh: 'Refresh from beginning',
  retry: 'Retry this page',
  next: 'Next page',
  previous: 'Previous page',
  open: 'Review',
  version: 'Version',
  reference: 'Illustrative reference',
  illustrative: 'Illustrative version — no legal effect',
  model: 'Company model version — non-official',
  submitted: 'Created',
  back: 'Back to pending agreements',
  page: 'Page',
  loaded: 'This page reflects the last read. Refresh to include changes.',
  contract: 'Contract',
  precontract: 'Precontract',
  addendum: 'Addendum',
};
type Copy = { [K in keyof typeof en]: string };
const fr: Copy = {
  title: 'Contrats en attente de décision interne',
  introduction:
    'Contrats, précontrats et avenants actuels sans décision interne. Ouvrez une version pour ses contrôles actuels ; une version en attente peut nécessiter des corrections et ne confirme ni acceptation ni signature.',
  empty: 'Aucune version d’accord en attente de votre décision.',
  laterEmpty:
    'Cette page est maintenant vide. Revenez en arrière ou actualisez depuis le début.',
  loading: 'Chargement des accords en attente…',
  error: 'Impossible de charger les accords en attente.',
  denied: 'Les accords en attente sont indisponibles avec vos droits actuels.',
  refresh: 'Actualiser depuis le début',
  retry: 'Réessayer cette page',
  next: 'Page suivante',
  previous: 'Page précédente',
  open: 'Examiner',
  version: 'Version',
  reference: 'Référence illustrative',
  illustrative: 'Version illustrative — sans effet juridique',
  model: 'Version issue du modèle de la société — non officielle',
  submitted: 'Créée le',
  back: 'Retour aux accords en attente',
  page: 'Page',
  loaded:
    'Cette page reflète la dernière lecture. Actualisez pour inclure les changements.',
  contract: 'Contrat',
  precontract: 'Précontrat',
  addendum: 'Avenant',
};
const ro: Copy = {
  title: 'Contracte în așteptarea deciziei interne',
  introduction:
    'Contracte, precontracte și acte adiționale curente fără decizie internă. Deschideți versiunea pentru verificările actuale; așteptarea nu garantează aprobarea, acceptarea sau semnarea.',
  empty: 'Nicio versiune de acord nu așteaptă decizia dvs.',
  laterEmpty: 'Pagina este acum goală. Reveniți sau actualizați de la început.',
  loading: 'Se încarcă acordurile în așteptare…',
  error: 'Acordurile în așteptare nu au putut fi încărcate.',
  denied: 'Acordurile în așteptare nu sunt disponibile cu accesul dvs. actual.',
  refresh: 'Actualizează de la început',
  retry: 'Reîncearcă această pagină',
  next: 'Pagina următoare',
  previous: 'Pagina precedentă',
  open: 'Examinează',
  version: 'Versiunea',
  reference: 'Referință ilustrativă',
  illustrative: 'Versiune ilustrativă — fără efect juridic',
  model: 'Versiune din modelul companiei — neoficială',
  submitted: 'Creată la',
  back: 'Înapoi la acordurile în așteptare',
  page: 'Pagina',
  loaded:
    'Pagina reflectă ultima citire. Actualizați pentru a include modificările.',
  contract: 'Contract',
  precontract: 'Precontract',
  addendum: 'Act adițional',
};
const ru: Copy = {
  title: 'Договоры, ожидающие внутреннего решения',
  introduction:
    'Текущие договоры, предварительные договоры и дополнительные соглашения без внутреннего решения. Откройте версию для актуальных проверок; ожидание не гарантирует готовность к утверждению, принятие или подписание.',
  empty: 'Нет версий соглашений, ожидающих вашего решения.',
  laterEmpty:
    'Эта страница теперь пуста. Вернитесь назад или обновите с начала.',
  loading: 'Загрузка ожидающих соглашений…',
  error: 'Не удалось загрузить ожидающие соглашения.',
  denied: 'Ожидающие соглашения недоступны с вашими текущими правами.',
  refresh: 'Обновить с начала',
  retry: 'Повторить загрузку страницы',
  next: 'Следующая страница',
  previous: 'Предыдущая страница',
  open: 'Рассмотреть',
  version: 'Версия',
  reference: 'Иллюстративный номер',
  illustrative: 'Иллюстративная версия — без юридического действия',
  model: 'Версия по модели компании — неофициальная',
  submitted: 'Создана',
  back: 'Назад к ожидающим соглашениям',
  page: 'Страница',
  loaded:
    'Страница отражает последнее чтение. Обновите её, чтобы увидеть изменения.',
  contract: 'Договор',
  precontract: 'Предварительный договор',
  addendum: 'Дополнительное соглашение',
};
export function useContractDecisionQueueCopy() {
  const { locale } = useInterfaceLocale();
  return { en, fr, ro, ru }[locale];
}
