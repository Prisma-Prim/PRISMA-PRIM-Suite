import type {
  ConsistencyRule,
  DateFact,
  DiscrepancyState,
  DiscrepancyVerdict,
} from './certification-consistency.js';
import type { DossierItem } from './certification-decision.js';
import type { RegisterLanguage } from './certification-register.labels.js';

/** The register's fixed texts for the Dossier Consistency Check. */
export interface ConsistencyLabels {
  section: string;
  ruleSet: string;
  openCounts: string;
  none: string;
  manual: string;
  rules: Record<ConsistencyRule, string>;
  verdicts: Record<DiscrepancyVerdict, string>;
  status: { open: string; resolved: string };
  fields: {
    verdict: string;
    status: string;
    compared: string;
    firstValue: string;
    secondValue: string;
    opened: string;
    blocks: string;
    resolution: string;
    resolvedBy: string;
    resolvedAt: string;
    reason: string;
    note: string;
  };
  blocks: {
    decision: string;
    certificate_draft_approval: string;
    nothing: string;
  };
  resolutions: {
    acceptance: string;
    justification: string;
    record: string;
    resolution: string;
  };
  subjects: {
    durationProposal: string;
    priorCertification: string;
    stageShare: string;
    stageCapacity: string;
    dateOrder: string;
    dossierItem: string;
    certificateText: string;
    certificateNumber: string;
    addressNumbers: string;
    documentVersion: string;
    planSending: string;
    exchangeReference: string;
    exchangeDeadline: string;
  };
  textFields: {
    holderName: string;
    address: string;
    scope: string;
    language: string;
  };
  dates: Record<DateFact, string>;
  items: Record<DossierItem, string>;
  states: Record<DiscrepancyState, string>;
  units: {
    auditorDays: string;
    capacity: string;
    version: string;
    revision: string;
    finding: string;
    certificate: string;
    exchange: string;
  };
}

