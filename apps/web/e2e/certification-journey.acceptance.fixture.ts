import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, type APIRequestContext } from '@playwright/test';
import { roundToHundredths } from '../src/certification/certification-duration';

const api = 'http://127.0.0.1:4174/api';

function identity(subject: string, displayName: string, email: string) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': subject,
    'x-test-display-name': displayName,
    'x-test-email': email,
  };
}
export type Identity = ReturnType<typeof identity>;

/**
 * The members the operational acceptance setup accepted into the Workspace,
 * each with one column of the PRD permission matrix in a fresh Company.
 */
export const certificationMembers = {
  /** Programme manager: prepares the Case and attaches the signed PDFs. */
  manager: identity(
    'local-demonstration-user',
    'Ada Ionescu',
    'ada@example.test',
  ),
  /**
   * Auditor leading the audit team. He also holds the approver bundle, which
   * his link to the team overrides: he may neither review nor decide.
   */
  auditor: identity('responsible-colleague', 'Ion Popa', 'ion@example.test'),
  /** Approver outside the audit team. */
  approver: identity(
    'workspace-owner',
    'Workspace Owner',
    'owner@example.test',
  ),
  /** Certification reader without any command. */
  reader: identity(
    'commercial-readonly-member',
    'Commercial Reader',
    'commercial-reader@example.test',
  ),
};

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a synthetic response object.');
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected a non-empty response string.');
  return value;
}
export function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected a response list.');
  const rows: unknown[] = value;
  return rows.map(record);
}
function revision(value: unknown): number {
  const current = record(value).revision;
  if (typeof current !== 'number' || !Number.isSafeInteger(current))
    throw new Error('Expected a Case revision.');
  return current;
}

/** A calendar date moved by whole days, as the server computes it. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
/** A calendar date moved by whole months, kept within the target month. */
export function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}

/** The Certificate text the approver grants and the client agrees. */
export const CERTIFICATE_TEXT = {
  language: 'ro',
  holderName: 'Lactis Demo SRL',
  address: 'Str. Exemplu 1, Demo City',
  scope: 'Producerea laptelui pasteurizat (exemplu)',
};
/** The decision recorded on behalf of the fictional certification body. */
export const DECISION_FACTS = {
  decidedBy: 'Decision Maker Demo',
  decidedByFunction: 'Head of the fictional certification body',
  rationale: 'Fictional recommendation accepted after the dossier review.',
};

const DOSSIER_ITEMS = [
  'application',
  'application_review',
  'duration',
  'agreement',
  'team_approval',
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
  'participant_lists',
  'findings_follow_up',
  'recommendation',
  'certificate_data',
];
const CONFIRMED_FIELDS = [
  'initialOnSite',
  'stage1OnSite',
  'stage2OnSite',
  'surveillanceOnSite',
  'recertificationOnSite',
] as const;
const CONFIRMED = {
  noConsultancy: 'confirmed',
  noEmployment: 'confirmed',
  noManagementInvolvement: 'confirmed',
  confidentiality: 'confirmed',
};

/**
 * The fictional journey of PRD §20.1 for "Lactis Demo SRL", seeded through
 * the public API in a fresh Company, up to the team recommendation: every
 * member acts under its own grants and every PDF is the repository's
 * synthetic questionnaire. Business dates are relative to the server's date.
 */
