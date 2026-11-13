import { DOSSIER_ITEMS } from './certification-decision.js';
import {
  CERTIFICATION_APPROVER as APPROVER,
  CERTIFICATION_AUDITOR as AUDITOR,
  CERTIFICATION_OWNER as MANAGER,
  record,
  type openCertificationFixture,
  type CertificationSubject,
} from './certification.test-support.js';

export const CERTIFICATE_TEXTS = [
  {
    language: 'ro',
    holderName: 'Lactis Demo SRL',
    address: 'Str. Exemplu 1, Demo City',
    scope: 'Production of milk',
  },
];

/** Native public-command producer shared by release and revision REST proofs. */
export function certificateReleaseCommands(
  getFixture: () => Awaited<ReturnType<typeof openCertificationFixture>>,
) {
  const base = (id: string) => `/certification-cases/${id}`;
  async function read(id: string) {
    return record(await (await getFixture().call(MANAGER, base(id))).json());
  }
  async function post(
    id: string,
    subject: CertificationSubject,
    path: string,
    value: Record<string, unknown>,
    key?: string,
  ) {
    return getFixture().call(subject, `${base(id)}/${path}`, {
      method: 'POST',
      body: { expectedRevision: (await read(id)).revision, ...value },
      ...(key ? { key } : {}),
    });
  }
  async function ok(
    id: string,
    subject: CertificationSubject,
    path: string,
    value: Record<string, unknown>,
  ) {
    return getFixture().created(await post(id, subject, path, value));
  }
  async function attach(id: string, role: string) {
    return getFixture().attach(id, role, Number((await read(id)).revision));
  }
  async function granted() {
    const id = await getFixture().approvedTeamCase();
    for (const [stage, startDate, days] of [
      ['stage-1', '2026-10-01', '1'],
      ['stage-2', '2026-10-20', '1.5'],
    ]) {
      await ok(id, MANAGER, `stages/${stage}/plan`, {
        startDate,
        endDate: startDate,
        onSiteDays: days,
        remoteDays: '0',
        objectives: 'Fictional audit',
        scope: 'Milk',
        planAttachmentId: await attach(id, 'plan'),
        sentToClientOn: null,
        deviationNote: null,
      });
      await ok(id, AUDITOR, `stages/${stage}/report`, {
        reportDate: startDate,
        reportAttachmentId: await attach(id, 'report'),
        ...(stage === 'stage-1'
          ? {
              documentReviewCompleted: true,
              conclusion: 'ready',
              conclusionNote: 'Ready',
            }
          : { summary: 'Completed' }),
      });
    }
    await ok(id, AUDITOR, 'recommendation', {
      recommendation: 'grant',
      basis: 'No nonconformities',
    });
    await ok(id, MANAGER, 'certificate-data', {
      texts: CERTIFICATE_TEXTS,
      agreedOn: '2026-10-21',
      agreementAttachmentId: await attach(id, 'certificate_data'),
    });
    await ok(id, APPROVER, 'dossier-review', {
      items: Object.fromEntries(
        DOSSIER_ITEMS.map((item) => [
          item,
          {
            answer: ['findings_follow_up', 'participant_lists'].includes(item)
              ? 'not_applicable'
              : 'present',
            note: null,
          },
        ]),
      ),
      conclusion: 'Complete',
      independenceAttested: true,
    });
    await ok(id, APPROVER, 'decision', {
      decision: 'granted',
      decidedOn: '2026-11-06',
      decidedBy: 'Independent Demo',
      independenceAttested: true,
      grantedTexts: CERTIFICATE_TEXTS,
      rationale: 'Grant',
    });
    return id;
  }
  async function draft(id: string, number = 'DEMO-0001', reason?: string) {
    const attachmentId = await attach(id, 'certificate_draft');
    const current = await read(id);
    return ok(id, MANAGER, 'certificate-draft', {
      attachmentId,
      number,
      draftedOn: '2026-11-06',
      decisionVersionId: record(current.decision).id,
      certificateDataVersionId: record(current.certificateData).id,
      ...(reason ? { reason } : {}),
    });
  }

  function records(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) throw new Error('Expected list');
    return value.map(record);
  }
  async function skip(id: string, reason?: string) {
    return ok(id, MANAGER, 'client-opinion', {
      draftVersionId: record((await read(id)).release).currentDraftId,
      outcome: 'skipped',
      businessDate: '2026-11-06',
      skipReason: 'texts_already_agreed',
      note: null,
      ...(reason ? { reason } : {}),
    });
  }
  async function approve(id: string) {
    return ok(id, APPROVER, 'certificate-draft-approval', {
      draftVersionId: record((await read(id)).release).currentDraftId,
      approvedOn: '2026-11-06',
      textsConfirmed: true,
      numberConfirmed: true,
      validityConfirmed: true,
      independenceAttested: true,
    });
  }
  async function approved(number: string) {
    const id = await granted();
    await draft(id, number);
    await skip(id);
    await approve(id);
    return id;
  }
  async function issue(id: string, number: string) {
    return ok(id, APPROVER, 'certificate', {
      number,
      issuedOn: '2026-11-06',
      attachmentId: await attach(id, 'certificate'),
      independenceAttested: true,
    });
  }
  async function exchange(id: string, value: Record<string, unknown>) {
    return ok(id, MANAGER, 'exchanges', {
      direction: 'sent',
      itemKind: 'certificate_draft',
      attachmentIds: [],
      counterpart: { kind: 'client', name: 'Lactis Demo SRL' },
      businessDate: '2026-11-06',
      channel: 'email',
      ...value,
    });
  }

  return {
    base,
    read,
    post,
    ok,
    attach,
    granted,
    draft,
    skip,
    approve,
    approved,
    issue,
    exchange,
    records,
  };
}
