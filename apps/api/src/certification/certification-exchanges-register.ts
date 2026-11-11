import type {
  DeadlineEntry,
  DeadlineKind,
  DeadlineState,
  ExchangeChannel,
  ExchangeCounterpartKind,
  ExchangeDirection,
  ExchangeItemKind,
  ExchangeRecordVersion,
  ExchangeRegister,
} from './certification-exchanges.js';
import type {
  ReverificationItemView,
  ReverificationSection,
} from './certification-reverification.js';
import {
  REGISTER_LABELS,
  type RegisterLanguage,
} from './certification-register.labels.js';
import type { CertificationAttachment } from './certification.types.js';

/** A laid-out register block, as `certification-register.ts` renders it. */
export type ExchangeRegisterBlock =
  | { kind: 'section'; text: string }
  | {
      kind: 'entry';
      title: string | null;
      fields: { label: string; value: string }[];
    }
  | { kind: 'paragraph'; text: string };

interface ExchangeLabels {
  section: string;
  reverificationSection: string;
  set: string;
  noSet: string;
  none: string;
  noItems: string;
  surveillance: string;
  noSurveillance: string;
  exchange: string;
  item: string;
  automatic: string;
  version: string;
  deadlines: Record<DeadlineKind, string>;
  states: Record<DeadlineState, string> & { awaiting: string };
  directions: Record<ExchangeDirection, string>;
  itemKinds: Record<ExchangeItemKind, string>;
  counterparts: Record<ExchangeCounterpartKind, string>;
  channels: Record<ExchangeChannel, string>;
  origins: { automatic: string; manual: string; discrepancy: string };
  status: { open: string; withdrawn: string };
  fields: {
    anchor: string;
    due: string;
    record: string;
    date: string;
    counterpart: string;
    channel: string;
    reference: string;
    documents: string;
    note: string;
    recorded: string;
    values: string;
    reason: string;
    origin: string;
    text: string;
    source: string;
    status: string;
    withdrawal: string;
  };
  sources: {
    finding: string;
    discrepancy: string;
    exchange: string;
    attachment: string;
  };
}

