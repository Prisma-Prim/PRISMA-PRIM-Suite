import type {
  CertificationAttachment,
  CertificateRecord,
} from './certification.types.js';
import type { CertificateRelease } from './certification-release.js';
import type { RegisterBlock } from './certification-register.js';
import type { RegisterLanguage } from './certification-register.labels.js';

const COPY = {
  en: {
    revisionRequired: 'Revision required',
    revision: 'Revision',
    current: 'Current',
    superseded: 'Superseded',
    reason: 'Reason',
    pdf: 'Exact PDF Version',
    texts: 'Texts',
    warning: 'revision not marked on the Certificate',
    recordedAt: 'Recording time',
    onBehalf: 'Act on behalf',
    title: 'Certificate release',
    draft: 'Draft',
    opinion: 'Client opinion',
    approval: 'Draft approval',
    issue: 'Issuance',
    transmission: 'Transmission',
    date: 'Date',
    actor: 'Recorded by',
    missing: 'Not recorded',
    legacy:
      'Certificate recorded before the release circuit; issue date unknown',
    pending: 'Days since issuance',
    agreed: 'Agreed',
    changes_requested: 'Changes requested',
    skipped: 'Skipped',
  },
  fr: {
    revisionRequired: 'Révision requise',
    revision: 'Révision',
    current: 'En vigueur',
    superseded: 'Remplacée',
    reason: 'Motif',
    pdf: 'Version PDF exacte',
    texts: 'Textes',
    warning: 'révision non indiquée sur le certificat',
    recordedAt: 'Heure d’enregistrement',
    onBehalf: 'Acte pour le compte',
    title: 'Délivrance du certificat',
    draft: 'Projet',
    opinion: 'Avis du client',
    approval: 'Approbation du projet',
    issue: 'Émission',
    transmission: 'Transmission',
    date: 'Date',
    actor: 'Enregistré par',
    missing: 'Non enregistré',
    legacy: 'Certificat enregistré avant le circuit; date d’émission inconnue',
    pending: 'Jours depuis l’émission',
    agreed: 'Accordé',
    changes_requested: 'Modifications demandées',
    skipped: 'Non sollicité',
  },
  ro: {
    revisionRequired: 'Revizie necesară',
    revision: 'Revizia',
    current: 'Curentă',
    superseded: 'Înlocuită',
    reason: 'Motiv',
    pdf: 'Versiunea PDF exactă',
    texts: 'Texte',
    warning: 'revizia nu este marcată pe certificat',
    recordedAt: 'Ora înregistrării',
    onBehalf: 'Act în numele',
    title: 'Eliberarea certificatului',
    draft: 'Proiect',
    opinion: 'Opinia clientului',
    approval: 'Aprobarea proiectului',
    issue: 'Emiterea',
    transmission: 'Transmiterea',
    date: 'Data',
    actor: 'Înregistrat de',
    missing: 'Neînregistrat',
    legacy:
      'Certificat înregistrat înaintea circuitului; data emiterii necunoscută',
    pending: 'Zile de la emitere',
    agreed: 'De acord',
    changes_requested: 'Modificări solicitate',
    skipped: 'Omisă',
  },
  ru: {
    revisionRequired: 'Требуется редакция',
    revision: 'Редакция',
    current: 'Текущая',
    superseded: 'Заменена',
    reason: 'Причина',
    pdf: 'Точная версия PDF',
    texts: 'Тексты',
    warning: 'редакция не отмечена на сертификате',
    recordedAt: 'Время записи',
    onBehalf: 'Действие от имени',
    title: 'Выдача сертификата',
    draft: 'Проект',
    opinion: 'Мнение клиента',
    approval: 'Утверждение проекта',
    issue: 'Выдача',
    transmission: 'Передача',
    date: 'Дата',
    actor: 'Записал',
    missing: 'Не записано',
    legacy: 'Сертификат записан до введения процедуры; дата выдачи неизвестна',
    pending: 'Дней с выдачи',
    agreed: 'Согласовано',
    changes_requested: 'Запрошены изменения',
    skipped: 'Пропущено',
  },
};

