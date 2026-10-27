import { useInterfaceLocale } from '../localization/interface-locale';
const en = {
  title: 'Offers awaiting an internal decision',
  introduction:
    'Current versions without an internal decision. Open a version to review its current checks; pending does not mean ready to approve.',
  empty: 'No Offer versions awaiting your decision.',
  laterEmpty: 'This page is now empty. Go back or refresh from the beginning.',
  loading: 'Loading pending Offers…',
  error: 'The pending Offers could not be loaded.',
  denied: 'Pending Offers are unavailable with your current access.',
  refresh: 'Refresh from beginning',
  retry: 'Retry this page',
  next: 'Next page',
  previous: 'Previous page',
  open: 'Review Offer',
  version: 'Version',
  reference: 'Illustrative reference',
  illustrative: 'Illustrative version — no legal effect',
  model: 'Company model version — non-official',
  submitted: 'Created',
  back: 'Back to pending Offers',
  page: 'Page',
  loaded: 'This page reflects the last read. Refresh to include changes.',
};
type Copy = { [K in keyof typeof en]: string };
const fr: Copy = {
  title: 'Offres en attente de décision interne',
  introduction:
    'Versions actuelles sans décision interne. Ouvrez une version pour examiner ses contrôles actuels ; une version en attente peut encore nécessiter des corrections.',
  empty: 'Aucune version d’offre en attente de votre décision.',
  laterEmpty:
    'Cette page est maintenant vide. Revenez en arrière ou actualisez depuis le début.',
  loading: 'Chargement des offres…',
  error: 'Impossible de charger les offres en attente.',
  denied: 'Les offres en attente sont indisponibles avec vos droits actuels.',
  refresh: 'Actualiser depuis le début',
  retry: 'Réessayer cette page',
  next: 'Page suivante',
  previous: 'Page précédente',
  open: 'Examiner l’offre',
  version: 'Version',
  reference: 'Référence illustrative',
  illustrative: 'Version illustrative — sans effet juridique',
  model: 'Version issue du modèle de la société — non officielle',
  submitted: 'Créée le',
  back: 'Retour aux offres en attente',
  page: 'Page',
  loaded:
    'Cette page reflète la dernière lecture. Actualisez pour inclure les changements.',
};
const ro: Copy = {
  title: 'Oferte în așteptarea deciziei interne',
  introduction:
    'Versiuni curente fără decizie internă. Deschideți versiunea pentru verificările actuale; așteptarea nu garantează posibilitatea aprobării.',
  empty: 'Nicio versiune de ofertă nu așteaptă decizia dvs.',
  laterEmpty: 'Pagina este acum goală. Reveniți sau actualizați de la început.',
  loading: 'Se încarcă ofertele…',
  error: 'Ofertele în așteptare nu au putut fi încărcate.',
  denied: 'Ofertele în așteptare nu sunt disponibile cu accesul dvs. actual.',
  refresh: 'Actualizează de la început',
  retry: 'Reîncearcă această pagină',
  next: 'Pagina următoare',
  previous: 'Pagina precedentă',
  open: 'Examinează oferta',
  version: 'Versiunea',
  reference: 'Referință ilustrativă',
  illustrative: 'Versiune ilustrativă — fără efect juridic',
  model: 'Versiune din modelul companiei — neoficială',
  submitted: 'Creată la',
  back: 'Înapoi la ofertele în așteptare',
  page: 'Pagina',
  loaded:
    'Pagina reflectă ultima citire. Actualizați pentru a include modificările.',
};
const ru: Copy = {
  title: 'Предложения, ожидающие внутреннего решения',
  introduction:
    'Текущие версии без внутреннего решения. Откройте версию для актуальных проверок; ожидание не гарантирует готовность к утверждению.',
  empty: 'Нет версий предложений, ожидающих вашего решения.',
  laterEmpty:
    'Эта страница теперь пуста. Вернитесь назад или обновите с начала.',
  loading: 'Загрузка предложений…',
  error: 'Не удалось загрузить ожидающие предложения.',
  denied: 'Ожидающие предложения недоступны с вашими текущими правами.',
  refresh: 'Обновить с начала',
  retry: 'Повторить загрузку страницы',
  next: 'Следующая страница',
  previous: 'Предыдущая страница',
  open: 'Рассмотреть предложение',
  version: 'Версия',
  reference: 'Иллюстративный номер',
  illustrative: 'Иллюстративная версия — без юридического действия',
  model: 'Версия по модели компании — неофициальная',
  submitted: 'Создана',
  back: 'Назад к ожидающим предложениям',
  page: 'Страница',
  loaded:
    'Страница отражает последнее чтение. Обновите её, чтобы увидеть изменения.',
};
export function useOfferDecisionQueueCopy() {
  const { locale } = useInterfaceLocale();
  return { en, fr, ro, ru }[locale];
}