const LABELS: Record<RegisterLanguage, ExchangeLabels> = {
  en: {
    section: 'Exchanges and deadlines',
    reverificationSection: 'Re-verification Items',
    set: 'Procedure deadline set, version {version}, configured by {by} at {at}',
    noSet: 'No procedure deadline configured.',
    none: 'No exchange recorded.',
    noItems: 'Nothing to re-verify.',
    surveillance: 'Latest start of the first surveillance: {date}',
    noSurveillance:
      'The latest start of the first surveillance is set with the Certificate.',
    exchange: 'Exchange Record',
    item: 'Re-verification Item',
    automatic: 'Automatic Re-verification Item',
    version: 'version',
    deadlines: {
      stage_plan_sent: 'Stage plan sent to the client',
      audit_dossier_transmitted:
        'Audit dossier transmitted to the certification body',
      stage_2_report_released: 'Stage 2 report released to the client',
    },
    states: {
      due: 'Due',
      met: 'Met',
      met_late: 'Met late',
      overdue: 'Overdue',
      sent_too_early: 'Sent too early',
      awaiting: 'Awaiting its anchor',
    },
    directions: { received: 'Received', sent: 'Sent' },
    itemKinds: {
      application: 'Application',
      agreement: 'Agreement',
      team_notice: 'Team notice',
      stage_plan: 'Stage plan',
      stage_report: 'Stage report',
      participant_list: 'Participant list',
      nonconformity_response: 'Nonconformity response',
      client_data_confirmation: 'Client data confirmation',
      audit_dossier: 'Audit dossier',
      certificate_data_form: 'Certificate data form',
      certificate_draft: 'Certificate draft',
      client_opinion: 'Client opinion',
      decision_form: 'Decision form',
      certificate: 'Certificate',
      other: 'Other',
    },
    counterparts: {
      client: 'Client',
      certification_body: 'Certification body',
      audit_team_member: 'Audit team member',
      other: 'Other',
    },
    channels: {
      email: 'E-mail',
      platform: 'Platform',
      courier: 'Courier',
      hand_delivery: 'Hand delivery',
      other: 'Other',
    },
    origins: {
      automatic: 'Minor nonconformity with an adequate plan',
      manual: 'Added by a member',
      discrepancy: 'Accepted Discrepancy',
    },
    status: { open: 'Open', withdrawn: 'Withdrawn' },
    fields: {
      anchor: 'Anchor',
      due: 'Due date',
      record: 'Exchange Record',
      date: 'Date',
      counterpart: 'Counterpart',
      channel: 'Channel',
      reference: 'Reference',
      documents: 'Documents',
      note: 'Note',
      recorded: 'Recorded',
      values: 'Recorded values',
      reason: 'Reason',
      origin: 'Origin',
      text: 'To verify',
      source: 'Source',
      status: 'Status',
      withdrawal: 'Withdrawn',
    },
    sources: {
      finding: 'Finding',
      discrepancy: 'Discrepancy',
      exchange: 'Exchange Record',
      attachment: 'Document',
    },
  },
  fr: {
    section: 'Échanges et délais',
    reverificationSection: 'Points à revérifier',
    set: 'Délais de procédure, version {version}, configurés par {by} le {at}',
    noSet: 'Aucun délai de procédure configuré.',
    none: 'Aucun échange enregistré.',
    noItems: 'Rien à revérifier.',
    surveillance: 'Début au plus tard de la première surveillance : {date}',
    noSurveillance:
      'Le début au plus tard de la première surveillance est fixé avec le certificat.',
    exchange: 'Échange',
    item: 'Point à revérifier',
    automatic: 'Point à revérifier automatique',
    version: 'version',
    deadlines: {
      stage_plan_sent: 'Plan d’étape envoyé au client',
      audit_dossier_transmitted:
        'Dossier d’audit transmis à l’organisme de certification',
      stage_2_report_released: 'Rapport d’étape 2 remis au client',
    },
    states: {
      due: 'À échoir',
      met: 'Respecté',
      met_late: 'Respecté en retard',
      overdue: 'Dépassé',
      sent_too_early: 'Envoyé trop tôt',
      awaiting: 'En attente de son point de départ',
    },
    directions: { received: 'Reçu', sent: 'Envoyé' },
    itemKinds: {
      application: 'Demande',
      agreement: 'Contrat',
      team_notice: 'Notification de l’équipe',
      stage_plan: 'Plan d’étape',
      stage_report: 'Rapport d’étape',
      participant_list: 'Liste des participants',
      nonconformity_response: 'Réponse aux non-conformités',
      client_data_confirmation: 'Confirmation des données du client',
      audit_dossier: 'Dossier d’audit',
      certificate_data_form: 'Formulaire des données du certificat',
      certificate_draft: 'Projet de certificat',
      client_opinion: 'Avis du client',
      decision_form: 'Formulaire de décision',
      certificate: 'Certificat',
      other: 'Autre',
    },
    counterparts: {
      client: 'Client',
      certification_body: 'Organisme de certification',
      audit_team_member: 'Membre de l’équipe d’audit',
      other: 'Autre',
    },
    channels: {
      email: 'Courriel',
      platform: 'Plateforme',
      courier: 'Coursier',
      hand_delivery: 'Remise en main propre',
      other: 'Autre',
    },
    origins: {
      automatic: 'Non-conformité mineure avec un plan adéquat',
      manual: 'Ajouté par un membre',
      discrepancy: 'Divergence acceptée',
    },
    status: { open: 'Ouvert', withdrawn: 'Retiré' },
    fields: {
      anchor: 'Point de départ',
      due: 'Échéance',
      record: 'Échange',
      date: 'Date',
      counterpart: 'Interlocuteur',
      channel: 'Canal',
      reference: 'Référence',
      documents: 'Documents',
      note: 'Note',
      recorded: 'Enregistré',
      values: 'Valeurs enregistrées',
      reason: 'Motif',
      origin: 'Origine',
      text: 'À vérifier',
      source: 'Source',
      status: 'Statut',
      withdrawal: 'Retiré',
    },
    sources: {
      finding: 'Constat',
      discrepancy: 'Divergence',
      exchange: 'Échange',
      attachment: 'Document',
    },
  },
  ro: {
    section: 'Schimburi și termene',
    reverificationSection: 'Elemente de reverificat',
    set: 'Termene de procedură, versiunea {version}, configurate de {by} la {at}',
    noSet: 'Niciun termen de procedură configurat.',
    none: 'Niciun schimb înregistrat.',
    noItems: 'Nimic de reverificat.',
    surveillance: 'Începerea cel târziu a primei supravegheri: {date}',
    noSurveillance:
      'Începerea cel târziu a primei supravegheri se stabilește odată cu certificatul.',
    exchange: 'Schimb',
    item: 'Element de reverificat',
    automatic: 'Element de reverificat automat',
    version: 'versiunea',
    deadlines: {
      stage_plan_sent: 'Planul de etapă trimis clientului',
      audit_dossier_transmitted:
        'Dosarul de audit transmis organismului de certificare',
      stage_2_report_released: 'Raportul etapei 2 transmis clientului',
    },
    states: {
      due: 'În termen',
      met: 'Respectat',
      met_late: 'Respectat cu întârziere',
      overdue: 'Depășit',
      sent_too_early: 'Trimis prea devreme',
      awaiting: 'În așteptarea datei de referință',
    },
    directions: { received: 'Primit', sent: 'Trimis' },
    itemKinds: {
      application: 'Cerere',
      agreement: 'Contract',
      team_notice: 'Notificarea echipei',
      stage_plan: 'Plan de etapă',
      stage_report: 'Raport de etapă',
      participant_list: 'Listă de participanți',
      nonconformity_response: 'Răspuns la neconformități',
      client_data_confirmation: 'Confirmarea datelor clientului',
      audit_dossier: 'Dosar de audit',
      certificate_data_form: 'Formularul datelor certificatului',
      certificate_draft: 'Proiect de certificat',
      client_opinion: 'Opinia clientului',
      decision_form: 'Formular de decizie',
      certificate: 'Certificat',
      other: 'Altul',
    },
    counterparts: {
      client: 'Client',
      certification_body: 'Organism de certificare',
      audit_team_member: 'Membru al echipei de audit',
      other: 'Altul',
    },
    channels: {
      email: 'E-mail',
      platform: 'Platformă',
      courier: 'Curier',
      hand_delivery: 'Predare în mână',
      other: 'Altul',
    },
    origins: {
      automatic: 'Neconformitate minoră cu plan adecvat',
      manual: 'Adăugat de un membru',
      discrepancy: 'Neconcordanță acceptată',
    },
    status: { open: 'Deschis', withdrawn: 'Retras' },
    fields: {
      anchor: 'Dată de referință',
      due: 'Termen',
      record: 'Schimb',
      date: 'Data',
      counterpart: 'Interlocutor',
      channel: 'Canal',
      reference: 'Referință',
      documents: 'Documente',
      note: 'Notă',
      recorded: 'Înregistrat',
      values: 'Valori înregistrate',
      reason: 'Motiv',
      origin: 'Origine',
      text: 'De verificat',
      source: 'Sursă',
      status: 'Stare',
      withdrawal: 'Retras',
    },
    sources: {
      finding: 'Constatare',
      discrepancy: 'Neconcordanță',
      exchange: 'Schimb',
      attachment: 'Document',
    },
  },
  ru: {
    section: 'Обмены и сроки',
    reverificationSection: 'Пункты для повторной проверки',
    set: 'Процедурные сроки, версия {version}, настроены: {by}, {at}',
    noSet: 'Процедурные сроки не настроены.',
    none: 'Обмены не записаны.',
    noItems: 'Нечего проверять повторно.',
    surveillance: 'Крайний срок начала первого надзора: {date}',
    noSurveillance:
      'Крайний срок начала первого надзора устанавливается вместе с сертификатом.',
    exchange: 'Запись обмена',
    item: 'Пункт для повторной проверки',
    automatic: 'Автоматический пункт для повторной проверки',
    version: 'версия',
    deadlines: {
      stage_plan_sent: 'План этапа отправлен клиенту',
      audit_dossier_transmitted: 'Досье аудита передано органу по сертификации',
      stage_2_report_released: 'Отчёт этапа 2 передан клиенту',
    },
    states: {
      due: 'Ожидается',
      met: 'Соблюдён',
      met_late: 'Соблюдён с опозданием',
      overdue: 'Просрочен',
      sent_too_early: 'Отправлено слишком рано',
      awaiting: 'Ожидает исходной даты',
    },
    directions: { received: 'Получено', sent: 'Отправлено' },
    itemKinds: {
      application: 'Заявка',
      agreement: 'Договор',
      team_notice: 'Уведомление о команде',
      stage_plan: 'План этапа',
      stage_report: 'Отчёт этапа',
      participant_list: 'Список участников',
      nonconformity_response: 'Ответ на несоответствия',
      client_data_confirmation: 'Подтверждение данных клиента',
      audit_dossier: 'Досье аудита',
      certificate_data_form: 'Форма данных сертификата',
      certificate_draft: 'Проект сертификата',
      client_opinion: 'Мнение клиента',
      decision_form: 'Форма решения',
      certificate: 'Сертификат',
      other: 'Другое',
    },
    counterparts: {
      client: 'Клиент',
      certification_body: 'Орган по сертификации',
      audit_team_member: 'Член команды аудита',
      other: 'Другое',
    },
    channels: {
      email: 'Электронная почта',
      platform: 'Платформа',
      courier: 'Курьер',
      hand_delivery: 'Лично в руки',
      other: 'Другое',
    },
    origins: {
      automatic: 'Незначительное несоответствие с адекватным планом',
      manual: 'Добавлено участником',
      discrepancy: 'Принятое расхождение',
    },
    status: { open: 'Открыт', withdrawn: 'Отозван' },
    fields: {
      anchor: 'Исходная дата',
      due: 'Срок',
      record: 'Запись обмена',
      date: 'Дата',
      counterpart: 'Контрагент',
      channel: 'Канал',
      reference: 'Номер',
      documents: 'Документы',
      note: 'Примечание',
      recorded: 'Записано',
      values: 'Записанные значения',
      reason: 'Причина',
      origin: 'Происхождение',
      text: 'Проверить',
      source: 'Источник',
      status: 'Статус',
      withdrawal: 'Отозван',
    },
    sources: {
      finding: 'Наблюдение',
      discrepancy: 'Расхождение',
      exchange: 'Запись обмена',
      attachment: 'Документ',
    },
  },
};

