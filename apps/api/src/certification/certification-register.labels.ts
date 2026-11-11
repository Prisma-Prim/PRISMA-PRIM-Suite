import type { CERTIFICATION_STEPS } from '../database/schema/certification.js';
import type {
  FindingClassification,
  FindingRecordKind,
} from './certification-findings.js';
import type { AuditStage } from './certification-stages.js';
import type { TeamRole } from './certification-team.js';
import type {
  CertificationCaseSummary,
  CertificationDocumentRole,
} from './certification.types.js';

/** The languages the dossier register is generated in. */
export const REGISTER_LANGUAGES = ['en', 'fr', 'ro', 'ru'] as const;
export type RegisterLanguage = (typeof REGISTER_LANGUAGES)[number];

type CertificationStep = (typeof CERTIFICATION_STEPS)[number];

/** Every fixed text of the register; texts entered by users are never translated. */
export interface RegisterLabels {
  title: string;
  notice: string;
  page: string;
  sections: { case: string; history: string; documents: string };
  noDocuments: string;
  steps: Record<CertificationStep, string>;
  unrecognizedStep: string;
  finding: string;
  findingRecords: Record<FindingRecordKind, string>;
  certificate: string;
  version: string;
  fields: {
    caseId: string;
    orderReference: string;
    status: string;
    standard: string;
    auditType: string;
    clientLegalEntity: string;
    revision: string;
    openedAt: string;
    revisedAt: string;
    recordedAt: string;
    recordedBy: string;
    reason: string;
    submittedOn: string;
    declaredLegalName: string;
    foodChainCategories: string;
    effectiveFte: string;
    haccpStudies: string;
    outcome: string;
    rejectionReason: string;
    onBehalf: string;
    initialAuditDays: string;
    stage1Days: string;
    stage2Days: string;
    ruleVersion: string;
    signedOn: string;
    members: string;
    teamVersion: string;
    returnReason: string;
    dates: string;
    onSiteDays: string;
    reportDate: string;
    conclusion: string;
    recommendation: string;
    recommendedOn: string;
    reviewedBy: string;
    approvedBy: string;
    decision: string;
    decidedOn: string;
    decidedBy: string;
    agreedOn: string;
    languages: string;
    clause: string;
    area: string;
    classification: string;
    receivedOn: string;
    verifiedOn: string;
    certificateNumber: string;
    validity: string;
  };
  columns: {
    role: string;
    document: string;
    versionId: string;
    sha256: string;
  };
  values: {
    status: Record<CertificationCaseSummary['status'], string>;
    auditType: Record<CertificationCaseSummary['auditType'], string>;
    reviewOutcome: Record<'accepted' | 'rejected', string>;
    teamDecision: Record<'approved' | 'returned', string>;
    teamRole: Record<TeamRole, string>;
    stage1Conclusion: Record<'ready' | 'not_ready', string>;
    recommendation: Record<
      'grant' | 'do_not_grant' | 'additional_audit',
      string
    >;
    decision: Record<'granted' | 'refused', string>;
    classification: Record<FindingClassification, string>;
    planJudgment: Record<'adequate' | 'inadequate', string>;
    verification: Record<'effective' | 'not_effective', string>;
    stage: Record<AuditStage, string>;
    documentRole: Record<CertificationDocumentRole, string>;
  };
}

const STANDARD_LABELS = { iso_22000_2018: 'ISO 22000:2018' } as const;

/** Standard Editions keep their published designation in every language. */
export function standardLabel(
  standard: CertificationCaseSummary['standard'],
): string {
  return STANDARD_LABELS[standard];
}

