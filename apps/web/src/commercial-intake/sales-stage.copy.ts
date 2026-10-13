import { defineMessages, useMessages } from '../localization/messages';

// The product copy around Sales Stages in the four interface locales
// (Commercial Workflow PRD section 24.1). Stage labels are tenant data and
// are never translated: they are shown exactly as entered.
const keys = [
  'salesStage',
  'stageNone',
  'changeStage',
  'stageChoice',
  'stageListLoading',
  'stageListError',
  'stageReloadList',
  'stageNoneConfigured',
  'saveStage',
  'cancelStage',
  'retryStage',
  'stageSaving',
  'stageChanged',
  'stageUnchanged',
  'stageUnavailable',
  'stageConflict',
  'stageDenied',
  'stageUncertain',
  'stageHistory',
  'stageHistoryEmpty',
  'stageHistoryChange',
  'stageHistoryOlder',
  'stageHistoryOlderLoading',
  'stageHistoryOlderError',
  'requestedAfterStageEdit',
  'openSalesStageSettings',
  'salesStageSettings',
  'salesStageSettingsHelp',
  'salesStageList',
  'salesStagesLoading',
  'salesStagesError',
  'salesStagesReload',
  'salesStagesEmpty',
  'stateActive',
  'salesStageReadOnly',
  'salesStageLabel',
  'createSalesStage',
  'retrySalesStage',
  'cancelSalesStage',
  'salesStageSaving',
  'salesStageCreated',
  'salesStageLabelValidation',
  'salesStageLabelTaken',
  'salesStageLimit',
  'salesStageConflict',
  'salesStageDenied',
  'salesStageUncertain',
  'activityStageChanged',
  'activitySalesStageConfigured',
  'activityStageChange',
  'operationCreated',
  'activityStageConfigured',
  'configurationBundle',
  'configurationPrerequisites',
  'configurationGranted',
  'configurationRevoked',
] as const;

export type SalesStageMessageKey = (typeof keys)[number];

