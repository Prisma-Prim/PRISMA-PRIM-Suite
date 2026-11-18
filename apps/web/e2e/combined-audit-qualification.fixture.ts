import { expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { combinedAuditPdf } from '../../api/test-support/combined-audit-pdf.fixture.mjs';
import {
  addDays,
  CERTIFICATE_TEXT,
  certificationMembers,
  prepareCertificationJourney,
  record,
  records,
  text,
  type Identity,
} from './certification-journey.acceptance.fixture';

/** Native prerequisites stop before the first team; every later act is explicit. */
export async function prepareCombinedAudit(
  request: APIRequestContext,
  suffix: string,
) {
  const journey = await prepareCertificationJourney(request, suffix, {
    stopAfter: 'agreement',
  });
  const { manager, auditor, approver } = certificationMembers;
  const approverMembership = text(
    (await journey.read(approver, '/access/current-actor'))
      .workspaceMembershipId,
  );
  const pdf = await combinedAuditPdf();
  const attachmentId = await journey.attach(
    'evidence',
    `Fictional bilingual source ${suffix}`,
    pdf,
  );
  const attachments = records(
    (await journey.read(manager, `${journey.base}/documents`)).items,
  );
  const attachment = attachments.find((item) => item.id === attachmentId);
  if (!attachment) throw new Error('Missing fictional exact Case source');
  const source = {
    documentId: text(attachment.documentId),
    documentVersionId: text(attachment.versionId),
    representationId: text(attachment.representationId),
    caseId: journey.caseId,
    attachmentId,
  };
  const projectId = text((await journey.read(manager, journey.base)).projectId);
  const prefix = `/projects/${projectId}/dossier-analysis`;
  const clientId = text(
    (await journey.read(manager, `/projects/${projectId}`)).clientAccountId,
  );
  const docx = Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      '_rels/.rels': strToU8(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      'word/_rels/document.xml.rels': strToU8(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
      ),
      'word/document.xml': strToU8(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cod fiscal</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>RO87654321</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Организация: учебный пример — только предложение.</w:t></w:r></w:p></w:body></w:document>',
      ),
    }),
  );
  function headers(member: Identity) {
    return { ...member, 'x-company-context-id': journey.companyId };
  }
  async function command(
    member: Identity,
    path: string,
    data: unknown,
    key = randomUUID(),
  ) {
    const response = await request.post(`http://127.0.0.1:4174/api${path}`, {
      headers: { ...headers(member), 'idempotency-key': key },
      data,
    });
    expect(response.status(), `${path}: ${await response.text()}`).toBe(201);
    return record(await response.json());
  }
  return {
    ...journey,
    prefix,
    projectId,
    clientId,
    source,
    pdf,
    docx,
    headers,
    command,
    /** Separate native human acts; no analysis result supplies a business answer. */
    async conductAudit() {
      for (const stage of ['stage-1', 'stage-2'] as const) {
        const dates =
          stage === 'stage-1' ? journey.stages.stage1 : journey.stages.stage2;
        await journey.step(manager, `${journey.base}/stages/${stage}/plan`, {
          startDate: dates.start,
          endDate: dates.end,
          onSiteDays: text(
            journey.confirmedDuration[
              stage === 'stage-1' ? 'stage1OnSite' : 'stage2OnSite'
            ],
          ),
          remoteDays: '0',
          objectives: 'Fictional independently entered audit objectives',
          scope: 'Production of pasteurised milk and yoghurt (fictional)',
          planAttachmentId: await journey.attach(
            'plan',
            `Fictional ${stage} plan`,
          ),
          sentToClientOn: null,
          deviationNote: null,
        });
        if (stage === 'stage-2')
          await journey.step(auditor, `${journey.base}/findings`, {
            stage: 'stage_2',
            classification: 'minor_nonconformity',
            clause: '8.5.1',
            area: 'Fictional receiving',
            statement: 'Fictional allergen omitted from hazard analysis.',
            evidenceAttachmentIds: [attachmentId],
          });
        const reportAttachmentId = await journey.attach(
          'report',
          `Fictional ${stage} report`,
        );
        await journey.step(
          auditor,
          `${journey.base}/stages/${stage}/report`,
          stage === 'stage-1'
            ? {
                reportDate: dates.end,
                documentReviewCompleted: true,
                conclusion: 'ready',
                conclusionNote:
                  'Independent fictional auditor ready for Stage 2.',
                reportAttachmentId,
              }
            : {
                reportDate: dates.end,
                summary: 'Fictional audit with one minor nonconformity.',
                reportAttachmentId,
                certificationBodyApproval: null,
              },
        );
      }
      const minor = records(
        (await journey.read(auditor, journey.base)).findings,
      ).find((row) => row.classification === 'minor_nonconformity');
      if (!minor)
        throw new Error('Missing independently recorded minor nonconformity');
      const minorPath = `${journey.base}/findings/${text(minor.id)}`;
      await journey.step(auditor, `${minorPath}/response`, {
        correction: 'Fictional allergen added.',
        cause: 'Fictional template omission.',
        correctiveAction: 'Fictional template revised and staff trained.',
        receivedOn: addDays(journey.today, -10),
        plannedCompletionOn: null,
        evidenceAttachmentIds: [],
      });
      await journey.step(auditor, `${minorPath}/plan-judgment`, {
        outcome: 'adequate',
        note: 'Independent fictional assessment.',
      });
      await journey.step(auditor, `${journey.base}/recommendation`, {
        recommendation: 'grant',
        basis:
          'Fictional minor nonconformity has an independently judged adequate plan.',
      });
      await journey.step(manager, `${journey.base}/certificate-data`, {
        texts: [CERTIFICATE_TEXT],
        agreedOn: journey.today,
        agreementAttachmentId: await journey.attach(
          'certificate_data',
          'Fictional agreed Certificate data',
        ),
      });
      await journey.reviewDossier();
      const decision = await journey.step(
        approver,
        `${journey.base}/decision`,
        journey.decision(),
      );
      expect(record(decision.decision).recordedBy).toMatchObject({
        workspaceMembershipId: approverMembership,
      });
      expect(approverMembership).not.toBe(journey.auditorMembership);
    },
  };
}