export const REGISTER_LABELS: Record<RegisterLanguage, RegisterLabels> = {
  en: {
    title: 'Dossier register',
    notice:
      'Generated dossier register, not an official certification body form. It accompanies the signed originals and replaces none of them.',
    page: 'Page',
    sections: {
      case: 'Certification Case',
      history: 'Recorded versions',
      documents: 'Referenced Document Versions',
    },
    noDocuments: 'No document is referenced.',
    steps: {
      application: 'Application',
      application_review: 'Application review',
      duration: 'Audit duration',
      agreement: 'Certification agreement',
      team: 'Audit team',
      team_decision: 'Team decision',
      stage_1_plan: 'Stage 1 plan',
      stage_1_report: 'Stage 1 report',
      stage_2_plan: 'Stage 2 plan',
      stage_2_report: 'Stage 2 report',
      recommendation: 'Team recommendation',
      dossier_review: 'Dossier review',
      decision: 'Certification Decision',
      certificate_data: 'Certificate data',
    },
    unrecognizedStep: 'Recorded step',
    finding: 'Finding',
    findingRecords: {
      statement: 'Statement',
      classification: 'Classification',
      response: 'Client response',
      plan_judgment: 'Action plan judgment',
      verification: 'Verification',
    },
    certificate: 'Certificate',
    version: 'version',
    fields: {
      caseId: 'Case identifier',
      orderReference: 'Order reference',
      status: 'Status',
      standard: 'Standard',
      auditType: 'Audit type',
      clientLegalEntity: 'Client legal entity',
      revision: 'Case revision',
      openedAt: 'Opened at',
      revisedAt: 'Revision reached at',
      recordedAt: 'Recorded at',
      recordedBy: 'Recorded by',
      reason: 'Correction reason',
      submittedOn: 'Application dated',
      declaredLegalName: 'Declared legal name',
      foodChainCategories: 'Food chain categories',
      effectiveFte: 'Effective FTE',
      haccpStudies: 'HACCP studies',
      outcome: 'Outcome',
      rejectionReason: 'Rejection reason',
      onBehalf: 'Act on behalf of the certification body',
      initialAuditDays: 'Initial audit (auditor-days)',
      stage1Days: 'Stage 1 on site (auditor-days)',
      stage2Days: 'Stage 2 on site (auditor-days)',
      ruleVersion: 'Duration rule',
      signedOn: 'Signed on',
      members: 'Members',
      teamVersion: 'Team version',
      returnReason: 'Return reason',
      dates: 'Dates',
      onSiteDays: 'On-site days',
      reportDate: 'Report date',
      conclusion: 'Conclusion',
      recommendation: 'Recommendation',
      recommendedOn: 'Recommended on',
      reviewedBy: 'Reviewed by',
      approvedBy: 'Approved by',
      decision: 'Decision',
      decidedOn: 'Decided on',
      decidedBy: 'Decided by',
      agreedOn: 'Agreed on',
      languages: 'Languages',
      clause: 'Clause',
      area: 'Process or area',
      classification: 'Classification',
      receivedOn: 'Received on',
      verifiedOn: 'Verified on',
      certificateNumber: 'Certificate number',
      validity: 'Validity',
    },
    columns: {
      role: 'Role',
      document: 'Document',
      versionId: 'Document Version',
      sha256: 'SHA-256',
    },
    values: {
      status: {
        open: 'Open',
        rejected: 'Application rejected',
        refused: 'Certification refused',
        certified: 'Certified',
      },
      auditType: { initial_certification: 'Initial certification' },
      reviewOutcome: { accepted: 'Accepted', rejected: 'Rejected' },
      teamDecision: { approved: 'Approved', returned: 'Returned' },
      teamRole: {
        team_leader: 'Team leader',
        auditor: 'Auditor',
        technical_expert: 'Technical expert',
        observer: 'Observer',
      },
      stage1Conclusion: { ready: 'Ready for Stage 2', not_ready: 'Not ready' },
      recommendation: {
        grant: 'Grant',
        do_not_grant: 'Do not grant',
        additional_audit: 'Additional audit needed',
      },
      decision: { granted: 'Granted', refused: 'Refused' },
      classification: {
        major_nonconformity: 'Major nonconformity',
        minor_nonconformity: 'Minor nonconformity',
        opportunity_for_improvement: 'Opportunity for improvement',
        area_of_concern: 'Area of concern',
      },
      planJudgment: { adequate: 'Adequate', inadequate: 'Inadequate' },
      verification: { effective: 'Effective', not_effective: 'Not effective' },
      stage: { stage_1: 'Stage 1', stage_2: 'Stage 2' },
      documentRole: {
        questionnaire: 'Questionnaire',
        iso22000_annex: 'ISO 22000 annex',
        agreement: 'Agreement',
        plan: 'Audit plan',
        participant_list: 'Participant list',
        report: 'Audit report',
        evidence: 'Evidence',
        certificate: 'Certificate',
        certificate_data: 'Certificate data',
        decision_form: 'Decision form',
        other: 'Other',
      },
    },
  },
  fr: {
    title: 'Registre du dossier',
    notice:
      'Registre du dossier généré, qui n’est pas un formulaire officiel de l’organisme de certification. Il accompagne les originaux signés et n’en remplace aucun.',
    page: 'Page',
    sections: {
      case: 'Dossier de certification',
      history: 'Versions enregistrées',
      documents: 'Versions de documents référencées',
    },
    noDocuments: 'Aucun document n’est référencé.',
    steps: {
      application: 'Demande',
      application_review: 'Revue de la demande',
      duration: 'Durée d’audit',
      agreement: 'Contrat de certification',
      team: 'Équipe d’audit',
      team_decision: 'Décision sur l’équipe',
      stage_1_plan: 'Plan de l’étape 1',
      stage_1_report: 'Rapport de l’étape 1',
      stage_2_plan: 'Plan de l’étape 2',
      stage_2_report: 'Rapport de l’étape 2',
      recommendation: 'Recommandation de l’équipe',
      dossier_review: 'Revue du dossier',
      decision: 'Décision de certification',
      certificate_data: 'Données du certificat',
    },
    unrecognizedStep: 'Étape enregistrée',
    finding: 'Constat',
    findingRecords: {
      statement: 'Énoncé',
      classification: 'Classement',
      response: 'Réponse du client',
      plan_judgment: 'Appréciation du plan d’actions',
      verification: 'Vérification',
    },
    certificate: 'Certificat',
    version: 'version',
    fields: {
      caseId: 'Identifiant du dossier',
      orderReference: 'Référence de commande',
      status: 'Statut',
      standard: 'Norme',
      auditType: 'Type d’audit',
      clientLegalEntity: 'Entité juridique cliente',
      revision: 'Révision du dossier',
      openedAt: 'Ouvert le',
      revisedAt: 'Révision atteinte le',
      recordedAt: 'Enregistré le',
      recordedBy: 'Enregistré par',
      reason: 'Motif de la correction',
      submittedOn: 'Demande datée du',
      declaredLegalName: 'Raison sociale déclarée',
      foodChainCategories: 'Catégories de la chaîne alimentaire',
      effectiveFte: 'ETP effectifs',
      haccpStudies: 'Études HACCP',
      outcome: 'Résultat',
      rejectionReason: 'Motif du rejet',
      onBehalf: 'Acte au nom de l’organisme de certification',
      initialAuditDays: 'Audit initial (jours-auditeur)',
      stage1Days: 'Étape 1 sur site (jours-auditeur)',
      stage2Days: 'Étape 2 sur site (jours-auditeur)',
      ruleVersion: 'Règle de durée',
      signedOn: 'Signé le',
      members: 'Membres',
      teamVersion: 'Version de l’équipe',
      returnReason: 'Motif du renvoi',
      dates: 'Dates',
      onSiteDays: 'Jours sur site',
      reportDate: 'Date du rapport',
      conclusion: 'Conclusion',
      recommendation: 'Recommandation',
      recommendedOn: 'Recommandé le',
      reviewedBy: 'Revu par',
      approvedBy: 'Approuvé par',
      decision: 'Décision',
      decidedOn: 'Décidé le',
      decidedBy: 'Décidé par',
      agreedOn: 'Convenu le',
      languages: 'Langues',
      clause: 'Exigence',
      area: 'Processus ou secteur',
      classification: 'Classement',
      receivedOn: 'Reçu le',
      verifiedOn: 'Vérifié le',
      certificateNumber: 'Numéro du certificat',
      validity: 'Validité',
    },
    columns: {
      role: 'Rôle',
      document: 'Document',
      versionId: 'Version du document',
      sha256: 'SHA-256',
    },
    values: {
      status: {
        open: 'Ouvert',
        rejected: 'Demande rejetée',
        refused: 'Certification refusée',
        certified: 'Certifié',
      },
      auditType: { initial_certification: 'Certification initiale' },
      reviewOutcome: { accepted: 'Acceptée', rejected: 'Rejetée' },
      teamDecision: { approved: 'Approuvée', returned: 'Renvoyée' },
      teamRole: {
        team_leader: 'Responsable d’équipe',
        auditor: 'Auditeur',
        technical_expert: 'Expert technique',
        observer: 'Observateur',
      },
      stage1Conclusion: {
        ready: 'Prêt pour l’étape 2',
        not_ready: 'Pas prêt',
      },
      recommendation: {
        grant: 'Accorder',
        do_not_grant: 'Ne pas accorder',
        additional_audit: 'Audit complémentaire nécessaire',
      },
      decision: { granted: 'Accordée', refused: 'Refusée' },
      classification: {
        major_nonconformity: 'Non-conformité majeure',
        minor_nonconformity: 'Non-conformité mineure',
        opportunity_for_improvement: 'Piste d’amélioration',
        area_of_concern: 'Point de vigilance',
      },
      planJudgment: { adequate: 'Adéquat', inadequate: 'Inadéquat' },
      verification: { effective: 'Efficace', not_effective: 'Non efficace' },
      stage: { stage_1: 'Étape 1', stage_2: 'Étape 2' },
      documentRole: {
        questionnaire: 'Questionnaire',
        iso22000_annex: 'Annexe ISO 22000',
        agreement: 'Contrat',
        plan: 'Plan d’audit',
        participant_list: 'Liste des participants',
        report: 'Rapport d’audit',
        evidence: 'Preuve',
        certificate: 'Certificat',
        certificate_data: 'Données du certificat',
        decision_form: 'Formulaire de décision',
        other: 'Autre',
      },
    },
  },
  ro: {
    title: 'Registrul dosarului',
    notice:
      'Registru generat al dosarului, nu un formular oficial al organismului de certificare. Însoțește originalele semnate și nu înlocuiește niciunul dintre ele.',
    page: 'Pagina',
    sections: {
      case: 'Dosarul de certificare',
      history: 'Versiuni înregistrate',
      documents: 'Versiuni de documente referite',
    },
    noDocuments: 'Niciun document nu este referit.',
    steps: {
      application: 'Cerere',
      application_review: 'Analiza cererii',
      duration: 'Durata auditului',
      agreement: 'Contractul de certificare',
      team: 'Echipa de audit',
      team_decision: 'Decizia privind echipa',
      stage_1_plan: 'Planul etapei 1',
      stage_1_report: 'Raportul etapei 1',
      stage_2_plan: 'Planul etapei 2',
      stage_2_report: 'Raportul etapei 2',
      recommendation: 'Recomandarea echipei',
      dossier_review: 'Analiza dosarului',
      decision: 'Decizia de certificare',
      certificate_data: 'Datele certificatului',
    },
    unrecognizedStep: 'Etapă înregistrată',
    finding: 'Constatare',
    findingRecords: {
      statement: 'Enunț',
      classification: 'Clasificare',
      response: 'Răspunsul clientului',
      plan_judgment: 'Evaluarea planului de acțiuni',
      verification: 'Verificare',
    },
    certificate: 'Certificat',
    version: 'versiunea',
    fields: {
      caseId: 'Identificatorul dosarului',
      orderReference: 'Referința comenzii',
      status: 'Stare',
      standard: 'Standard',
      auditType: 'Tipul auditului',
      clientLegalEntity: 'Entitatea juridică a clientului',
      revision: 'Revizia dosarului',
      openedAt: 'Deschis la',
      revisedAt: 'Revizie atinsă la',
      recordedAt: 'Înregistrat la',
      recordedBy: 'Înregistrat de',
      reason: 'Motivul corecției',
      submittedOn: 'Cerere datată',
      declaredLegalName: 'Denumirea juridică declarată',
      foodChainCategories: 'Categoriile lanțului alimentar',
      effectiveFte: 'Personal efectiv (ENI)',
      haccpStudies: 'Studii HACCP',
      outcome: 'Rezultat',
      rejectionReason: 'Motivul respingerii',
      onBehalf: 'Act în numele organismului de certificare',
      initialAuditDays: 'Audit inițial (zile-auditor)',
      stage1Days: 'Etapa 1 la fața locului (zile-auditor)',
      stage2Days: 'Etapa 2 la fața locului (zile-auditor)',
      ruleVersion: 'Regula de durată',
      signedOn: 'Semnat la',
      members: 'Membri',
      teamVersion: 'Versiunea echipei',
      returnReason: 'Motivul returnării',
      dates: 'Date',
      onSiteDays: 'Zile la fața locului',
      reportDate: 'Data raportului',
      conclusion: 'Concluzie',
      recommendation: 'Recomandare',
      recommendedOn: 'Recomandat la',
      reviewedBy: 'Analizat de',
      approvedBy: 'Aprobat de',
      decision: 'Decizie',
      decidedOn: 'Decis la',
      decidedBy: 'Decis de',
      agreedOn: 'Convenit la',
      languages: 'Limbi',
      clause: 'Cerință',
      area: 'Proces sau zonă',
      classification: 'Clasificare',
      receivedOn: 'Primit la',
      verifiedOn: 'Verificat la',
      certificateNumber: 'Numărul certificatului',
      validity: 'Valabilitate',
    },
    columns: {
      role: 'Rol',
      document: 'Document',
      versionId: 'Versiunea documentului',
      sha256: 'SHA-256',
    },
    values: {
      status: {
        open: 'Deschis',
        rejected: 'Cerere respinsă',
        refused: 'Certificare refuzată',
        certified: 'Certificat',
      },
      auditType: { initial_certification: 'Certificare inițială' },
      reviewOutcome: { accepted: 'Acceptată', rejected: 'Respinsă' },
      teamDecision: { approved: 'Aprobată', returned: 'Returnată' },
      teamRole: {
        team_leader: 'Conducătorul echipei',
        auditor: 'Auditor',
        technical_expert: 'Expert tehnic',
        observer: 'Observator',
      },
      stage1Conclusion: {
        ready: 'Pregătit pentru etapa 2',
        not_ready: 'Nepregătit',
      },
      recommendation: {
        grant: 'Acordare',
        do_not_grant: 'Neacordare',
        additional_audit: 'Este necesar un audit suplimentar',
      },
      decision: { granted: 'Acordată', refused: 'Refuzată' },
      classification: {
        major_nonconformity: 'Neconformitate majoră',
        minor_nonconformity: 'Neconformitate minoră',
        opportunity_for_improvement: 'Oportunitate de îmbunătățire',
        area_of_concern: 'Aspect de atenționare',
      },
      planJudgment: { adequate: 'Adecvat', inadequate: 'Inadecvat' },
      verification: { effective: 'Eficace', not_effective: 'Ineficace' },
      stage: { stage_1: 'Etapa 1', stage_2: 'Etapa 2' },
      documentRole: {
        questionnaire: 'Chestionar',
        iso22000_annex: 'Anexă ISO 22000',
        agreement: 'Contract',
        plan: 'Plan de audit',
        participant_list: 'Lista participanților',
        report: 'Raport de audit',
        evidence: 'Dovadă',
        certificate: 'Certificat',
        certificate_data: 'Datele certificatului',
        decision_form: 'Formular de decizie',
        other: 'Altul',
      },
    },
  },
  ru: {
    title: 'Реестр досье',
    notice:
      'Сформированный реестр досье, не являющийся официальной формой органа по сертификации. Он сопровождает подписанные оригиналы и не заменяет ни один из них.',
    page: 'Страница',
    sections: {
      case: 'Дело по сертификации',
      history: 'Записанные версии',
      documents: 'Указанные версии документов',
    },
    noDocuments: 'Документы не указаны.',
    steps: {
      application: 'Заявка',
      application_review: 'Анализ заявки',
      duration: 'Продолжительность аудита',
      agreement: 'Договор о сертификации',
      team: 'Аудиторская группа',
      team_decision: 'Решение по группе',
      stage_1_plan: 'План этапа 1',
      stage_1_report: 'Отчёт этапа 1',
      stage_2_plan: 'План этапа 2',
      stage_2_report: 'Отчёт этапа 2',
      recommendation: 'Рекомендация группы',
      dossier_review: 'Анализ досье',
      decision: 'Решение о сертификации',
      certificate_data: 'Данные сертификата',
    },
    unrecognizedStep: 'Записанный шаг',
    finding: 'Наблюдение',
    findingRecords: {
      statement: 'Формулировка',
      classification: 'Классификация',
      response: 'Ответ клиента',
      plan_judgment: 'Оценка плана действий',
      verification: 'Проверка',
    },
    certificate: 'Сертификат',
    version: 'версия',
    fields: {
      caseId: 'Идентификатор дела',
      orderReference: 'Номер заказа',
      status: 'Статус',
      standard: 'Стандарт',
      auditType: 'Тип аудита',
      clientLegalEntity: 'Юридическое лицо клиента',
      revision: 'Редакция дела',
      openedAt: 'Открыто',
      revisedAt: 'Редакция достигнута',
      recordedAt: 'Записано',
      recordedBy: 'Записал(а)',
      reason: 'Причина исправления',
      submittedOn: 'Дата заявки',
      declaredLegalName: 'Заявленное наименование',
      foodChainCategories: 'Категории пищевой цепи',
      effectiveFte: 'Эффективная численность (ЭПЗ)',
      haccpStudies: 'Исследования ХАССП',
      outcome: 'Результат',
      rejectionReason: 'Причина отклонения',
      onBehalf: 'Действие от имени органа по сертификации',
      initialAuditDays: 'Первичный аудит (человеко-дни)',
      stage1Days: 'Этап 1 на месте (человеко-дни)',
      stage2Days: 'Этап 2 на месте (человеко-дни)',
      ruleVersion: 'Правило расчёта продолжительности',
      signedOn: 'Подписано',
      members: 'Члены',
      teamVersion: 'Версия группы',
      returnReason: 'Причина возврата',
      dates: 'Даты',
      onSiteDays: 'Дни на месте',
      reportDate: 'Дата отчёта',
      conclusion: 'Заключение',
      recommendation: 'Рекомендация',
      recommendedOn: 'Дата рекомендации',
      reviewedBy: 'Проанализировал(а)',
      approvedBy: 'Утвердил(а)',
      decision: 'Решение',
      decidedOn: 'Дата решения',
      decidedBy: 'Принял(а) решение',
      agreedOn: 'Дата согласования',
      languages: 'Языки',
      clause: 'Требование',
      area: 'Процесс или участок',
      classification: 'Классификация',
      receivedOn: 'Получено',
      verifiedOn: 'Проверено',
      certificateNumber: 'Номер сертификата',
      validity: 'Срок действия',
    },
    columns: {
      role: 'Роль',
      document: 'Документ',
      versionId: 'Версия документа',
      sha256: 'SHA-256',
    },
    values: {
      status: {
        open: 'Открыто',
        rejected: 'Заявка отклонена',
        refused: 'В сертификации отказано',
        certified: 'Сертифицировано',
      },
      auditType: { initial_certification: 'Первичная сертификация' },
      reviewOutcome: { accepted: 'Принята', rejected: 'Отклонена' },
      teamDecision: { approved: 'Утверждена', returned: 'Возвращена' },
      teamRole: {
        team_leader: 'Руководитель группы',
        auditor: 'Аудитор',
        technical_expert: 'Технический эксперт',
        observer: 'Наблюдатель',
      },
      stage1Conclusion: {
        ready: 'Готово к этапу 2',
        not_ready: 'Не готово',
      },
      recommendation: {
        grant: 'Выдать',
        do_not_grant: 'Не выдавать',
        additional_audit: 'Требуется дополнительный аудит',
      },
      decision: { granted: 'Выдан', refused: 'Отказано' },
      classification: {
        major_nonconformity: 'Значительное несоответствие',
        minor_nonconformity: 'Незначительное несоответствие',
        opportunity_for_improvement: 'Возможность для улучшения',
        area_of_concern: 'Область внимания',
      },
      planJudgment: { adequate: 'Адекватен', inadequate: 'Неадекватен' },
      verification: {
        effective: 'Результативно',
        not_effective: 'Нерезультативно',
      },
      stage: { stage_1: 'Этап 1', stage_2: 'Этап 2' },
      documentRole: {
        questionnaire: 'Анкета',
        iso22000_annex: 'Приложение ISO 22000',
        agreement: 'Договор',
        plan: 'План аудита',
        participant_list: 'Список участников',
        report: 'Отчёт об аудите',
        evidence: 'Свидетельство',
        certificate: 'Сертификат',
        certificate_data: 'Данные сертификата',
        decision_form: 'Форма решения',
        other: 'Другое',
      },
    },
  },
};