export async function prepareCertificationJourney(
  request: APIRequestContext,
  suffix: string,
) {
  const { manager, auditor, approver, reader } = certificationMembers;
  const pdf = await readFile(
    fileURLToPath(
      new URL(
        '../../api/test-support/fixtures/questionnaire-demo.pdf',
        import.meta.url,
      ),
    ),
  );
  let companyId: string | null = null;

  function headers(member: Identity) {
    return {
      ...member,
      ...(companyId ? { 'x-company-context-id': companyId } : {}),
    };
  }
  function post(member: Identity, path: string, body: unknown) {
    return request.post(api + path, {
      headers: { ...headers(member), 'idempotency-key': randomUUID() },
      data: body,
    });
  }
  async function created(member: Identity, path: string, body: unknown) {
    const response = await post(member, path, body);
    expect(response.status(), `${path}: ${await response.text()}`).toBe(201);
    return record(await response.json());
  }
  async function read(member: Identity, path: string) {
    const response = await request.get(api + path, {
      headers: headers(member),
    });
    expect(response.status(), path).toBe(200);
    return record(await response.json());
  }
  async function membership(member: Identity) {
    const response = await request.get(api + '/access/current-actor', {
      headers: member,
    });
    expect(response.status()).toBe(200);
    return text(record(await response.json()).workspaceMembershipId);
  }

  const companyName = `Synthetic Certification Body DEMO ${suffix}`;
  companyId = text(
    (await created(approver, '/companies', { displayName: companyName })).id,
  );
  const memberships = new Map<Identity, string>();
  const bundles: [Identity, string[]][] = [
    [
      manager,
      [
        'context',
        'project',
        'director-client',
        'certification-reader',
        'certification-programme-manager',
        'document-registrar',
        'received-audit-source-access',
        'document-content-reader',
        'document-content-uploader',
        'document-approver',
      ],
    ],
    [
      auditor,
      [
        'context',
        'project',
        'director-client',
        'certification-reader',
        'certification-auditor',
        'certification-approver',
      ],
    ],
    [
      approver,
      [
        'context',
        'project',
        'director-client',
        'certification-reader',
        'certification-approver',
      ],
    ],
    [reader, ['context', 'project', 'director-client', 'certification-reader']],
  ];
  for (const [member, granted] of bundles) {
    const workspaceMembershipId = await membership(member);
    memberships.set(member, workspaceMembershipId);
    for (const bundle of granted) {
      const response = await request.post(
        `${api}/company-${bundle}-assignments`,
        {
          headers: { ...approver, 'idempotency-key': randomUUID() },
          data: { companyId, workspaceMembershipId },
        },
      );
      expect(response.status(), bundle).toBe(201);
    }
  }
  const auditorMembership = memberships.get(auditor);
  if (!auditorMembership) throw new Error('Missing the auditor membership.');

  const clientName = 'Lactis Demo';
  const clientId = text(
    (await created(manager, '/clients', { displayName: clientName })).id,
  );
  const entityId = text(
    record(
      (
        await created(manager, `/clients/${clientId}/legal-entities`, {
          expectedClientVersion: 1,
          legalName: 'Lactis Demo SRL',
          taxId: null,
          legalAddress: 'Str. Exemplu 1, Demo City',
        })
      ).legalEntity,
    ).id,
  );
  const projectTitle = 'Certification ISO 22000 — Lactis Demo';
  const projectId = text(
    (
      await created(manager, '/projects', {
        title: projectTitle,
        clientAccountId: clientId,
      })
    ).id,
  );
  const orderReference = `CERT-1154-${suffix}`;
  const opened = await created(
    manager,
    `/projects/${projectId}/certification-cases`,
    { clientLegalEntityId: entityId, orderReference },
  );
  const caseId = text(opened.id);
  const base = `/certification-cases/${caseId}`;
  // The server's business date, which a synthetic clock offset also moves.
  const today = text(opened.openedAt).slice(0, 10);

  /** Records a step on the Case revision this member reads just before. */
  async function step(member: Identity, path: string, body: object) {
    const current = revision(await read(member, base));
    return created(member, path, { expectedRevision: current, ...body });
  }
  /** Registers, uploads, designates and attaches one synthetic signed PDF. */
  async function attach(role: string, title: string) {
    const document = await created(manager, '/documents', {
      type: 'received-audit-source',
      clientId,
      title,
      purpose: 'Fictional signed original of the certification journey',
    });
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    const fileName = `${role.replace(/_/gu, '-')}.pdf`;
    const uploaded = await request.post(
      `${api}/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=${encodeURIComponent(fileName)}`,
      {
        headers: {
          ...headers(manager),
          'idempotency-key': randomUUID(),
          'content-type': 'application/pdf',
        },
        data: pdf,
      },
    );
    expect(uploaded.status(), title).toBe(201);
    const representationId = text(
      record(await uploaded.json()).representationId,
    );
    const designated = await post(
      manager,
      `/documents/${documentId}/versions/${versionId}/official-designation`,
      { expectedRevision: 2 },
    );
    expect([200, 201], title).toContain(designated.status());
    await step(manager, `${base}/documents`, {
      role,
      documentId,
      versionId,
      representationId,
    });
    const attached = records((await read(manager, `${base}/documents`)).items);
    return text(attached.find((item) => item.documentId === documentId)?.id);
  }
  function plan(
    attachmentId: string,
    dates: { start: string; end: string },
    onSiteDays: string,
  ) {
    return {
      startDate: dates.start,
      endDate: dates.end,
      onSiteDays,
      remoteDays: '0',
      objectives: 'Fictional audit objectives',
      scope: 'Production of pasteurised milk and yoghurt (fictional)',
      planAttachmentId: attachmentId,
      sentToClientOn: null,
      deviationNote: null,
    };
  }

  // Application, review and duration: one site, 40 employees, 2 HACCP
  // studies, food chain category C (subcategory CI).
  await step(manager, `${base}/application`, {
    facts: {
      declaredLegalName: 'Lactis Demo SRL',
      declaredAddress: 'Str. Exemplu 1, Demo City',
      sites: [
        { address: 'Str. Exemplu 1, Demo City', activity: 'Dairy plant' },
      ],
      requestedScope: 'Production of pasteurised milk and yoghurt (fictional)',
      foodChainSubcategories: ['CI'],
      haccpStudyCount: 2,
      totalHeadcount: 40,
      effectiveFte: 40,
      shiftCount: 1,
      seasonalActivity: null,
      otherCertifiedSystems: null,
      outsourcedProcesses: null,
      consultant: { used: false },
      auditLanguages: ['ro'],
      preferredAuditPeriod: null,
    },
  });
  await step(manager, `${base}/application-review`, {
    criteria: Object.fromEntries(
      [
        'scopeCertifiable',
        'competentTeamAvailable',
        'competentDecisionMakerAvailable',
        'risksAcceptable',
      ].map((criterion) => [
        criterion,
        { answer: 'yes', note: 'Checked on the fictional application.' },
      ]),
    ),
    outcome: 'accepted',
  });
  const inputs = {
    primary: 'CI',
    haccpStudies: { CI: 2 },
    increases: {},
    reductions: {},
  };
  const proposed = await post(manager, `${base}/duration-proposal`, inputs);
  expect(proposed.status()).toBe(200);
  const computed = record(await proposed.json());
  expect(computed.kind).toBe('proposal');
  const proposal = record(computed.proposal);
  // The computed duration, confirmed as proposed (rounded half up).
  const confirmed = Object.fromEntries(
    CONFIRMED_FIELDS.map((field) => [
      field,
      text(roundToHundredths(text(proposal[field]))),
    ]),
  );
  await step(manager, `${base}/duration`, { inputs, confirmed });
  const agreement = await attach('agreement', 'Signed certification agreement');
  await step(manager, `${base}/agreement`, {
    signedOn: addDays(today, -40),
    attachmentId: agreement,
  });

  // A team leader without category C and a technical expert holding it,
  // both declaring no conflict, approved by an approver outside the team.
  await step(manager, `${base}/team`, {
    members: [
      {
        name: 'Ion Popa',
        role: 'team_leader',
        workspaceMembershipId: auditorMembership,
        holdsCategory: false,
        competenceNote: 'Fictional ISO 22000 lead auditor without category C',
        declarations: CONFIRMED,
        conflictNote: null,
      },
      {
        name: 'Expert Demo',
        role: 'technical_expert',
        workspaceMembershipId: null,
        holdsCategory: true,
        competenceNote: 'Fictional dairy technologist holding category C',
        declarations: CONFIRMED,
        conflictNote: null,
      },
    ],
  });
  await step(approver, `${base}/team-decision`, {
    teamVersion: 1,
    decision: 'approved',
    independenceAttested: true,
  });

  // Stage 1: planned, one area of concern, reported "ready".
  const stage1 = { start: addDays(today, -30), end: addDays(today, -30) };
  await step(
    manager,
    `${base}/stages/stage-1/plan`,
    plan(
      await attach('plan', 'Stage 1 audit plan'),
      stage1,
      text(confirmed.stage1OnSite),
    ),
  );
  await step(auditor, `${base}/findings`, {
    stage: 'stage_1',
    classification: 'area_of_concern',
    clause: '7.5',
    area: 'Fictional document control',
    statement: 'Fictional obsolete form still available at the packing line.',
    evidenceAttachmentIds: [],
  });
  await step(auditor, `${base}/stages/stage-1/report`, {
    reportDate: stage1.end,
    documentReviewCompleted: true,
    conclusion: 'ready',
    conclusionNote: 'Ready for Stage 2; the area of concern stays visible.',
    reportAttachmentId: await attach('report', 'Stage 1 audit report'),
  });

  // Stage 2: one minor nonconformity on one PDF and one opportunity for
  // improvement; the auditor records the client's plan, judged adequate. Its
  // plan states 2 auditor-days over one calendar day with Ion Popa as the
  // only auditor on site, which the consistency check asks to clarify (R04).
  const stage2 = { start: addDays(today, -20), end: addDays(today, -20) };
  await step(
    manager,
    `${base}/stages/stage-2/plan`,
    plan(
      await attach('plan', 'Stage 2 audit plan'),
      stage2,
      text(confirmed.stage2OnSite),
    ),
  );
  const evidence = await attach('evidence', 'Fictional receiving record');
  await step(auditor, `${base}/findings`, {
    stage: 'stage_2',
    classification: 'minor_nonconformity',
    clause: '8.5.1',
    area: 'Fictional receiving of raw milk',
    statement:
      'Fictional hazard analysis does not cover allergens at receiving.',
    evidenceAttachmentIds: [evidence],
  });
  await step(auditor, `${base}/findings`, {
    stage: 'stage_2',
    classification: 'opportunity_for_improvement',
    clause: null,
    area: null,
    statement: 'Fictional suggestion: display the cleaning plan at the line.',
    evidenceAttachmentIds: [],
  });
  await step(auditor, `${base}/stages/stage-2/report`, {
    reportDate: stage2.end,
    summary: 'Fictional Stage 2 completed with one minor nonconformity.',
    reportAttachmentId: await attach('report', 'Stage 2 audit report'),
    certificationBodyApproval: null,
  });
  const minor = records((await read(auditor, base)).findings).find(
    (finding) =>
      finding.stage === 'stage_2' &&
      finding.classification === 'minor_nonconformity',
  );
  const minorPath = `${base}/findings/${text(minor?.id)}`;
  await step(auditor, `${minorPath}/response`, {
    correction: 'Fictional allergen added to the receiving hazard analysis.',
    cause: 'Fictional template omitted allergens.',
    correctiveAction: 'Fictional template revised and staff trained.',
    receivedOn: addDays(today, -10),
    plannedCompletionOn: null,
    evidenceAttachmentIds: [],
  });
  await step(auditor, `${minorPath}/plan-judgment`, {
    outcome: 'adequate',
    note: 'Fictional plan adequate.',
  });
  expect((await read(manager, base)).nextStep).toBe('recommendation');

  /** The decision body as the web sends it, here sent by another member. */
  function decision() {
    return {
      decision: 'granted',
      decidedOn: today,
      decidedBy: DECISION_FACTS.decidedBy,
      decidedByFunction: DECISION_FACTS.decidedByFunction,
      decisionFormAttachmentId: null,
      independenceAttested: true,
      grantedTexts: [CERTIFICATE_TEXT],
      rationale: DECISION_FACTS.rationale,
      additionalInformation: null,
    };
  }

  return {
    companyId,
    companyName,
    clientName,
    projectTitle,
    orderReference,
    caseId,
    base,
    today,
    read,
    post,
    step,
    attach,
    decision,
    /** The duration inputs and confirmed values of the first determination. */
    durationInputs: inputs,
    confirmedDuration: confirmed,
    /** The approver outside the team reviews a complete dossier. */
    async reviewDossier() {
      return step(approver, `${base}/dossier-review`, {
        items: Object.fromEntries(
          DOSSIER_ITEMS.map((item) => [
            item,
            {
              // No participant list is attached in this fictional dossier.
              answer:
                item === 'participant_lists' ? 'not_applicable' : 'present',
              note: null,
            },
          ]),
        ),
        conclusion: 'Fictional dossier complete; recommendation supported.',
        independenceAttested: true,
      });
    },
  };
}