export const salesStageMessages = defineMessages(keys, {
  en: {
    salesStage: 'Sales Stage',
    stageNone: 'No Sales Stage',
    changeStage: 'Change Sales Stage',
    stageChoice: 'New Sales Stage',
    stageListLoading: 'Loading Sales Stages…',
    stageListError: 'The Sales Stages could not be loaded. Reload the list.',
    stageReloadList: 'Reload the list',
    stageNoneConfigured:
      'No Sales Stage is configured for this Company yet. A holder of Company Sales Stage Configuration must create one first in the Sales Stage settings.',
    saveStage: 'Save Sales Stage',
    cancelStage: 'Cancel',
    retryStage: 'Retry update',
    stageSaving: 'Saving Sales Stage…',
    stageChanged: 'Sales Stage changed.',
    stageUnchanged: 'The Opportunity already had this Sales Stage.',
    stageUnavailable:
      'This Sales Stage can no longer be assigned. Reload the list.',
    stageConflict:
      'This Opportunity changed since you loaded it. Reload the Request before changing the Sales Stage.',
    stageDenied:
      'You no longer have permission to change the Sales Stage of this Opportunity.',
    stageUncertain:
      'The Sales Stage change did not complete. Retry to confirm the result.',
    stageHistory: 'Sales Stage history',
    stageHistoryEmpty: 'No Sales Stage change recorded yet.',
    stageHistoryChange: '{previous} → {next}',
    stageHistoryOlder: 'Show older Sales Stage changes',
    stageHistoryOlderLoading: 'Loading older Sales Stage changes…',
    stageHistoryOlderError:
      'Older Sales Stage changes could not be loaded. Try again.',
    requestedAfterStageEdit:
      'The requested Client Request opens after the Sales Stage change is saved or cancelled.',
    openSalesStageSettings: 'Sales Stage settings',
    salesStageSettings: 'Sales Stage settings',
    salesStageSettingsHelp:
      'The Sales Stages of this Company, in order. Stage labels are shown exactly as entered.',
    salesStageList: 'Sales Stages',
    salesStagesLoading: 'Loading Sales Stages…',
    salesStagesError: 'The Sales Stages could not be loaded. Please try again.',
    salesStagesReload: 'Reload Sales Stages',
    salesStagesEmpty: 'No Sales Stage is configured for this Company yet.',
    stateActive: 'Active',
    salesStageReadOnly:
      'Only a holder of Company Sales Stage Configuration can add Sales Stages.',
    salesStageLabel: 'New stage label',
    createSalesStage: 'Add stage',
    retrySalesStage: 'Retry adding the stage',
    cancelSalesStage: 'Cancel',
    salesStageSaving: 'Adding the stage…',
    salesStageCreated: 'Sales Stage added.',
    salesStageLabelValidation: 'Enter a label between 1 and 80 characters.',
    salesStageLabelTaken:
      'Another Sales Stage of this Company already uses this label.',
    salesStageLimit: 'This Company already has the maximum of 30 Sales Stages.',
    salesStageConflict:
      'The Sales Stages changed since you loaded them. Reload them before adding a stage.',
    salesStageDenied:
      'You no longer have permission to configure Sales Stages.',
    salesStageUncertain:
      'Adding the stage did not complete. Retry to confirm the result.',
    activityStageChanged: 'changed the Sales Stage of an Opportunity',
    activitySalesStageConfigured: 'configured a Sales Stage',
    activityStageChange: '({previous} → {next})',
    operationCreated: 'created',
    activityStageConfigured: '({operation}: {label})',
    configurationBundle: 'Company Sales Stage Configuration',
    configurationPrerequisites:
      'Company Sales Stage Configuration v1 grants only the configuration of the Company Sales Stages. Company context and Commercial Intake read are authorized separately.',
    configurationGranted: 'granted Company Sales Stage Configuration',
    configurationRevoked: 'revoked Company Sales Stage Configuration',
  },
  ro: {
    salesStage: 'Etapă de vânzare',
    stageNone: 'Fără etapă de vânzare',
    changeStage: 'Schimbați etapa de vânzare',
    stageChoice: 'Etapă de vânzare nouă',
    stageListLoading: 'Se încarcă etapele de vânzare…',
    stageListError:
      'Etapele de vânzare nu au putut fi încărcate. Reîncărcați lista.',
    stageReloadList: 'Reîncărcați lista',
    stageNoneConfigured:
      'Nu este configurată încă nicio etapă de vânzare pentru această companie. Un deținător al configurării etapelor de vânzare trebuie mai întâi să creeze una în setările etapelor de vânzare.',
    saveStage: 'Salvați etapa de vânzare',
    cancelStage: 'Anulați',
    retryStage: 'Reîncercați actualizarea',
    stageSaving: 'Se salvează etapa de vânzare…',
    stageChanged: 'Etapa de vânzare a fost schimbată.',
    stageUnchanged: 'Oportunitatea avea deja această etapă de vânzare.',
    stageUnavailable:
      'Această etapă de vânzare nu mai poate fi atribuită. Reîncărcați lista.',
    stageConflict:
      'Această oportunitate s-a modificat după ce ați încărcat-o. Reîncărcați solicitarea înainte de a schimba etapa de vânzare.',
    stageDenied:
      'Nu mai aveți permisiunea de a schimba etapa de vânzare a acestei oportunități.',
    stageUncertain:
      'Schimbarea etapei de vânzare nu s-a încheiat. Reîncercați pentru a confirma rezultatul.',
    stageHistory: 'Istoricul etapelor de vânzare',
    stageHistoryEmpty: 'Nicio schimbare a etapei de vânzare înregistrată încă.',
    stageHistoryChange: '{previous} → {next}',
    stageHistoryOlder: 'Afișați schimbările mai vechi ale etapei de vânzare',
    stageHistoryOlderLoading:
      'Se încarcă schimbările mai vechi ale etapei de vânzare…',
    stageHistoryOlderError:
      'Schimbările mai vechi ale etapei de vânzare nu au putut fi încărcate. Încercați din nou.',
    requestedAfterStageEdit:
      'Solicitarea clientului cerută se deschide după ce schimbarea etapei de vânzare este salvată sau anulată.',
    openSalesStageSettings: 'Setările etapelor de vânzare',
    salesStageSettings: 'Setările etapelor de vânzare',
    salesStageSettingsHelp:
      'Etapele de vânzare ale acestei companii, în ordine. Denumirile etapelor sunt afișate exact așa cum au fost introduse.',
    salesStageList: 'Etape de vânzare',
    salesStagesLoading: 'Se încarcă etapele de vânzare…',
    salesStagesError:
      'Etapele de vânzare nu au putut fi încărcate. Încercați din nou.',
    salesStagesReload: 'Reîncărcați etapele de vânzare',
    salesStagesEmpty:
      'Nu este configurată încă nicio etapă de vânzare pentru această companie.',
    stateActive: 'Activă',
    salesStageReadOnly:
      'Doar un deținător al configurării etapelor de vânzare ale companiei poate adăuga etape de vânzare.',
    salesStageLabel: 'Denumirea etapei noi',
    createSalesStage: 'Adăugați etapa',
    retrySalesStage: 'Reîncercați adăugarea etapei',
    cancelSalesStage: 'Anulați',
    salesStageSaving: 'Se adaugă etapa…',
    salesStageCreated: 'Etapa de vânzare a fost adăugată.',
    salesStageLabelValidation:
      'Introduceți o denumire de cel puțin 1 și cel mult 80 de caractere.',
    salesStageLabelTaken:
      'O altă etapă de vânzare a acestei companii folosește deja această denumire.',
    salesStageLimit:
      'Această companie are deja numărul maxim de 30 de etape de vânzare.',
    salesStageConflict:
      'Etapele de vânzare s-au modificat după ce le-ați încărcat. Reîncărcați-le înainte de a adăuga o etapă.',
    salesStageDenied:
      'Nu mai aveți permisiunea de a configura etapele de vânzare.',
    salesStageUncertain:
      'Adăugarea etapei nu s-a încheiat. Reîncercați pentru a confirma rezultatul.',
    activityStageChanged: 'a schimbat etapa de vânzare a unei oportunități',
    activitySalesStageConfigured: 'a configurat o etapă de vânzare',
    activityStageChange: '({previous} → {next})',
    operationCreated: 'creată',
    activityStageConfigured: '({operation}: {label})',
    configurationBundle: 'Configurarea etapelor de vânzare ale companiei',
    configurationPrerequisites:
      'Configurarea etapelor de vânzare ale companiei v1 acordă doar configurarea etapelor de vânzare ale companiei. Contextul companiei și citirea solicitărilor și oportunităților comerciale sunt autorizate separat.',
    configurationGranted:
      'a acordat configurarea etapelor de vânzare ale companiei',
    configurationRevoked:
      'a retras configurarea etapelor de vânzare ale companiei',
  },
  ru: {
    salesStage: 'Этап продаж',
    stageNone: 'Без этапа продаж',
    changeStage: 'Изменить этап продаж',
    stageChoice: 'Новый этап продаж',
    stageListLoading: 'Загрузка этапов продаж…',
    stageListError: 'Не удалось загрузить этапы продаж. Перезагрузите список.',
    stageReloadList: 'Перезагрузить список',
    stageNoneConfigured:
      'Для этой компании ещё не настроен ни один этап продаж. Сначала обладатель права настройки этапов продаж должен создать этап в настройках этапов продаж.',
    saveStage: 'Сохранить этап продаж',
    cancelStage: 'Отмена',
    retryStage: 'Повторить обновление',
    stageSaving: 'Сохранение этапа продаж…',
    stageChanged: 'Этап продаж изменён.',
    stageUnchanged: 'У возможности уже был этот этап продаж.',
    stageUnavailable:
      'Этот этап продаж больше нельзя назначить. Перезагрузите список.',
    stageConflict:
      'Эта возможность изменилась после загрузки. Перезагрузите запрос, прежде чем менять этап продаж.',
    stageDenied: 'У вас больше нет права менять этап продаж этой возможности.',
    stageUncertain:
      'Изменение этапа продаж не завершилось. Повторите попытку, чтобы подтвердить результат.',
    stageHistory: 'История этапов продаж',
    stageHistoryEmpty: 'Изменения этапа продаж ещё не зарегистрированы.',
    stageHistoryChange: '{previous} → {next}',
    stageHistoryOlder: 'Показать более ранние изменения этапа продаж',
    stageHistoryOlderLoading: 'Загрузка более ранних изменений этапа продаж…',
    stageHistoryOlderError:
      'Не удалось загрузить более ранние изменения этапа продаж. Попробуйте ещё раз.',
    requestedAfterStageEdit:
      'Запрошенный запрос клиента откроется после сохранения или отмены изменения этапа продаж.',
    openSalesStageSettings: 'Настройки этапов продаж',
    salesStageSettings: 'Настройки этапов продаж',
    salesStageSettingsHelp:
      'Этапы продаж этой компании по порядку. Названия этапов показываются точно так, как они были введены.',
    salesStageList: 'Этапы продаж',
    salesStagesLoading: 'Загрузка этапов продаж…',
    salesStagesError: 'Не удалось загрузить этапы продаж. Попробуйте ещё раз.',
    salesStagesReload: 'Перезагрузить этапы продаж',
    salesStagesEmpty: 'Для этой компании ещё не настроен ни один этап продаж.',
    stateActive: 'Активен',
    salesStageReadOnly:
      'Добавлять этапы продаж может только обладатель права настройки этапов продаж компании.',
    salesStageLabel: 'Название нового этапа',
    createSalesStage: 'Добавить этап',
    retrySalesStage: 'Повторить добавление этапа',
    cancelSalesStage: 'Отмена',
    salesStageSaving: 'Добавление этапа…',
    salesStageCreated: 'Этап продаж добавлен.',
    salesStageLabelValidation: 'Введите название длиной от 1 до 80 символов.',
    salesStageLabelTaken:
      'Другой этап продаж этой компании уже использует это название.',
    salesStageLimit:
      'У этой компании уже максимальное количество этапов продаж — 30.',
    salesStageConflict:
      'Этапы продаж изменились после загрузки. Перезагрузите их, прежде чем добавлять этап.',
    salesStageDenied: 'У вас больше нет права настраивать этапы продаж.',
    salesStageUncertain:
      'Добавление этапа не завершилось. Повторите попытку, чтобы подтвердить результат.',
    activityStageChanged: 'изменил(а) этап продаж возможности',
    activitySalesStageConfigured: 'настроил(а) этап продаж',
    activityStageChange: '({previous} → {next})',
    operationCreated: 'создан',
    activityStageConfigured: '({operation}: {label})',
    configurationBundle: 'Настройка этапов продаж компании',
    configurationPrerequisites:
      'Настройка этапов продаж компании v1 даёт только право настраивать этапы продаж компании. Контекст компании и чтение коммерческих запросов и возможностей разрешаются отдельно.',
    configurationGranted: 'выдал(а) право настройки этапов продаж компании',
    configurationRevoked: 'отозвал(а) право настройки этапов продаж компании',
  },
  fr: {
    salesStage: 'Étape de vente',
    stageNone: 'Aucune étape de vente',
    changeStage: 'Modifier l’étape de vente',
    stageChoice: 'Nouvelle étape de vente',
    stageListLoading: 'Chargement des étapes de vente…',
    stageListError:
      'Les étapes de vente n’ont pas pu être chargées. Rechargez la liste.',
    stageReloadList: 'Recharger la liste',
    stageNoneConfigured:
      'Aucune étape de vente n’est encore configurée pour cette société. Un titulaire de la configuration des étapes de vente doit d’abord en créer une dans les paramètres des étapes de vente.',
    saveStage: 'Enregistrer l’étape de vente',
    cancelStage: 'Annuler',
    retryStage: 'Réessayer la mise à jour',
    stageSaving: 'Enregistrement de l’étape de vente…',
    stageChanged: 'Étape de vente modifiée.',
    stageUnchanged: 'L’opportunité avait déjà cette étape de vente.',
    stageUnavailable:
      'Cette étape de vente ne peut plus être attribuée. Rechargez la liste.',
    stageConflict:
      'Cette opportunité a changé depuis son chargement. Rechargez la demande avant de modifier l’étape de vente.',
    stageDenied:
      'Vous n’avez plus l’autorisation de modifier l’étape de vente de cette opportunité.',
    stageUncertain:
      'La modification de l’étape de vente n’a pas abouti. Réessayez pour confirmer le résultat.',
    stageHistory: 'Historique des étapes de vente',
    stageHistoryEmpty:
      'Aucun changement d’étape de vente enregistré pour l’instant.',
    stageHistoryChange: '{previous} → {next}',
    stageHistoryOlder: 'Afficher les changements d’étape de vente plus anciens',
    stageHistoryOlderLoading:
      'Chargement des changements d’étape de vente plus anciens…',
    stageHistoryOlderError:
      'Les changements d’étape de vente plus anciens n’ont pas pu être chargés. Réessayez.',
    requestedAfterStageEdit:
      'La demande client demandée s’ouvrira une fois la modification de l’étape de vente enregistrée ou annulée.',
    openSalesStageSettings: 'Paramètres des étapes de vente',
    salesStageSettings: 'Paramètres des étapes de vente',
    salesStageSettingsHelp:
      'Les étapes de vente de cette société, dans l’ordre. Les libellés des étapes sont affichés exactement tels qu’ils ont été saisis.',
    salesStageList: 'Étapes de vente',
    salesStagesLoading: 'Chargement des étapes de vente…',
    salesStagesError:
      'Les étapes de vente n’ont pas pu être chargées. Veuillez réessayer.',
    salesStagesReload: 'Recharger les étapes de vente',
    salesStagesEmpty:
      'Aucune étape de vente n’est encore configurée pour cette société.',
    stateActive: 'Active',
    salesStageReadOnly:
      'Seul un titulaire de la configuration des étapes de vente de la société peut ajouter des étapes de vente.',
    salesStageLabel: 'Libellé de la nouvelle étape',
    createSalesStage: 'Ajouter l’étape',
    retrySalesStage: 'Réessayer l’ajout de l’étape',
    cancelSalesStage: 'Annuler',
    salesStageSaving: 'Ajout de l’étape…',
    salesStageCreated: 'Étape de vente ajoutée.',
    salesStageLabelValidation: 'Saisissez un libellé de 1 à 80 caractères.',
    salesStageLabelTaken:
      'Une autre étape de vente de cette société utilise déjà ce libellé.',
    salesStageLimit:
      'Cette société a déjà atteint le maximum de 30 étapes de vente.',
    salesStageConflict:
      'Les étapes de vente ont changé depuis leur chargement. Rechargez-les avant d’ajouter une étape.',
    salesStageDenied:
      'Vous n’avez plus l’autorisation de configurer les étapes de vente.',
    salesStageUncertain:
      'L’ajout de l’étape n’a pas abouti. Réessayez pour confirmer le résultat.',
    activityStageChanged: 'a modifié l’étape de vente d’une opportunité',
    activitySalesStageConfigured: 'a configuré une étape de vente',
    activityStageChange: '({previous} → {next})',
    operationCreated: 'créée',
    activityStageConfigured: '({operation} : {label})',
    configurationBundle: 'Configuration des étapes de vente de la société',
    configurationPrerequisites:
      'La configuration des étapes de vente de la société v1 accorde uniquement la configuration des étapes de vente de la société. Le contexte de société et la lecture des demandes et opportunités commerciales sont autorisés séparément.',
    configurationGranted:
      'a accordé la configuration des étapes de vente de la société',
    configurationRevoked:
      'a retiré la configuration des étapes de vente de la société',
  },
});

export const useSalesStageCopy = () => useMessages(salesStageMessages);
export type SalesStageCopy = ReturnType<typeof useSalesStageCopy>;
