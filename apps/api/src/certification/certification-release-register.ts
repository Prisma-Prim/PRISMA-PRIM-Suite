import type { CertificateRecord } from './certification.types.js';
import type { CertificateRelease } from './certification-release.js';
import type { RegisterBlock } from './certification-register.js';
import type { RegisterLanguage } from './certification-register.labels.js';

const COPY = {
  en: {
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
        c.issue,
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
  if (release.daysSinceIssuance !== null)
    blocks.push({
      kind: 'paragraph',
      text: `${c.pending}: ${release.daysSinceIssuance}`,
    });
  return blocks;
}
