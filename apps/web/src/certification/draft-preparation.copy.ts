import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'open',
  'help',
  'run',
  'chooseRun',
  'preview',
  'more',
  'choose',
  'current',
  'original',
  'reviewed',
  'apply',
  'close',
  'loading',
  'failed',
  'changed',
  'draftChanged',
  'empty',
  'applied',
  'scopeHelp',
  'contextHelp',
  'referenceHelp',
  'contextHeading',
  'tooLong',
] as const;
export const draftPreparationMessages = defineMessages(keys, {
  en: {
    scopeHelp:
      'Choose the reviewed scope explicitly. Other plan fields remain yours to complete; ordinary Save is separate.',
    contextHelp:
      'Append selected quoted source facts to your working summary. These are source context and do not state audit work, findings, approval or conclusions. Your text is retained.',
    referenceHelp:
      'Reviewed source references only. The readiness decision and its basis remain your professional judgment; no value is inserted into them.',
    contextHeading:
      'Quoted source context — human-reviewed dossier facts, not audit conclusions',
    tooLong:
      'The selected context and your text exceed the native limit. Select fewer values or shorten your own draft; nothing was inserted.',
    open: 'Prepare from reviewed analysis',
    help: 'Only human-confirmed or corrected source values are offered. Select each replacement deliberately; the editable draft is not saved automatically. Other facts and declarations need your own review.',
    run: 'Analysis run',
    chooseRun: 'Choose a current analysis',
    preview: 'Preview reviewed values',
    more: 'Load more analyses',
    choose: 'Use {field}: {value}',
    current: 'Current draft',
    original: 'Original proposal',
    reviewed: 'Human review',
    apply: 'Insert selected values into draft',
    close: 'Close preparation',
    loading: 'Reading current sources and reviews…',
    failed:
      'Preparation could not be read. Your draft is unchanged. Try again.',
    changed:
      'Sources, reviews or the Case changed. Read a fresh preview before choosing again.',
    draftChanged:
      'Your draft changed while the values were checked. Nothing was inserted; review the changes and try again.',
    empty:
      'No eligible reviewed value is available. Complete the draft manually or review a current analysis.',
    applied:
      'Selected values inserted. Check and edit the draft before saving.',
  },
  ro: {
    scopeHelp:
      'Selectați explicit domeniul verificat. Completați separat celelalte câmpuri ale planului; salvarea obișnuită rămâne separată.',
    contextHelp:
      'Adăugați în rezumat citatele selectate din surse. Acestea sunt context documentar și nu constată lucrări de audit, neconformități, aprobări sau concluzii. Textul propriu se păstrează.',
    referenceHelp:
      'Doar referințe documentare verificate. Decizia privind pregătirea și motivarea ei rămân judecata profesională; nu se introduce nicio valoare în acestea.',
    contextHeading:
      'Context citat din surse — date din dosar verificate de o persoană, fără concluzii de audit',
    tooLong:
      'Contextul selectat și textul propriu depășesc limita câmpului. Selectați mai puține valori sau scurtați ciorna; nu s-a introdus nimic.',
    open: 'Pregătiți din analiza verificată',
    help: 'Sunt propuse doar valorile confirmate sau corectate de o persoană. Selectați explicit fiecare înlocuire; ciorna editabilă nu este salvată automat. Verificați separat celelalte date și declarații.',
    run: 'Rulare a analizei',
    chooseRun: 'Alegeți o analiză actuală',
    preview: 'Examinați valorile verificate',
    more: 'Încărcați alte analize',
    choose: 'Folosiți {field}: {value}',
    current: 'Ciorna actuală',
    original: 'Propunerea inițială',
    reviewed: 'Verificare umană',
    apply: 'Introduceți valorile selectate în ciornă',
    close: 'Închideți pregătirea',
    loading: 'Se citesc sursele și verificările actuale…',
    failed:
      'Pregătirea nu a putut fi citită. Ciorna nu a fost schimbată. Încercați din nou.',
    changed:
      'Sursele, verificările sau dosarul s-au schimbat. Citiți o examinare nouă înainte de a selecta din nou.',
    draftChanged:
      'Ciorna s-a schimbat în timpul verificării valorilor. Nu s-a introdus nimic; examinați modificările și încercați din nou.',
    empty:
      'Nu există nicio valoare verificată eligibilă. Completați ciorna manual sau verificați o analiză actuală.',
    applied:
      'Valorile selectate au fost introduse. Verificați și editați ciorna înainte de salvare.',
  },
  ru: {
    scopeHelp:
      'Явно выберите проверенную область аудита. Остальные поля плана заполните самостоятельно; обычное сохранение выполняется отдельно.',
    contextHelp:
      'Добавьте выбранные цитаты из источников в рабочее резюме. Это справочный контекст, который не подтверждает выполненный аудит, несоответствия, одобрение или выводы. Ваш текст сохраняется.',
    referenceHelp:
      'Только проверенные ссылки на источники. Решение о готовности и его обоснование остаются профессиональным суждением; значения в них не вставляются.',
    contextHeading:
      'Цитируемый контекст источников — данные досье, проверенные человеком, без выводов аудита',
    tooLong:
      'Выбранный контекст вместе с вашим текстом превышает ограничение поля. Выберите меньше значений или сократите черновик; ничего не вставлено.',
    open: 'Подготовить из проверенного анализа',
    help: 'Предлагаются только значения, подтверждённые или исправленные человеком. Явно выберите каждую замену; редактируемый черновик не сохраняется автоматически. Остальные данные и заявления проверьте отдельно.',
    run: 'Запуск анализа',
    chooseRun: 'Выберите актуальный анализ',
    preview: 'Просмотреть проверенные значения',
    more: 'Загрузить ещё анализы',
    choose: 'Использовать {field}: {value}',
    current: 'Текущий черновик',
    original: 'Исходное предложение',
    reviewed: 'Проверка человеком',
    apply: 'Вставить выбранные значения в черновик',
    close: 'Закрыть подготовку',
    loading: 'Чтение актуальных источников и проверок…',
    failed:
      'Не удалось прочитать подготовку. Черновик не изменён. Повторите попытку.',
    changed:
      'Источники, проверки или дело изменились. Прочитайте новый просмотр перед повторным выбором.',
    draftChanged:
      'Черновик изменился во время проверки значений. Ничего не вставлено; проверьте изменения и повторите попытку.',
    empty:
      'Нет подходящего проверенного значения. Заполните черновик вручную или проверьте актуальный анализ.',
    applied:
      'Выбранные значения вставлены. Проверьте и отредактируйте черновик перед сохранением.',
  },
  fr: {
    scopeHelp:
      'Choisissez explicitement le périmètre vérifié. Complétez les autres champs du plan ; l’enregistrement ordinaire reste séparé.',
    contextHelp:
      'Ajoutez les citations sélectionnées à votre résumé de travail. Ce contexte documentaire ne constitue aucune constatation, approbation ou conclusion d’audit. Votre texte est conservé.',
    referenceHelp:
      'Références documentaires vérifiées uniquement. La décision de préparation et sa justification restent votre jugement professionnel ; aucune valeur n’y est insérée.',
    contextHeading:
      'Contexte cité des sources — données du dossier vérifiées par une personne, sans conclusion d’audit',
    tooLong:
      'Le contexte sélectionné et votre texte dépassent la limite du champ. Sélectionnez moins de valeurs ou raccourcissez le brouillon ; rien n’a été inséré.',
    open: 'Préparer depuis une analyse vérifiée',
    help: 'Seules les valeurs confirmées ou corrigées par une personne sont proposées. Choisissez chaque remplacement ; le brouillon reste modifiable et n’est pas enregistré automatiquement. Vérifiez séparément les autres données et déclarations.',
    run: 'Exécution de l’analyse',
    chooseRun: 'Choisir une analyse actuelle',
    preview: 'Examiner les valeurs vérifiées',
    more: 'Charger d’autres analyses',
    choose: 'Utiliser {field} : {value}',
    current: 'Brouillon actuel',
    original: 'Proposition initiale',
    reviewed: 'Vérification humaine',
    apply: 'Insérer les valeurs sélectionnées dans le brouillon',
    close: 'Fermer la préparation',
    loading: 'Lecture des sources et vérifications actuelles…',
    failed:
      'La préparation n’a pas pu être lue. Votre brouillon est inchangé. Réessayez.',
    changed:
      'Les sources, vérifications ou le dossier ont changé. Examinez une nouvelle proposition avant de choisir à nouveau.',
    draftChanged:
      'Votre brouillon a changé pendant la vérification. Rien n’a été inséré ; examinez les modifications puis réessayez.',
    empty:
      'Aucune valeur vérifiée admissible. Complétez le brouillon manuellement ou vérifiez une analyse actuelle.',
    applied:
      'Valeurs sélectionnées insérées. Vérifiez et modifiez le brouillon avant de l’enregistrer.',
  },
});
export function useDraftPreparationCopy() {
  return useMessages(draftPreparationMessages);
}
