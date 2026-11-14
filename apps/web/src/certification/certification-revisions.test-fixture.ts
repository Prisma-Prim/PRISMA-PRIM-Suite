import { parseCaseDetail } from './certification-response';
import {
  FakeCertificationServer,
  CERTIFICATE_TEXTS,
  certificationDecision,
  certificationIds,
  dossierReview,
  stagePlan,
  stage1Report,
  stage2Report,
} from './certification.test-fixture';

/** A Case issued through the release circuit, eligible for revisions. */
export function seedIssuedCertificationCase(
  server: FakeCertificationServer,
  reference: string,
) {
  const caseId = server.seedApprovedTeam({
    orderReference: reference,
    leader: certificationIds.colleague,
  });
  const attach = (role: string, title: string) =>
    server.attachAsColleague(caseId, server.addSource(title), role);
  server.recordStageAsColleague(
    caseId,
    'stage_1_plan',
    stagePlan(attach('plan', 'Stage 1 plan')),
  );
  server.recordStageAsColleague(
    caseId,
    'stage_1_report',
    stage1Report(attach('report', 'Stage 1 report')),
  );
  server.recordStageAsColleague(
    caseId,
    'stage_2_plan',
    stagePlan(attach('plan', 'Stage 2 plan'), {
      startDate: '2026-11-04',
      endDate: '2026-11-05',
      onSiteDays: '2',
    }),
  );
  server.recordStageAsColleague(
    caseId,
    'stage_2_report',
    stage2Report(attach('report', 'Stage 2 report')),
  );
  server.recordStepAsColleague(caseId, 'recommendation', {
    recommendation: 'grant',
    basis: 'Fictional recommendation.',
  });
  const dataForm = attach('certificate_data', 'Signed Certificate data');
  server.recordStepAsColleague(caseId, 'certificate_data', {
    texts: CERTIFICATE_TEXTS,
    agreedOn: '2026-11-05',
    agreementAttachmentId: dataForm,
  });
  server.recordStepAsColleague(caseId, 'dossier_review', dossierReview());
  server.recordStepAsColleague(caseId, 'decision', certificationDecision());
  const originalPdf = attach('certificate', 'Original issued Certificate');
  server.recordCertificateAsColleague(caseId, {
    number: 'DEMO-0001',
    attachmentId: originalPdf,
  });
  return { caseId, originalPdf, dataForm, attach };
}

/** Seed a command through the same HTTP reader and writer contract as the Workspace. */
export async function recordIssuedCaseCommand(
  server: FakeCertificationServer,
  caseId: string,
  path: string,
  value: Record<string, unknown>,
) {
  const scope = {
    caseId,
    companyId: certificationIds.company,
    projectId: certificationIds.project,
  };
  const before = parseCaseDetail(
    await (await server.fetch(`/api/certification-cases/${caseId}`)).json(),
    scope,
  );
  const result = await server.fetch(
    `/api/certification-cases/${caseId}/${path}`,
    {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ expectedRevision: before.revision, ...value }),
    },
  );
  if (result.status !== 201)
    throw new Error(`Fictional command failed: ${result.status}`);
  return parseCaseDetail(await result.json(), scope);
}
