import { useInterfaceLocale } from '../localization/interface-locale';
const en = {
  title: 'Pending profitability estimates',
  introduction:
    'Review each exact submitted version. Earlier versions can still await their own decision.',
  empty: 'No estimate versions awaiting your decision.',
  loading: 'Loading pending estimates…',
  error: 'The pending estimates could not be loaded.',
  denied: 'Pending estimates are unavailable with your current access.',
  refresh: 'Refresh from beginning',
  retry: 'Retry this page',
  next: 'Next page',
  previous: 'Previous page',
  open: 'Review version',
  version: 'Version',
  earlier: 'Earlier version',
  latest: 'Latest submitted version',
  submitted: 'Submitted',
  back: 'Back to pending estimates',
  page: 'Page',
  loaded: 'This page reflects the last read. Refresh to include changes.',
};
type Copy = { [K in keyof typeof en]: string };
const fr: Copy = {
  title: 'Estimations économiques à valider',
  introduction:
    'Examinez chaque version exacte soumise. Les anciennes versions peuvent encore attendre leur propre décision.',
  empty: 'Aucune version d’estimation en attente de votre décision.',
  loading: 'Chargement des estimations…',
  error: 'Impossible de charger les estimations en attente.',
  denied:
    'Les estimations en attente sont indisponibles avec vos droits actuels.',
  refresh: 'Actualiser depuis le début',
  retry: 'Réessayer cette page',
  next: 'Page suivante',
  previous: 'Page précédente',
  open: 'Examiner la version',
  version: 'Version',
  earlier: 'Ancienne version',
  latest: 'Dernière version soumise',
  submitted: 'Soumise le',
  back: 'Retour aux estimations en attente',
  page: 'Page',
  loaded:
    'Cette page reflète la dernière lecture. Actualisez pour inclure les changements.',
};
const ro: Copy = {
  title: 'Estimări economice în așteptarea deciziei',
  introduction:
    'Examinați fiecare versiune exactă depusă. Versiunile anterioare pot încă aștepta propria decizie.',
  empty: 'Nicio versiune de estimare nu așteaptă decizia dvs.',
  loading: 'Se încarcă estimările…',
  error: 'Estimările în așteptare nu au putut fi încărcate.',
  denied: 'Estimările în așteptare nu sunt disponibile cu accesul dvs. actual.',
  refresh: 'Actualizează de la început',
  retry: 'Reîncearcă această pagină',
  next: 'Pagina următoare',
  previous: 'Pagina precedentă',
  open: 'Examinează versiunea',
  version: 'Versiunea',
  earlier: 'Versiune anterioară',
  latest: 'Ultima versiune depusă',
  submitted: 'Depusă la',
  back: 'Înapoi la estimările în așteptare',
  page: 'Pagina',
  loaded:
    'Pagina reflectă ultima citire. Actualizați pentru a include modificările.',
};
const ru: Copy = {
  title: 'Экономические оценки, ожидающие решения',
  introduction:
    'Рассмотрите каждую точную отправленную версию. Предыдущие версии могут ещё ожидать отдельного решения.',
  empty: 'Нет версий оценок, ожидающих вашего решения.',
  loading: 'Загрузка оценок…',
  error: 'Не удалось загрузить ожидающие оценки.',
  denied: 'Ожидающие оценки недоступны с вашими текущими правами.',
  refresh: 'Обновить с начала',
  retry: 'Повторить загрузку страницы',
  next: 'Следующая страница',
  previous: 'Предыдущая страница',
  open: 'Рассмотреть версию',
  version: 'Версия',
  earlier: 'Предыдущая версия',
  latest: 'Последняя отправленная версия',
  submitted: 'Отправлена',
  back: 'Назад к ожидающим оценкам',
  page: 'Страница',
  loaded:
    'Страница отражает последнее чтение. Обновите её, чтобы увидеть изменения.',
};
export function useDecisionQueueCopy() {
  const { locale } = useInterfaceLocale();
  return { en, fr, ro, ru }[locale];
}
