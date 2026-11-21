import { unexpected } from './certification-command';
import { type ApiResult } from '../api/authenticated-api-client';
import { type ActAttribution } from './certification-attribution';
import { recordEvidence } from './certification-findings';
import { slotRoles, stageAttachmentReferences } from './certification-stages';
import {
  sourceKey,
  type CaseDetail,
  type CaseHistoryPage,
  type CaseTimeline,
  type CertificationDocumentRole,
  type DocumentRegister,
} from './certification-response';
import { certificateTextDifferences } from './certification-decision';

export type View<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error' | 'denied' | 'unavailable' };
/** Reads every immutable history page through the revision observed in the detail. */
export async function loadCaseHistory<
  T extends { id: string; caseRevision: number },
>(
  read: (path: string) => Promise<ApiResult<unknown>>,
  path: string,
  revision: number,
  parse: (value: unknown) => {
    items: T[];
    page: CaseHistoryPage;
  },
): Promise<
  { status: 'ok'; items: T[] } | { status: ReturnType<typeof refusal> }
> {
  const items: T[] = [];
  const seen = new Set<string>();
  let afterRevision = 0;
  for (;;) {
    const query = new URLSearchParams({ atRevision: String(revision) });
    if (afterRevision > 0) query.set('afterRevision', String(afterRevision));
    const result = await read(`${path}?${query}`);
    if (result.status !== 'ok') return { status: refusal(result) };
    const { items: batch, page } = parse(result.value);
    if (page.atRevision !== revision)
      throw new Error('Unexpected Certification Case history revision.');
    for (const item of batch) {
      if (
        seen.has(item.id) ||
        item.caseRevision <= afterRevision ||
        item.caseRevision > revision
      )
        throw new Error('Unexpected Certification Case history entry.');
      seen.add(item.id);
      items.push(item);
    }
    if (page.nextAfterRevision === null) return { status: 'ok', items };
    afterRevision = page.nextAfterRevision;
  }
}

/**
 * The detail and its timeline must describe the same recorded versions, and
 * no Finding record shares the revision of a step version.
 */
export function timelineMatches(detail: CaseDetail, timeline: CaseTimeline) {
  const last = timeline.entries.at(-1);
  const recorded = (id: string, version: number) =>
    timeline.entries.some(
      (entry) => entry.id === id && entry.version === version,
    );
  const steps = new Set(timeline.entries.map((entry) => entry.caseRevision));
  return (
    (last === undefined || last.caseRevision <= detail.revision) &&
    [
      ...detail.release.drafts,
      ...detail.release.opinions,
      ...detail.release.approvals,
    ].every((version) => recorded(version.id, version.version)) &&
    detail.release.revisions.every((revision) => {
      const decision = timeline.entries.find(
        (entry) => entry.id === revision.decisionVersionId,
      );
      const data = timeline.entries.find(
        (entry) => entry.id === revision.certificateDataVersionId,
      );
      return (
        !steps.has(revision.caseRevision) &&
        decision?.step === 'decision' &&
        decision.value.decision === 'granted' &&
        decision.caseRevision < revision.caseRevision &&
        data?.step === 'certificate_data' &&
        data.caseRevision < revision.caseRevision &&
        certificateTextDifferences(revision.texts, decision.value.grantedTexts)
          .length === 0 &&
        certificateTextDifferences(revision.texts, data.value.texts).length ===
          0
      );
    }) &&
    detail.findings.every((finding) =>
      finding.records.every((record) => !steps.has(record.caseRevision)),
    ) &&
    timeline.entries.every(
      (entry) =>
        entry.step !== 'decision' ||
        entry.value.decision === detail.decision?.value.decision,
    ) &&
    (detail.application === null ||
      recorded(detail.application.id, detail.application.version)) &&
    (detail.applicationReview === null ||
      recorded(
        detail.applicationReview.id,
        detail.applicationReview.version,
      )) &&
    (detail.duration === null ||
      recorded(detail.duration.id, detail.duration.version)) &&
    (detail.agreement === null ||
      recorded(detail.agreement.id, detail.agreement.version)) &&
    (detail.team === null || recorded(detail.team.id, detail.team.version)) &&
    (detail.teamDecision === null ||
      recorded(detail.teamDecision.id, detail.teamDecision.version)) &&
    [
      detail.stage1Plan,
      detail.stage1Report,
      detail.stage2Plan,
      detail.stage2Report,
      detail.recommendation,
      detail.dossierReview,
      detail.decision,
      detail.certificateData,
    ].every(
      (version) => version === null || recorded(version.id, version.version),
    ) &&
    // Each decision concerns a team version the timeline records before it.
    timeline.entries.every(
      (entry, index) =>
        entry.step !== 'team_decision' ||
        timeline.entries
          .slice(0, index)
          .some(
            (earlier) =>
              earlier.step === 'team' &&
              earlier.version === entry.value.teamVersion,
          ),
    )
  );
}

