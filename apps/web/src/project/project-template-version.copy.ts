import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'latest',
  'region',
  'heading',
  'notice',
  'source',
  'field',
  'preview',
  'publish',
  'loading',
  'error',
  'denied',
  'readOnly',
  'reload',
  'unchanged',
  'invalid',
  'pending',
  'uncertain',
  'retry',
  'stale',
  'keyConflict',
  'published',
  'bundle',
  'prerequisites',
  'activity',
  'granted',
  'revoked',
  'more',
] as const;
export const projectTemplateVersionMessages = defineMessages(keys, {
  en: {
    latest: 'Return to latest Template Versions',
    region: 'Template Versions',
    heading: 'Publish a Template successor',
    notice:
      'Existing Projects keep their copied Tasks and history. This illustrative model authorizes no real engagement.',
    source: 'Source Version {version}',
    field: 'Required Task {number} title',
    preview: 'Successor preview',
    publish: 'Publish successor Version',
    loading: 'Loading Template Versions…',
    error: 'Template Versions could not be loaded.',
    denied:
      'Template configuration or catalogue access is no longer available.',
    readOnly:
      'A separate Company Project Template Configuration grant is required to publish.',
    reload: 'Reload current Template head',
    unchanged: 'Change at least one Task title before publishing.',
    invalid:
      'Each of the four Task titles must contain 1–200 characters after trimming.',
    pending: 'Publishing successor Version…',
    uncertain:
      'Publication could not be confirmed. Retry the exact same publication safely.',
    retry: 'Retry exact publication',
    stale:
      'The Template head changed. Explicitly reload before publishing again.',
    keyConflict:
      'This publication key belongs to another intention. Reload before starting again.',
    published: 'Successor Version {version} published.',
    bundle: 'Company Project Template Configuration',
    prerequisites:
      'Publishes only four illustrative Task titles. Company context, Project read and Template read remain independent; no Client or Task authority is granted.',
    activity: 'Template successor Version published',
    granted: 'Project Template Configuration granted',
    revoked: 'Project Template Configuration revoked',
    more: 'Load older Template Versions',
  },
  fr: {
    latest: 'Revenir aux Versions récentes du modèle',
    region: 'Versions du modèle',
    heading: 'Publier une version suivante du modèle',
    notice:
      'Les Projets existants conservent leurs Tâches copiées et leur historique. Ce modèle illustratif n’autorise aucune mission réelle.',
    source: 'Version source {version}',
    field: 'Titre de la Tâche requise {number}',
    preview: 'Aperçu de la version suivante',
    publish: 'Publier la version suivante',
    loading: 'Chargement des versions du modèle…',
    error: 'Les versions du modèle n’ont pas pu être chargées.',
    denied:
      'L’accès à la configuration ou au catalogue du modèle n’est plus disponible.',
    readOnly:
      'Un droit distinct de Configuration des modèles de Projet de la Company est requis pour publier.',
    reload: 'Recharger la version courante du modèle',
    unchanged: 'Modifiez au moins un titre de Tâche avant de publier.',
    invalid:
      'Chacun des quatre titres de Tâche doit contenir de 1 à 200 caractères après suppression des espaces en début et en fin.',
    pending: 'Publication de la version suivante…',
    uncertain:
      'La publication n’a pas pu être confirmée. Réessayez exactement la même publication en sécurité.',
    retry: 'Réessayer la publication exacte',
    stale:
      'La version courante du modèle a changé. Rechargez-la explicitement avant de publier à nouveau.',
    keyConflict:
      'Cette clé de publication correspond à une autre intention. Rechargez avant de recommencer.',
    published: 'Version suivante {version} publiée.',
    bundle: 'Configuration des modèles de Projet de la Company',
    prerequisites:
      'Publie uniquement quatre titres de Tâches illustratives. Le contexte Company et les lectures de Projet et de modèle restent indépendants ; aucun droit Client ou Tâche n’est accordé.',
    activity: 'Version suivante du modèle publiée',
    granted: 'Configuration des modèles de Projet accordée',
    revoked: 'Configuration des modèles de Projet révoquée',
    more: 'Charger les anciennes versions du modèle',
  },
  ro: {
    latest: 'Reveniți la cele mai recente Versiuni ale modelului',
    region: 'Versiunile modelului',
    heading: 'Publicați o versiune succesoare a modelului',
    notice:
      'Proiectele existente își păstrează Sarcinile copiate și istoricul. Acest model ilustrativ nu autorizează o misiune reală.',
    source: 'Versiunea sursă {version}',
    field: 'Titlul Sarcinii obligatorii {number}',
    preview: 'Previzualizarea versiunii succesoare',
    publish: 'Publicați versiunea succesoare',
    loading: 'Se încarcă versiunile modelului…',
    error: 'Versiunile modelului nu au putut fi încărcate.',
    denied:
      'Accesul la configurarea sau catalogul modelului nu mai este disponibil.',
    readOnly:
      'Publicarea necesită un drept separat de Configurare a modelelor de Proiect ale Company.',
    reload: 'Reîncărcați versiunea curentă a modelului',
    unchanged: 'Modificați cel puțin un titlu de Sarcină înainte de publicare.',
    invalid:
      'Fiecare dintre cele patru titluri de Sarcină trebuie să aibă 1–200 de caractere după eliminarea spațiilor de la margini.',
    pending: 'Se publică versiunea succesoare…',
    uncertain:
      'Publicarea nu a putut fi confirmată. Reîncercați în siguranță exact aceeași publicare.',
    retry: 'Reîncercați publicarea exactă',
    stale:
      'Versiunea curentă a modelului s-a schimbat. Reîncărcați explicit înainte de a publica din nou.',
    keyConflict:
      'Această cheie de publicare aparține altei intenții. Reîncărcați înainte de a începe din nou.',
    published: 'Versiunea succesoare {version} a fost publicată.',
    bundle: 'Configurarea modelelor de Proiect ale Company',
    prerequisites:
      'Publică doar patru titluri de Sarcini ilustrative. Contextul Company și citirea Proiectului și a modelului rămân independente; nu acordă drepturi asupra Clienților sau Sarcinilor.',
    activity: 'Versiune succesoare a modelului publicată',
    granted: 'Configurarea modelelor de Proiect a fost acordată',
    revoked: 'Configurarea modelelor de Proiect a fost revocată',
    more: 'Încărcați versiunile anterioare ale modelului',
  },
  ru: {
    latest: 'Вернуться к последним Версиям шаблона',
    region: 'Версии шаблона',
    heading: 'Опубликовать следующую версию шаблона',
    notice:
      'Существующие Проекты сохраняют скопированные Задачи и историю. Этот иллюстративный шаблон не разрешает начало реальной миссии.',
    source: 'Исходная версия {version}',
    field: 'Название обязательной Задачи {number}',
    preview: 'Предпросмотр следующей версии',
    publish: 'Опубликовать следующую версию',
    loading: 'Загрузка версий шаблона…',
    error: 'Не удалось загрузить версии шаблона.',
    denied: 'Доступ к настройке или каталогу шаблона больше недоступен.',
    readOnly:
      'Для публикации нужно отдельное право настройки шаблонов Проекта Company.',
    reload: 'Загрузить текущую версию шаблона',
    unchanged: 'Перед публикацией измените хотя бы одно название Задачи.',
    invalid:
      'Каждое из четырёх названий Задач должно содержать 1–200 символов после удаления пробелов по краям.',
    pending: 'Публикация следующей версии…',
    uncertain:
      'Не удалось подтвердить публикацию. Безопасно повторите в точности ту же публикацию.',
    retry: 'Повторить точную публикацию',
    stale:
      'Текущая версия шаблона изменилась. Явно загрузите её перед новой публикацией.',
    keyConflict:
      'Этот ключ публикации относится к другому намерению. Загрузите текущую версию перед новым действием.',
    published: 'Следующая версия {version} опубликована.',
    bundle: 'Настройка шаблонов Проекта Company',
    prerequisites:
      'Публикует только четыре названия иллюстративных Задач. Контекст Company, чтение Проекта и шаблона остаются отдельными правами; права на Клиентов или Задачи не предоставляются.',
    activity: 'Следующая версия шаблона опубликована',
    granted: 'Предоставлено право настройки шаблонов Проекта',
    revoked: 'Отозвано право настройки шаблонов Проекта',
    more: 'Загрузить предыдущие версии шаблона',
  },
});
export function useProjectTemplateVersionCopy() {
  return useMessages(projectTemplateVersionMessages);
}