/** Complete immutable release history, including the separate transmission. */
export function releaseRegisterBlocks(
  release: CertificateRelease,
  language: RegisterLanguage,
  certificate: CertificateRecord | null,
  documents: readonly CertificationAttachment[] = [],
): RegisterBlock[] {
  const c = COPY[language];
  const blocks: RegisterBlock[] = [{ kind: 'section', text: c.title }];
  const entry = (
    title: string,
    date: string,
    actor: string,
  ): RegisterBlock => ({
    kind: 'entry',
    title,
    fields: [
      { label: c.date, value: date },
      { label: c.actor, value: actor },
    ],
  });
  for (const draft of release.drafts)
    blocks.push(
      entry(
        `${c.draft} ${draft.version}: ${draft.value.number}`,
        draft.value.draftedOn,
        draft.recordedBy.displayName,
      ),
    );
  if (!release.drafts.length)
    blocks.push({ kind: 'paragraph', text: `${c.draft}: ${c.missing}` });
  for (const opinion of release.opinions)
    blocks.push(
      entry(
        `${c.opinion}: ${c[opinion.value.outcome]}`,
        opinion.value.businessDate,
        opinion.recordedBy.displayName,
      ),
    );
  if (!release.opinions.length)
    blocks.push({ kind: 'paragraph', text: `${c.opinion}: ${c.missing}` });
  for (const approval of release.approvals)
    blocks.push(
      entry(
        c.approval,
        approval.value.approvedOn,
        approval.recordedBy.displayName,
      ),
    );
  if (!release.approvals.length)
    blocks.push({ kind: 'paragraph', text: `${c.approval}: ${c.missing}` });
  if (certificate)
    blocks.push(
      entry(
        `${c.issue} · ${c.revision} 0 · ${release.currentRevisionIndex === 0 ? c.current : c.superseded}`,
        certificate.issuedOn ?? certificate.recordedAt,
        certificate.recordedBy.displayName,
      ),
    );
  else blocks.push({ kind: 'paragraph', text: `${c.issue}: ${c.missing}` });
  if (release.legacyIssuance)
    blocks.push({ kind: 'paragraph', text: c.legacy });
  if (release.transmission)
    blocks.push(
      entry(
        c.transmission,
        release.transmission.businessDate,
        release.transmission.recordedBy.displayName,
      ),
    );
  else
    blocks.push({ kind: 'paragraph', text: `${c.transmission}: ${c.missing}` });
  if (release.revisionRequired)
    blocks.push({ kind: 'paragraph', text: c.revisionRequired });
  for (const revision of release.revisions) {
    const attachment = documents.find(
      (document) => document.id === revision.attachmentId,
    );
    blocks.push({
      kind: 'entry',
      title: `${c.revision} ${revision.index} · ${revision.index === release.currentRevisionIndex ? c.current : c.superseded}`,
      fields: [
        { label: c.date, value: revision.revisedOn },
        { label: c.reason, value: revision.reason },
        { label: c.actor, value: revision.recordedBy.displayName },
        { label: c.recordedAt, value: revision.recordedAt },
        {
          label: c.pdf,
          value: attachment
            ? `${attachment.sourceTitle} / ${attachment.fileName} / ${attachment.versionId} / ${attachment.sha256}`
            : revision.attachmentId,
        },
        {
          label: c.texts,
          value: revision.texts
            .map(
              (text) =>
                `${text.language}: ${text.holderName}; ${text.address}; ${text.scope}`,
            )
            .join('\n'),
        },
        ...(revision.onBehalf
          ? [
              {
                label: c.onBehalf,
                value: `${revision.onBehalf.actedBy}; ${revision.onBehalf.actedByFunction}; ${revision.onBehalf.actedOn}`,
              },
            ]
          : []),
        {
          label: c.transmission,
          value: revision.transmission
            ? `${revision.transmission.businessDate}; ${revision.transmission.recordedBy.displayName}; ${revision.transmission.channel}`
            : c.missing,
        },
      ],
    });
    if (!revision.revisionMarked)
      blocks.push({ kind: 'paragraph', text: c.warning });
  }
  if (release.daysSinceIssuance !== null)
    blocks.push({
      kind: 'paragraph',
      text: `${c.pending}: ${release.daysSinceIssuance}`,
    });
  return blocks;
}