/**
 * The register belongs to the same Case read: no attachment beyond the Case
 * revision or at the revision of a step or Finding record, every recorded
 * agreement refers to an attachment with the agreement role attached before
 * it, every Stage record to attachments with the roles of their slots
 * attached before it, every Finding record to evidence of this Case attached
 * before it, every decision form and Certificate data form to an attachment
 * with its role attached before it, every signed form of an act on behalf
 * of the certification body and every evidence of an impartiality analysis
 * to an attachment of any role attached before it, and the Certificate to
 * an attachment with the Certificate role.
 */
export function registerMatches(
  detail: CaseDetail,
  timeline: CaseTimeline,
  register: DocumentRegister,
) {
  const certificateAttachments = [
    detail.certificate?.attachmentId,
    ...detail.release.revisions.map((revision) => revision.attachmentId),
  ];
  const certificateVersions = certificateAttachments.flatMap((id) =>
    register.items
      .filter((item) => item.id === id)
      .map((item) => item.versionId),
  );
  const findingRecords = detail.findings.flatMap((finding) => finding.records);
  const steps = new Set([
    ...timeline.entries.map((entry) => entry.caseRevision),
    ...findingRecords.map((record) => record.caseRevision),
  ]);
  return (
    new Set(register.items.map(sourceKey)).size === register.items.length &&
    findingRecords.every((record) =>
      recordEvidence(record).every((attachmentId) =>
        register.items.some(
          (item) =>
            item.id === attachmentId && item.caseRevision < record.caseRevision,
        ),
      ),
    ) &&
    register.items.every(
      (item) =>
        item.caseRevision <= detail.revision && !steps.has(item.caseRevision),
    ) &&
    timeline.entries.every(
      (entry) =>
        entry.step !== 'agreement' ||
        register.items.some(
          (item) =>
            item.id === entry.value.attachmentId &&
            item.role === 'agreement' &&
            item.caseRevision < entry.caseRevision,
        ),
    ) &&
    timeline.entries.every((entry) =>
      stageAttachmentsOf(entry).every(({ slot, attachmentId }) =>
        register.items.some(
          (item) =>
            item.id === attachmentId &&
            slotRoles(slot).includes(item.role) &&
            item.caseRevision < entry.caseRevision,
        ),
      ),
    ) &&
    timeline.entries.every((entry) =>
      closingAttachmentsOf(entry).every(({ role, attachmentId }) =>
        register.items.some(
          (item) =>
            item.id === attachmentId &&
            item.role === role &&
            item.caseRevision < entry.caseRevision,
        ),
      ),
    ) &&
    timeline.entries.every((entry) =>
      citedAttachmentsOf(entry).every((attachmentId) =>
        register.items.some(
          (item) =>
            item.id === attachmentId && item.caseRevision < entry.caseRevision,
        ),
      ),
    ) &&
    new Set(certificateVersions).size === certificateVersions.length &&
    detail.release.revisions.every((revision) => {
      const transmission = revision.transmission;
      return (
        transmission === null ||
        (!transmission.attachmentIds.includes(
          detail.certificate?.attachmentId ?? '',
        ) &&
          transmission.attachmentIds.every((id) =>
            register.items.some(
              (item) =>
                item.id === id && item.caseRevision < transmission.caseRevision,
            ),
          ))
      );
    }) &&
    detail.release.revisions.every(
      (revision) =>
        register.items.some(
          (item) =>
            item.id === revision.attachmentId &&
            item.role === 'certificate' &&
            item.caseRevision < revision.caseRevision,
        ) &&
        (revision.onBehalf?.formAttachmentId == null ||
          register.items.some(
            (item) =>
              item.id === revision.onBehalf?.formAttachmentId &&
              item.caseRevision < revision.caseRevision,
          )),
    ) &&
    (detail.certificate === null ||
      register.items.some(
        (item) =>
          item.id === detail.certificate?.attachmentId &&
          item.role === 'certificate',
      ))
  );
}