export const CONSISTENCY_LABELS: Record<RegisterLanguage, ConsistencyLabels> = {
  en: {
    section: 'Dossier consistency',
    ruleSet: 'Rule set',
    openCounts:
      'Open: {critical} critical, {error} error, {toClarify} to clarify',
    none: 'No Discrepancy found by rule set {version}.',
    manual: 'Manual Discrepancy',
    rules: {
      R01: 'Audit duration against the current application',
      R02: 'Prior-certification reduction against declared certifications',
      R03: 'Stage plan days against the Stage share of the duration',
      R04: 'Stage plan days against calendar days and auditors on site',
      R05: 'Business dates in order',
      R06: 'Stage plan sent after the Stage’s first day',
      R07: 'Stage plan sending against the register',
      R08: 'Dossier item answered present without its record',
      R09: 'Dossier item answered missing or not applicable while recorded',
      R10: 'Record changed after the dossier review',
      R11: 'Granted texts against the agreed Certificate data',
      R13: 'Draft number against issued Certificates',
      R12: 'House numbers and postal codes of the addresses',
      R14: 'Record relying on an older Document Version',
      R15: 'Outgoing reference carried by several sendings',
      R16: 'Sending before a “not before” procedure deadline',
    },
    verdicts: {
      critical: 'Critical',
      error: 'Error',
      to_clarify: 'To clarify',
    },
    status: { open: 'Open', resolved: 'Resolved' },
    fields: {
      verdict: 'Verdict',
      status: 'Status',
      compared: 'Compared',
      firstValue: 'First value',
      secondValue: 'Second value',
      opened: 'Open since',
      blocks: 'Blocks',
      resolution: 'Resolution',
      resolvedBy: 'Resolved by',
      resolvedAt: 'Resolved at',
      reason: 'Reason',
      note: 'Note',
    },
    blocks: {
      decision: 'The Certification Decision',
      certificate_draft_approval: 'Draft approval',
      nothing: 'Nothing',
    },
    resolutions: {
      acceptance: 'Accepted',
      justification: 'Accepted with the record’s justification',
      record: 'Corrected by a new record version',
      resolution: 'Corrected',
    },
    subjects: {
      certificateNumber: 'Certificate number',
      durationProposal: 'Duration proposal',
      priorCertification: 'Prior-certification reduction',
      stageShare: 'Stage share of the duration',
      stageCapacity: 'Auditor-days on site',
      dateOrder: 'Date order',
      dossierItem: 'Dossier item',
      certificateText: 'Certificate text',
      addressNumbers: 'Address numbers',
      documentVersion: 'Document Version',
      planSending: 'Stage plan sending',
      exchangeReference: 'Outgoing reference',
      exchangeDeadline: 'Stage 2 report released to the client',
    },
    textFields: {
      holderName: 'holder',
      address: 'address',
      scope: 'scope',
      language: 'language',
    },
    dates: {
      draft_sent: 'Draft sent',
      client_opinion: 'Client opinion',
      agreement_signed: 'Agreement signed',
      team_approved: 'Team approved on behalf',
      stage_1_start: 'Stage 1 first day',
      stage_1_end: 'Stage 1 last day',
      stage_1_report: 'Stage 1 report',
      stage_2_end: 'Stage 2 last day',
      stage_2_report: 'Stage 2 report',
      recommendation: 'Recommendation',
      dossier_reviewed: 'Dossier reviewed on behalf',
      dossier_approved: 'Dossier review approved on behalf',
      decision: 'Decision',
    },
    items: {
      application: 'Application',
      application_review: 'Application review',
      duration: 'Audit duration',
      agreement: 'Certification agreement',
      team_approval: 'Team approval',
      stage_1_plan: 'Stage 1 plan',
      stage_1_report: 'Stage 1 report',
      stage_2_plan: 'Stage 2 plan',
      stage_2_report: 'Stage 2 report',
      participant_lists: 'Participant lists',
      findings_follow_up: 'Findings follow-up',
      recommendation: 'Team recommendation',
      certificate_data: 'Certificate data',
    },
    states: {
      present: 'present',
      missing: 'missing',
      not_applicable: 'not applicable',
      recorded: 'recorded',
      not_recorded: 'not recorded',
      not_declared: 'not declared',
      not_computable: 'not computable',
    },
    units: {
      auditorDays: 'auditor-days',
      capacity: '{calendarDays} calendar day(s) × {auditors} auditor(s)',
      version: 'version',
      revision: 'Case revision',
      finding: 'Finding',
      certificate: 'Certificate',
      exchange: 'Exchange Record',
    },
  },
  fr: {
    section: 'Cohérence du dossier',
    ruleSet: 'Jeu de règles',
    openCounts:
      'Ouvertes : {critical} critiques, {error} erreurs, {toClarify} à clarifier',
    none: 'Aucune divergence trouvée par le jeu de règles {version}.',
    manual: 'Divergence manuelle',
    rules: {
      R01: 'Durée d’audit par rapport à la demande actuelle',
      R02: 'Réduction pour certification antérieure par rapport aux certifications déclarées',
      R03: 'Jours du plan d’étape par rapport à la part de l’étape dans la durée',
      R04: 'Jours du plan d’étape par rapport aux jours calendaires et aux auditeurs sur site',
      R05: 'Ordre des dates',
      R06: 'Plan d’étape envoyé après le premier jour de l’étape',
      R07: 'Envoi du plan d’étape face au registre',
      R08: 'Élément du dossier déclaré présent sans son enregistrement',
      R09: 'Élément du dossier déclaré manquant ou sans objet alors qu’il est enregistré',
      R10: 'Enregistrement modifié après la revue du dossier',
      R11: 'Textes accordés par rapport aux données du certificat convenues',
      R13: 'Numéro du projet comparé aux certificats émis',
      R12: 'Numéros de rue et codes postaux des adresses',
      R14: 'Enregistrement fondé sur une version de document antérieure',
      R15: 'Référence sortante portée par plusieurs envois',
      R16: 'Envoi avant un délai de procédure « pas avant »',
    },
    verdicts: {
      critical: 'Critique',
      error: 'Erreur',
      to_clarify: 'À clarifier',
    },
    status: { open: 'Ouverte', resolved: 'Résolue' },
    fields: {
      verdict: 'Verdict',
      status: 'Statut',
      compared: 'Comparaison',
      firstValue: 'Première valeur',
      secondValue: 'Seconde valeur',
      opened: 'Ouverte depuis',
      blocks: 'Bloque',
      resolution: 'Résolution',
      resolvedBy: 'Résolue par',
      resolvedAt: 'Résolue le',
      reason: 'Motif',
      note: 'Note',
    },
    blocks: {
      decision: 'La décision de certification',
      certificate_draft_approval: 'Approbation du projet',
      nothing: 'Rien',
    },
    resolutions: {
      acceptance: 'Acceptée',
      justification: 'Acceptée avec la justification de l’enregistrement',
      record: 'Corrigée par une nouvelle version d’enregistrement',
      resolution: 'Corrigée',
    },
    subjects: {
      certificateNumber: 'Numéro du certificat',
      durationProposal: 'Proposition de durée',
      priorCertification: 'Réduction pour certification antérieure',
      stageShare: 'Part de l’étape dans la durée',
      stageCapacity: 'Jours-auditeur sur site',
      dateOrder: 'Ordre des dates',
      dossierItem: 'Élément du dossier',
      certificateText: 'Texte du certificat',
      addressNumbers: 'Numéros d’adresse',
      documentVersion: 'Version de document',
      planSending: 'Envoi du plan d’étape',
      exchangeReference: 'Référence sortante',
      exchangeDeadline: 'Rapport d’étape 2 remis au client',
    },
    textFields: {
      holderName: 'titulaire',
      address: 'adresse',
      scope: 'périmètre',
      language: 'langue',
    },
    dates: {
      draft_sent: 'Projet envoyé',
      client_opinion: 'Avis du client',
      agreement_signed: 'Signature du contrat',
      team_approved: 'Équipe approuvée au nom de l’organisme',
      stage_1_start: 'Premier jour de l’étape 1',
      stage_1_end: 'Dernier jour de l’étape 1',
      stage_1_report: 'Rapport de l’étape 1',
      stage_2_end: 'Dernier jour de l’étape 2',
      stage_2_report: 'Rapport de l’étape 2',
      recommendation: 'Recommandation',
      dossier_reviewed: 'Dossier revu au nom de l’organisme',
      dossier_approved: 'Revue du dossier approuvée au nom de l’organisme',
      decision: 'Décision',
    },
    items: {
      application: 'Demande',
      application_review: 'Revue de la demande',
      duration: 'Durée d’audit',
      agreement: 'Contrat de certification',
      team_approval: 'Approbation de l’équipe',
      stage_1_plan: 'Plan de l’étape 1',
      stage_1_report: 'Rapport de l’étape 1',
      stage_2_plan: 'Plan de l’étape 2',
      stage_2_report: 'Rapport de l’étape 2',
      participant_lists: 'Listes de participants',
      findings_follow_up: 'Suivi des constats',
      recommendation: 'Recommandation de l’équipe',
      certificate_data: 'Données du certificat',
    },
    states: {
      present: 'présent',
      missing: 'manquant',
      not_applicable: 'sans objet',
      recorded: 'enregistré',
      not_recorded: 'non enregistré',
      not_declared: 'non déclarée',
      not_computable: 'non calculable',
    },
    units: {
      auditorDays: 'jours-auditeur',
      capacity: '{calendarDays} jour(s) calendaire(s) × {auditors} auditeur(s)',
      version: 'version',
      revision: 'Révision du dossier',
      finding: 'Constat',
      certificate: 'Certificat',
      exchange: 'Échange',
    },
  },
  ro: {
    section: 'Coerența dosarului',
    ruleSet: 'Set de reguli',
    openCounts:
      'Deschise: {critical} critice, {error} erori, {toClarify} de clarificat',
    none: 'Nicio neconcordanță găsită de setul de reguli {version}.',
    manual: 'Neconcordanță înregistrată manual',
    rules: {
      R01: 'Durata auditului față de cererea actuală',
      R02: 'Reducerea pentru certificare anterioară față de certificările declarate',
      R03: 'Zilele planului de etapă față de cota etapei din durată',
      R04: 'Zilele planului de etapă față de zilele calendaristice și auditorii la fața locului',
      R05: 'Ordinea datelor',
      R06: 'Plan de etapă trimis după prima zi a etapei',
      R07: 'Trimiterea planului de etapă față de registru',
      R08: 'Element al dosarului declarat prezent fără înregistrarea sa',
      R09: 'Element al dosarului declarat lipsă sau neaplicabil deși este înregistrat',
      R10: 'Înregistrare modificată după analiza dosarului',
      R11: 'Textele acordate față de datele certificatului convenite',
      R13: 'Numărul proiectului față de certificatele emise',
      R12: 'Numerele de stradă și codurile poștale ale adreselor',
      R14: 'Înregistrare bazată pe o versiune anterioară a documentului',
      R15: 'Referință de ieșire purtată de mai multe trimiteri',
      R16: 'Trimitere înaintea unui termen de procedură „nu înainte de”',
    },
    verdicts: {
      critical: 'Critic',
      error: 'Eroare',
      to_clarify: 'De clarificat',
    },
    status: { open: 'Deschisă', resolved: 'Rezolvată' },
    fields: {
      verdict: 'Verdict',
      status: 'Stare',
      compared: 'Comparație',
      firstValue: 'Prima valoare',
      secondValue: 'A doua valoare',
      opened: 'Deschisă de la',
      blocks: 'Blochează',
      resolution: 'Rezolvare',
      resolvedBy: 'Rezolvată de',
      resolvedAt: 'Rezolvată la',
      reason: 'Motiv',
      note: 'Notă',
    },
    blocks: {
      decision: 'Decizia de certificare',
      certificate_draft_approval: 'Aprobarea proiectului',
      nothing: 'Nimic',
    },
    resolutions: {
      acceptance: 'Acceptată',
      justification: 'Acceptată cu justificarea înregistrării',
      record: 'Corectată printr-o nouă versiune a înregistrării',
      resolution: 'Corectată',
    },
    subjects: {
      certificateNumber: 'Numărul certificatului',
      durationProposal: 'Propunerea de durată',
      priorCertification: 'Reducerea pentru certificare anterioară',
      stageShare: 'Cota etapei din durată',
      stageCapacity: 'Zile-auditor la fața locului',
      dateOrder: 'Ordinea datelor',
      dossierItem: 'Element al dosarului',
      certificateText: 'Textul certificatului',
      addressNumbers: 'Numerele adresei',
      documentVersion: 'Versiunea documentului',
      planSending: 'Trimiterea planului de etapă',
      exchangeReference: 'Referință de ieșire',
      exchangeDeadline: 'Raportul etapei 2 transmis clientului',
    },
    textFields: {
      holderName: 'titular',
      address: 'adresă',
      scope: 'domeniu',
      language: 'limbă',
    },
    dates: {
      draft_sent: 'Proiect transmis',
      client_opinion: 'Opinia clientului',
      agreement_signed: 'Semnarea contractului',
      team_approved: 'Echipă aprobată în numele organismului',
      stage_1_start: 'Prima zi a etapei 1',
      stage_1_end: 'Ultima zi a etapei 1',
      stage_1_report: 'Raportul etapei 1',
      stage_2_end: 'Ultima zi a etapei 2',
      stage_2_report: 'Raportul etapei 2',
      recommendation: 'Recomandare',
      dossier_reviewed: 'Dosar analizat în numele organismului',
      dossier_approved: 'Analiza dosarului aprobată în numele organismului',
      decision: 'Decizie',
    },
    items: {
      application: 'Cerere',
      application_review: 'Analiza cererii',
      duration: 'Durata auditului',
      agreement: 'Contract de certificare',
      team_approval: 'Aprobarea echipei',
      stage_1_plan: 'Planul etapei 1',
      stage_1_report: 'Raportul etapei 1',
      stage_2_plan: 'Planul etapei 2',
      stage_2_report: 'Raportul etapei 2',
      participant_lists: 'Liste de participanți',
      findings_follow_up: 'Urmărirea constatărilor',
      recommendation: 'Recomandarea echipei',
      certificate_data: 'Datele certificatului',
    },
    states: {
      present: 'prezent',
      missing: 'lipsă',
      not_applicable: 'neaplicabil',
      recorded: 'înregistrat',
      not_recorded: 'neînregistrat',
      not_declared: 'nedeclarată',
      not_computable: 'necalculabil',
    },
    units: {
      auditorDays: 'zile-auditor',
      capacity: '{calendarDays} zi(le) calendaristice × {auditors} auditor(i)',
      version: 'versiunea',
      revision: 'Revizia dosarului',
      finding: 'Constatarea',
      certificate: 'Certificatul',
      exchange: 'Schimb',
    },
  },
  ru: {
    section: 'Согласованность досье',
    ruleSet: 'Набор правил',
    openCounts:
      'Открыто: критических {critical}, ошибок {error}, требуют уточнения {toClarify}',
    none: 'Набор правил {version} не нашёл расхождений.',
    manual: 'Расхождение, внесённое вручную',
    rules: {
      R01: 'Продолжительность аудита в сравнении с текущей заявкой',
      R02: 'Сокращение за предыдущую сертификацию в сравнении с заявленными сертификатами',
      R03: 'Дни плана этапа в сравнении с долей этапа в продолжительности',
      R04: 'Дни плана этапа в сравнении с календарными днями и аудиторами на месте',
      R05: 'Порядок дат',
      R06: 'План этапа отправлен после первого дня этапа',
      R07: 'Отправка плана этапа в сравнении с реестром',
      R08: 'Элемент досье отмечен как имеющийся, но запись отсутствует',
      R09: 'Элемент досье отмечен как отсутствующий или неприменимый, хотя запись есть',
      R10: 'Запись изменена после анализа досье',
      R11: 'Предоставленные тексты в сравнении с согласованными данными сертификата',
      R13: 'Номер проекта в сравнении с выданными сертификатами',
      R12: 'Номера домов и почтовые индексы в адресах',
      R14: 'Запись основана на более ранней версии документа',
      R15: 'Исходящий номер у нескольких отправок',
      R16: 'Отправка до процедурного срока «не ранее»',
    },
    verdicts: {
      critical: 'Критическое',
      error: 'Ошибка',
      to_clarify: 'Требует уточнения',
    },
    status: { open: 'Открыто', resolved: 'Разрешено' },
    fields: {
      verdict: 'Вердикт',
      status: 'Состояние',
      compared: 'Сравнение',
      firstValue: 'Первое значение',
      secondValue: 'Второе значение',
      opened: 'Открыто с',
      blocks: 'Блокирует',
      resolution: 'Разрешение',
      resolvedBy: 'Разрешил(а)',
      resolvedAt: 'Разрешено',
      reason: 'Причина',
      note: 'Примечание',
    },
    blocks: {
      decision: 'Решение о сертификации',
      certificate_draft_approval: 'Утверждение проекта',
      nothing: 'Ничего',
    },
    resolutions: {
      acceptance: 'Принято',
      justification: 'Принято с обоснованием записи',
      record: 'Исправлено новой версией записи',
      resolution: 'Исправлено',
    },
    subjects: {
      certificateNumber: 'Номер сертификата',
      durationProposal: 'Предложение продолжительности',
      priorCertification: 'Сокращение за предыдущую сертификацию',
      stageShare: 'Доля этапа в продолжительности',
      stageCapacity: 'Аудиторо-дни на месте',
      dateOrder: 'Порядок дат',
      dossierItem: 'Элемент досье',
      certificateText: 'Текст сертификата',
      addressNumbers: 'Номера в адресе',
      documentVersion: 'Версия документа',
      planSending: 'Отправка плана этапа',
      exchangeReference: 'Исходящий номер',
      exchangeDeadline: 'Отчёт этапа 2 передан клиенту',
    },
    textFields: {
      holderName: 'держатель',
      address: 'адрес',
      scope: 'область',
      language: 'язык',
    },
    dates: {
      draft_sent: 'Проект отправлен',
      client_opinion: 'Мнение клиента',
      agreement_signed: 'Подписание договора',
      team_approved: 'Группа утверждена от имени органа',
      stage_1_start: 'Первый день этапа 1',
      stage_1_end: 'Последний день этапа 1',
      stage_1_report: 'Отчёт этапа 1',
      stage_2_end: 'Последний день этапа 2',
      stage_2_report: 'Отчёт этапа 2',
      recommendation: 'Рекомендация',
      dossier_reviewed: 'Досье проанализировано от имени органа',
      dossier_approved: 'Анализ досье утверждён от имени органа',
      decision: 'Решение',
    },
    items: {
      application: 'Заявка',
      application_review: 'Анализ заявки',
      duration: 'Продолжительность аудита',
      agreement: 'Договор о сертификации',
      team_approval: 'Утверждение группы',
      stage_1_plan: 'План этапа 1',
      stage_1_report: 'Отчёт этапа 1',
      stage_2_plan: 'План этапа 2',
      stage_2_report: 'Отчёт этапа 2',
      participant_lists: 'Списки участников',
      findings_follow_up: 'Работа по выводам',
      recommendation: 'Рекомендация группы',
      certificate_data: 'Данные сертификата',
    },
    states: {
      present: 'имеется',
      missing: 'отсутствует',
      not_applicable: 'неприменимо',
      recorded: 'записано',
      not_recorded: 'не записано',
      not_declared: 'не заявлено',
      not_computable: 'не вычисляется',
    },
    units: {
      auditorDays: 'аудиторо-дней',
      capacity: '{calendarDays} календ. дн. × {auditors} аудитор(ов)',
      version: 'версия',
      revision: 'Ревизия досье',
      finding: 'Вывод',
      certificate: 'Сертификат',
      exchange: 'Запись обмена',
    },
  },
};