/**
 * The register's exchange section, with the deadline states at generation
 * time, then the Re-verification Items, in one language.
 */
export function exchangeRegisterBlocks(
  section: ExchangeRegister & { reverification: ReverificationSection },
  documents: readonly CertificationAttachment[],
  language: RegisterLanguage,
): ExchangeRegisterBlock[] {
  const l = LABELS[language];
  const register = REGISTER_LABELS[language];
  const f = l.fields;
  const blocks: ExchangeRegisterBlock[] = [
    { kind: 'section', text: l.section },
  ];
  const set = section.deadlines.set;
  blocks.push({
    kind: 'paragraph',
    text: set
      ? fill(l.set, {
          version: String(set.version),
          by: set.configuredBy.displayName,
          at: utc(set.configuredAt),
        })
      : l.noSet,
  });
  for (const entry of section.deadlines.entries)
    blocks.push({
      kind: 'entry',
      title: `${deadlineTitle(entry, l, register.values.stage)} — ${
        entry.state === null ? l.states.awaiting : l.states[entry.state]
      }`,
      fields: [
        ...(entry.anchor ? [{ label: f.anchor, value: entry.anchor }] : []),
        ...(entry.dueDate ? [{ label: f.due, value: entry.dueDate }] : []),
        ...(entry.record
          ? [
              {
                label: f.record,
                value: `${l.exchange} ${String(entry.record.sequence)}, ${entry.record.businessDate}`,
              },
            ]
          : []),
      ],
    });
  if (section.records.length === 0)
    blocks.push({ kind: 'paragraph', text: l.none });
  for (const record of section.records) {
    const current = record.current;
    blocks.push({
      kind: 'entry',
      title: `${l.exchange} ${String(record.sequence)} — ${l.directions[current.direction]} — ${l.itemKinds[current.itemKind]}`,
      fields: [
        { label: f.date, value: current.businessDate },
        {
          label: f.counterpart,
          value: `${l.counterparts[current.counterpart.kind]}: ${current.counterpart.name}`,
        },
        { label: f.channel, value: l.channels[current.channel] },
        ...(current.reference
          ? [{ label: f.reference, value: current.reference }]
          : []),
        {
          label: f.documents,
          value: documentList(current.attachmentIds, documents, l),
        },
        ...(current.note ? [{ label: f.note, value: current.note }] : []),
        ...record.versions.flatMap((version) => [
          {
            label: `${f.recorded} (${l.version} ${String(version.version)})`,
            value: `${version.recordedBy.displayName}, ${utc(version.recordedAt)}${
              version.reason ? ` — ${f.reason}: ${version.reason}` : ''
            }`,
          },
          // An earlier version stays readable with its own recorded values.
          ...(version.id === current.id
            ? []
            : [
                {
                  label: `${f.values} (${l.version} ${String(version.version)})`,
                  value: versionValues(version, documents, l),
                },
              ]),
        ]),
      ],
    });
  }
  const reverification = section.reverification;
  blocks.push({ kind: 'section', text: l.reverificationSection });
  blocks.push({
    kind: 'paragraph',
    text: reverification.firstSurveillanceBy
      ? fill(l.surveillance, { date: reverification.firstSurveillanceBy })
      : l.noSurveillance,
  });
  if (reverification.items.length === 0)
    blocks.push({ kind: 'paragraph', text: l.noItems });
  for (const item of reverification.items)
    blocks.push({
      kind: 'entry',
      title:
        item.origin === 'automatic'
          ? `${l.automatic} — ${l.status.open}`
          : `${l.item} ${String(item.sequence)} — ${l.status[item.status]}`,
      fields: itemFields(item, l),
    });
  return blocks;
}