/** The forms a closing step cites, each with the role it must carry. */
function closingAttachmentsOf(
  entry: CaseTimeline['entries'][number],
): { role: CertificationDocumentRole; attachmentId: string }[] {
  switch (entry.step) {
    case 'decision': {
      const form = entry.value.decisionFormAttachmentId;
      return form === null
        ? []
        : [{ role: 'decision_form', attachmentId: form }];
    }
    case 'certificate_draft':
      return [
        { role: 'certificate_draft', attachmentId: entry.value.attachmentId },
      ];
    case 'client_opinion':
    case 'certificate_draft_approval':
      return [];
    case 'certificate_data':
      return [
        {
          role: 'certificate_data',
          attachmentId: entry.value.agreementAttachmentId,
        },
      ];
    case 'application':
    case 'application_review':
    case 'duration':
    case 'agreement':
    case 'team':
    case 'team_decision':
    case 'stage_1_plan':
    case 'stage_1_report':
    case 'stage_2_plan':
    case 'stage_2_report':
    case 'recommendation':
    case 'dossier_review':
      return [];
  }
  return unexpected(entry);
}

/**
 * The attachments of any role a timeline entry cites: the signed forms of
 * its acts on behalf of the certification body and the evidence of a
 * team's impartiality analysis.
 */
function citedAttachmentsOf(entry: CaseTimeline['entries'][number]): string[] {
  const form = (...acts: (ActAttribution | null)[]) =>
    acts.flatMap((act) =>
      act?.formAttachmentId ? [act.formAttachmentId] : [],
    );
  switch (entry.step) {
    case 'application_review':
    case 'duration':
    case 'team_decision':
      return form(entry.value.onBehalf);
    case 'dossier_review':
      return form(entry.value.reviewedBy, entry.value.approvedBy);
    case 'team':
      return entry.value.impartialityAnalysis?.evidenceAttachmentIds ?? [];
    case 'certificate_draft_approval':
      return form(entry.value.onBehalf);
    case 'application':
    case 'agreement':
    case 'stage_1_plan':
    case 'stage_1_report':
    case 'stage_2_plan':
    case 'stage_2_report':
    case 'recommendation':
    case 'decision':
    case 'certificate_data':
    case 'certificate_draft':
    case 'client_opinion':
      return [];
  }
  return unexpected(entry);
}

/** The attachments a timeline entry refers to by slot; none outside Stages. */
function stageAttachmentsOf(entry: CaseTimeline['entries'][number]) {
  switch (entry.step) {
    case 'stage_1_plan':
    case 'stage_1_report':
    case 'stage_2_plan':
    case 'stage_2_report':
      return stageAttachmentReferences(entry.value);
    case 'application':
    case 'application_review':
    case 'duration':
    case 'agreement':
    case 'team':
    case 'team_decision':
    case 'recommendation':
    case 'dossier_review':
    case 'decision':
    case 'certificate_data':
    case 'certificate_draft':
    case 'client_opinion':
    case 'certificate_draft_approval':
      return [];
  }
  return unexpected(entry);
}

export function refusal(
  result: ApiResult<unknown>,
): 'error' | 'denied' | 'unavailable' {
  return result.status === 'forbidden' || result.status === 'unauthorized'
    ? 'denied'
    : result.status === 'notFound'
      ? 'unavailable'
      : 'error';
}