/** Every recorded value of one Exchange Record version, on one line. */
function versionValues(
  version: ExchangeRecordVersion,
  documents: readonly CertificationAttachment[],
  l: ExchangeLabels,
): string {
  const f = l.fields;
  return [
    `${l.directions[version.direction]} — ${l.itemKinds[version.itemKind]}`,
    `${f.date}: ${version.businessDate}`,
    `${f.counterpart}: ${l.counterparts[version.counterpart.kind]}: ${version.counterpart.name}`,
    `${f.channel}: ${l.channels[version.channel]}`,
    ...(version.reference ? [`${f.reference}: ${version.reference}`] : []),
    `${f.documents}: ${documentList(version.attachmentIds, documents, l)}`,
    ...(version.note ? [`${f.note}: ${version.note}`] : []),
  ].join('; ');
}

function documentList(
  attachmentIds: readonly string[],
  documents: readonly CertificationAttachment[],
  l: ExchangeLabels,
): string {
  return attachmentIds
    .map((id) => {
      const document = documents.find((entry) => entry.id === id);
      return document
        ? `${document.sourceTitle}, ${l.version} ${String(document.versionNumber)}`
        : id;
    })
    .join(', ');
}

function itemFields(
  item: ReverificationItemView,
  l: ExchangeLabels,
): { label: string; value: string }[] {
  const f = l.fields;
  const source = item.source;
  let shown: string | null = null;
  if (source)
    switch (source.kind) {
      case 'finding':
        shown = `${l.sources.finding} ${String(source.sequence)}`;
        break;
      case 'discrepancy':
        shown = `${l.sources.discrepancy} ${source.discrepancyId.split(':')[0] ?? ''}`;
        break;
      case 'exchange':
        shown = `${l.sources.exchange} ${String(source.sequence)}`;
        break;
      case 'attachment':
        shown = `${l.sources.attachment} ${source.sourceTitle}, ${l.version} ${String(source.versionNumber)}`;
        break;
    }
  const fields = [
    { label: f.origin, value: l.origins[item.origin] },
    ...(item.text !== null ? [{ label: f.text, value: item.text }] : []),
    ...(shown !== null ? [{ label: f.source, value: shown }] : []),
  ];
  if (item.origin === 'automatic') return fields;
  fields.push({
    label: f.recorded,
    value: `${item.addedBy.displayName}, ${utc(item.addedAt)}`,
  });
  if (item.status === 'withdrawn')
    fields.push({
      label: f.withdrawal,
      value: `${item.withdrawal.by.displayName}, ${utc(item.withdrawal.at)} — ${f.reason}: ${item.withdrawal.reason}`,
    });
  return fields;
}

function deadlineTitle(
  entry: DeadlineEntry,
  l: ExchangeLabels,
  stages: Record<'stage_1' | 'stage_2', string>,
): string {
  const name = l.deadlines[entry.kind];
  return entry.stage ? `${name} — ${stages[entry.stage]}` : name;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.hasOwn(values, key) ? (values[key] ?? match) : match,
  );
}

/** An ISO instant as a language-independent UTC timestamp. */
function utc(instant: string): string {
  const iso = new Date(instant).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}
