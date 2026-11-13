import {
  parseCertificateDraft,
  parseClientOpinion,
  parseDraftApproval,
} from './certification-release';
import { vi } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  CONFIRMED_DURATION_FIELDS,
  DURATION_RULE_VERSION,
  type DurationProposal,
  type DurationRefusal,
  type DurationWarning,
} from './certification-duration';
import type {
  DeclarationState,
  ImpartialityDeclaration,
} from './certification-team';

// Fictional identifiers and a fictional dairy; never real Client data.
export const certificationIds = {
  workspace: '11310000-0000-4000-8000-000000000001',
  company: '11310000-0000-4000-8000-000000000002',
  project: '11310000-0000-4000-8000-000000000003',
  client: '11310000-0000-4000-8000-000000000004',
  entity: '11310000-0000-4000-8000-000000000005',
  otherEntity: '11310000-0000-4000-8000-000000000006',
  member: '11310000-0000-4000-8000-000000000007',
  colleague: '11310000-0000-4000-8000-000000000008',
  /** A membership that is not active in the Workspace. */
  formerMember: '11310000-0000-4000-8000-000000000010',
};

/**
 * A Certification Reader, optionally Programme Manager, Approver and
 * Auditor, optionally with the Document rights to read this Client's received
 * audit source content.
 */
export function certificationActor({
  manager,
  documents = false,
  approver = false,
  auditor = false,
  administrator = false,
}: {
  manager: boolean;
  documents?: boolean;
  approver?: boolean;
  auditor?: boolean;
  /** Holds the Company administration right that assigns the bundles. */
  administrator?: boolean;
}): ActorContext {
  return {
    internalUserId: 'certification-person',
    workspaceMembershipId: certificationIds.member,
    workspaceId: certificationIds.workspace,
    workspaceName: 'Synthetic Certification Workspace',
    displayName: 'Ana Demo',
    email: 'ana@example.test',
    active: true,
    workspacePermissions: administrator ? ['company.assignment.manage'] : [],
    activeCompany: {
      id: certificationIds.company,
      displayName: 'Synthetic Certification Body',
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: 'client-grant',
      clientPermissionSetVersion: 'v1',
      projectPermissions: ['project.read'],
      projectPermissionAssignmentId: 'project-grant',
      projectPermissionSetVersion: 'v1',
      certificationReaderPermissions: ['certification.read'],
      certificationReaderAssignmentId: 'certification-reader-grant',
      certificationReaderPermissionSetVersion: 'v1',
      ...(manager
        ? {
            certificationProgrammeManagerPermissions: [
              'certification.programme.manage',
            ],
            certificationProgrammeManagerAssignmentId:
              'certification-manager-grant',
            certificationProgrammeManagerPermissionSetVersion: 'v1',
          }
        : {}),
      ...(approver
        ? {
            certificationApproverPermissions: ['certification.approve'],
            certificationApproverAssignmentId: 'certification-approver-grant',
            certificationApproverPermissionSetVersion: 'v1',
          }
        : {}),
      ...(auditor
        ? {
            certificationAuditorPermissions: ['certification.audit.record'],
            certificationAuditorAssignmentId: 'certification-auditor-grant',
            certificationAuditorPermissionSetVersion: 'v1',
          }
        : {}),
      ...(documents
        ? {
            documentPermissions: [
              'document.read',
              'document.reference.read',
              'document.content.read',
              'document.received_audit_source.access',
            ],
            documentPermissionAssignmentId: 'document-grant',
            documentPermissionSetVersion: 'v3',
            documentContentReaderAssignmentId: 'document-content-grant',
            documentContentReaderPermissionSetVersion: 'v1',
            receivedAuditSourceAccessAssignmentId:
              '11310000-0000-4000-8000-000000000009',
            receivedAuditSourceAccessPermissionSetVersion: 'v1',
            workingEvidenceContextCapture: `working-evidence-context.v1.${'c'.repeat(64)}`,
            workingEvidenceClientReadCapture: `working-evidence-client-read.v1.${'d'.repeat(64)}`,
          }
        : {}),
    },
  };
}

export const certificationIdentity: BrowserIdentity = {
  loaded: true,
  signedIn: true,
  getToken: async () => 'token',
  rejectSession: vi.fn(async () => undefined),
  signOut: async () => undefined,
  signedOutView: null,
};

/** The fictional dairy's declared application, as the server returns it. */
export function lactisFacts(overrides: Record<string, unknown> = {}) {
  return {
    submittedOn: null,
    declaredLegalName: 'Lactis Demo SRL',
    declaredAddress: 'Str. Exemplu 1, Demo City',
    sites: [{ address: 'Str. Exemplu 1, Demo City', activity: 'Dairy plant' }],
    requestedScope: 'Production of pasteurised milk and yoghurt',
    foodChainSubcategories: ['CI'],
    haccpStudyCount: 2,
    totalHeadcount: 40,
    effectiveFte: 37.5,
    shiftCount: 2,
    seasonalActivity: null,
    otherCertifiedSystems: null,
    outsourcedProcesses: 'Laboratory testing',
    consultant: { used: false },
    auditLanguages: ['ro'],
    preferredAuditPeriod: 'Second quarter',
    ...overrides,
  };
}

export function reviewCriteria(answer: 'yes' | 'no' = 'yes') {
  return {
    scopeCertifiable: { answer, note: 'Scope note' },
    competentTeamAvailable: { answer, note: 'Team note' },
    competentDecisionMakerAvailable: { answer, note: 'Decision maker note' },
    risksAcceptable: { answer, note: 'Risk note' },
  };
}

/** All four impartiality declarations confirmed. */
export const NO_CONFLICT = {
  noConsultancy: 'confirmed',
  noEmployment: 'confirmed',
  noManagementInvolvement: 'confirmed',
  confidentiality: 'confirmed',
} satisfies Record<ImpartialityDeclaration, DeclarationState>;

/** A fictional act recorded on behalf of the certification body. */
export function actedFor(overrides: Record<string, unknown> = {}) {
  return {
    actedBy: 'Head of Body Demo',
    actedByFunction: 'Head of the certification body',
    actedOn: '2026-11-03',
    formAttachmentId: null,
    ...overrides,
  };
}

/** One team member as the server records it: a leader holding the category. */
export function teamMember(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Elena Demo',
    role: 'team_leader',
    workspaceMembershipId: null,
    holdsCategory: true,
    competenceNote: 'ISO 22000 lead auditor, category C',
    declarations: NO_CONFLICT,
    conflictNote: null,
    ...overrides,
  };
}

/** A Stage plan as the server records it: one on-site day, as confirmed. */
export function stagePlan(
  planAttachmentId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    onSiteDays: '1',
    remoteDays: '0',
    objectives: 'Evaluate readiness of the food safety management system',
    scope: 'Production of pasteurised milk and yoghurt',
    planAttachmentId,
    sentToClientOn: '2026-11-03',
    deviationNote: null,
    ...overrides,
  };
}

/** A Stage 1 report as the server records it, concluding ready. */
export function stage1Report(
  reportAttachmentId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    reportDate: '2026-11-10',
    documentReviewCompleted: true,
    conclusion: 'ready',
    conclusionNote: 'Documented system implemented; ready for Stage 2.',
    reportAttachmentId,
    participantListAttachmentId: null,
    certificationBodyApproval: null,
    ...overrides,
  };
}

/** A Stage 2 report as the server records it. */
export function stage2Report(
  reportAttachmentId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    reportDate: '2026-11-21',
    summary: 'Stage 2 completed as planned.',
    reportAttachmentId,
    participantListAttachmentId: null,
    annexAttachmentId: null,
    certificationBodyApproval: null,
    ...overrides,
  };
}

/** A Finding statement as the server records it: a cited minor nonconformity. */
export function findingStatement(overrides: Record<string, unknown> = {}) {
  return {
    clause: '8.5.1',
    area: 'Receiving of raw milk',
    statement: 'Hazard analysis does not cover allergens at receiving.',
    evidenceAttachmentIds: [],
    ...overrides,
  };
}

/** The client's response to a nonconformity as the server records it. */
export function nonconformityResponse(overrides: Record<string, unknown> = {}) {
  return {
    correction: 'Allergen added to the receiving hazard analysis.',
    cause: 'The template omitted allergens.',
    correctiveAction: 'Template revised and staff trained.',
    receivedOn: '2026-11-12',
    plannedCompletionOn: null,
    evidenceAttachmentIds: [],
    ...overrides,
  };
}

/** The fictional dairy's Certificate texts in two languages. */
export const CERTIFICATE_TEXTS = [
  {
    language: 'ro',
    holderName: 'Lactis Demo SRL',
    address: 'Str. Exemplu 1, Demo City',
    scope: 'Producerea laptelui pasteurizat (exemplu)',
  },
  {
    language: 'en',
    holderName: 'Lactis Demo LLC',
    address: '1 Example Street, Demo City',
    scope: 'Production of pasteurised milk (example)',
  },
];

/** The dossier items an approver answers, in the server's order. */
export const DOSSIER_ITEM_NAMES = [
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

/**
 * A dossier review as the server records it: every item present except the
 * follow-up, not applicable without nonconformity, and the given item missing.
 */
export function dossierReview(missing?: string) {
  return {
    items: Object.fromEntries(
      DOSSIER_ITEM_NAMES.map((item) => [
        item,
        item === missing
          ? { answer: 'missing', note: 'Signed participant list not received.' }
          : {
              answer:
                item === 'findings_follow_up' ? 'not_applicable' : 'present',
              note: null,
            },
      ]),
    ),
    conclusion: 'Dossier complete; the recommendation is supported.',
    reviewedBy: null,
    approvedBy: null,
    independenceAttested: true,
  };
}

/** A granting Certification Decision as the server records it. */
export function certificationDecision(overrides: Record<string, unknown> = {}) {
  return {
    decision: 'granted',
    grantedTexts: CERTIFICATE_TEXTS,
    decidedOn: '2026-11-06',
    decidedBy: 'Decision Maker Demo',
    decidedByFunction: 'Head of the certification body',
    decisionFormAttachmentId: null,
    independenceAttested: true,
    rationale: 'Recommendation accepted after the dossier review.',
    additionalInformation: null,
    ...overrides,
  };
}

type Actor = { workspaceMembershipId: string; displayName: string };
const STAGE_STEPS = [
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
] as const;
/** The steps of the recommendation, review, decision and Certificate data. */
type DecisionStep =
  | 'recommendation'
  | 'dossier_review'
  | 'decision'
  | 'certificate_data'
  | 'certificate_draft'
  | 'client_opinion'
  | 'certificate_draft_approval';
type Step = {
  id: string;
  step:
    | 'application'
    | 'application_review'
    | 'duration'
    | 'agreement'
    | 'team'
    | 'team_decision'
    | (typeof STAGE_STEPS)[number]
    | DecisionStep;
  version: number;
  caseRevision: number;
  reason: string | null;
  recordedBy: Actor;
  recordedAt: string;
  value: Record<string, unknown>;
};
type FindingRecordKind =
  | 'statement'
  | 'classification'
  | 'response'
  | 'plan_judgment'
  | 'verification';
type StoredFindingRecord = {
  id: string;
  kind: FindingRecordKind;
  version: number;
  caseRevision: number;
  reason: string | null;
  recordedBy: Actor;
  recordedAt: string;
  value: Record<string, unknown>;
};
type StoredFinding = {
  id: string;
  stage: 'stage_1' | 'stage_2';
  sequence: number;
  records: StoredFindingRecord[];
};
type FindingUpdate =
  | 'correction'
  | 'classification'
  | 'reclassification'
  | 'response'
  | 'plan_judgment'
  | 'verification';
/** The later Finding version each command path records. */
const FINDING_UPDATES = new Map<string, FindingUpdate>([
  ['correction', 'correction'],
  ['classification', 'classification'],
  ['reclassification', 'reclassification'],
  ['response', 'response'],
  ['plan-judgment', 'plan_judgment'],
  ['verification', 'verification'],
]);
const FINDING_CLASSIFICATION_VALUES = [
  'major_nonconformity',
  'minor_nonconformity',
  'opportunity_for_improvement',
  'area_of_concern',
];
type StoredCertificate = {
  id: string;
  issuedOn: string | null;
  approvedDraftVersionId: string | null;
  number: string;
  validFrom: string;
  validUntil: string;
  firstSurveillanceBy: string;
  texts: unknown[];
  signedBy: string | null;
  signedByFunction: string | null;
  independenceAttested: boolean;
  attachmentId: string;
  recordedBy: Actor;
  recordedAt: string;
};
type StoredCase = {
  id: string;
  orderReference: string;
  entity: { id: string; legalName: string };
  status: 'open' | 'rejected' | 'refused' | 'certified';
  revision: number;
  openedAt: string;
  openedBy: Actor;
  steps: Step[];
  attachments: StoredAttachment[];
  findings: StoredFinding[];
  certificate: StoredCertificate | null;
  certificateRevisions: Record<string, unknown>[];
  /** The consistency section's Discrepancies, seeded or recorded. */
  consistency: {
    open: Record<string, unknown>[];
    resolved: Record<string, unknown>[];
  };
  /** The exchange register: its records, seeded deadline states and items. */
  exchanges: {
    records: { sequence: number; versions: Record<string, unknown>[] }[];
    entries: Record<string, unknown>[];
    items: Record<string, unknown>[];
  };
};
/** A frozen received PDF of the Case's Client, with its exact bytes. */
export type FakeSource = {
  documentId: string;
  versionId: string;
  versionNumber: number;
  representationId: string;
  sourceTitle: string;
  fileName: string;
  bytes: Uint8Array<ArrayBuffer>;
  sha256: string;
};
type StoredAttachment = {
  id: string;
  caseRevision: number;
  role: string;
  documentId: string;
  versionId: string;
  representationId: string;
  versionNumber: number;
  sourceTitle: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  note: string | null;
  attachedBy: Actor;
  attachedAt: string;
};
export type RecordedRequest = {
  method: string;
  path: string;
  /** The query string, with its leading `?`, or empty. */
  search: string;
  key: string | null;
  contentType: string | null;
  company: string | null;
  body: unknown;
};

const me: Actor = {
  workspaceMembershipId: certificationIds.member,
  displayName: 'Ana Demo',
};
export const colleague: Actor = {
  workspaceMembershipId: certificationIds.colleague,
  displayName: 'Boris Demo',
};

/**
 * An in-memory stand-in for the Certification REST contract: revisions,
 * step order, exact replay and the documented refusal codes.
 */
export class FakeCertificationServer {
  readonly requests: RecordedRequest[] = [];
  readonly cases = new Map<string, StoredCase>();
  /** Replaces the next matching request's handling once. */
  readonly interceptions: {
    match: (request: RecordedRequest) => boolean;
    respond: () => Response | Promise<Response>;
  }[] = [];
  private readonly receipts = new Map<
    string,
    { body: string; response: unknown }
  >();
  private clock = Date.parse('2026-11-07T08:00:00.000Z');
  private sequence = 0;
  /** The Company's procedure deadline set versions, latest first. */
  readonly deadlineSets: Record<string, unknown>[] = [];
  /** The Client's frozen received PDFs, newest first like the server. */
  readonly sources: FakeSource[] = [];
  /** Whether the actor holds the Document rights the server rechecks. */
  documentAccess = true;

  readonly actor: () => unknown;
  readonly projectId: string;
  readonly companyId: string;

  constructor({
    actor = () => certificationActor({ manager: true }),
    projectId = certificationIds.project,
    companyId = certificationIds.company,
  }: {
    actor?: () => unknown;
    projectId?: string;
    companyId?: string;
  } = {}) {
    this.actor = actor;
    this.projectId = projectId;
    this.companyId = companyId;
  }

  install() {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        this.fetch(input, init),
      ),
    );
  }

  /** A received PDF registered, uploaded and designated in Documents. */
  addSource(sourceTitle: string, versionNumber = 1): FakeSource {
    const number = String(++this.sequence).padStart(2, '0');
    const bytes = new TextEncoder().encode(
      `%PDF-1.4\n% Fictional ${sourceTitle}, version ${versionNumber}\n%%EOF\n`,
    );
    const source: FakeSource = {
      documentId: `11310000-0000-4000-8000-3000000000${number}`,
      versionId: `11310000-0000-4000-8000-4000000000${number}`,
      versionNumber,
      representationId: `11310000-0000-4000-8000-5000000000${number}`,
      sourceTitle,
      fileName: `${sourceTitle.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}.pdf`,
      bytes,
      sha256: sha256Hex(bytes),
    };
    this.sources.unshift(source);
    return source;
  }

  /** A colleague attaches a PDF, making any earlier expected revision stale. */
  attachAsColleague(
    caseId: string,
    source: FakeSource,
    role: string,
    note: string | null = null,
  ): string {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    return this.attach(stored, source, role, note, colleague).id;
  }

  /** A colleague records the agreement on an attached signed original. */
  recordAgreementAsColleague(
    caseId: string,
    signedOn: string,
    attachmentId: string,
  ) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    this.append(
      stored,
      'agreement',
      { signedOn, attachmentId },
      null,
      colleague,
    );
  }

  /** Commands only: the duration proposal is a read sent as a POST. */
  mutations() {
    return this.requests.filter(
      (request) =>
        request.method === 'POST' &&
        !request.path.endsWith('/duration-proposal'),
    );
  }

  proposalReads() {
    return this.requests.filter((request) =>
      request.path.endsWith('/duration-proposal'),
    );
  }

  /**
   * Seeds a Case, optionally with a colleague's application (with `facts`
   * overriding the fictional dairy's), its accepted review, a duration
   * confirmed as proposed and an agreement on an attached signed original.
   */
  seed({
    orderReference = 'CERT-SEED',
    application = false,
    facts = {},
    accepted = false,
    duration = false,
    agreement = false,
  }: {
    orderReference?: string;
    application?: boolean;
    facts?: Record<string, unknown>;
    accepted?: boolean;
    duration?: boolean;
    agreement?: boolean;
  } = {}): string {
    const stored = this.create(orderReference, colleague);
    if (application || accepted || duration || agreement)
      this.append(stored, 'application', lactisFacts(facts), null, colleague);
    if (accepted || duration || agreement)
      this.append(
        stored,
        'application_review',
        {
          criteria: reviewCriteria('yes'),
          outcome: 'accepted',
          rejectionReason: null,
        },
        null,
        colleague,
      );
    if (duration || agreement) this.confirmDurationAsColleague(stored.id);
    if (agreement) {
      const signed = this.addSource(`Signed agreement ${orderReference}`);
      const attached = this.attach(
        stored,
        signed,
        'agreement',
        null,
        colleague,
      );
      this.append(
        stored,
        'agreement',
        { signedOn: '2026-11-02', attachmentId: attached.id },
        null,
        colleague,
      );
    }
    return stored.id;
  }

  /**
   * A colleague proposes a team version, optionally with its impartiality
   * analysis, making earlier revisions stale.
   */
  proposeTeamAsColleague(
    caseId: string,
    members: Record<string, unknown>[],
    reason: string | null = null,
    impartialityAnalysis: Record<string, unknown> | null = null,
  ) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    this.append(
      stored,
      'team',
      { members, impartialityAnalysis },
      reason,
      colleague,
    );
  }

  /** A colleague approver decides on the latest team version. */
  decideTeamAsColleague(
    caseId: string,
    decision: 'approved' | 'returned',
    reason: string | null = null,
  ) {
    const stored = this.cases.get(caseId);
    const team = stored && latestStep(stored, 'team');
    if (!stored || !team) throw new Error('Unknown team');
    this.append(
      stored,
      'team_decision',
      { teamVersion: team.version, decision, reason },
      null,
      colleague,
    );
  }

  /**
   * Seeds an agreed Case whose team, led by the given membership (or by an
   * unlinked person), a colleague approver approved: Stage 1 is next, at
   * revision 8.
   */
  seedApprovedTeam({
    orderReference,
    leader = null,
  }: {
    orderReference: string;
    leader?: string | null;
  }): string {
    const caseId = this.seed({ orderReference, agreement: true });
    this.proposeTeamAsColleague(caseId, [
      teamMember({ workspaceMembershipId: leader }),
      teamMember({
        name: 'Ion Demo',
        role: 'auditor',
        holdsCategory: false,
        competenceNote: 'ISO 22000 auditor',
      }),
    ]);
    this.decideTeamAsColleague(caseId, 'approved');
    return caseId;
  }

  /** A colleague records a Stage plan or report version. */
  recordStageAsColleague(
    caseId: string,
    step: (typeof STAGE_STEPS)[number],
    value: Record<string, unknown>,
    reason: string | null = null,
  ) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    this.append(stored, step, value, reason, colleague);
  }

  /**
   * A colleague records a recommendation, dossier review, decision or
   * Certificate data version; a refusing decision closes the Case.
   */
  recordStepAsColleague(
    caseId: string,
    step: DecisionStep,
    value: Record<string, unknown>,
    reason: string | null = null,
  ) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    this.append(stored, step, value, reason, colleague);
    if (step === 'decision' && value.decision === 'refused')
      stored.status = 'refused';
  }

  /** A colleague approver records the Certificate, certifying the Case. */
  recordCertificateAsColleague(
    caseId: string,
    {
      number,
      attachmentId,
      signedBy = null,
      signedByFunction = null,
      independenceAttested = true,
    }: {
      number: string;
      attachmentId: string;
      signedBy?: string | null;
      signedByFunction?: string | null;
      /** False for a Certificate recorded before the attestation was stored. */
      independenceAttested?: boolean;
    },
  ) {
    const stored = this.cases.get(caseId);
    const decided = stored && latestStep(stored, 'decision');
    const agreed = stored && latestStep(stored, 'certificate_data');
    if (!stored || !decided || !agreed) throw new Error('Not decided');
    this.issue(
      stored,
      String(decided.value.decidedOn),
      {
        number,
        attachmentId,
        signedBy,
        signedByFunction,
        independenceAttested,
        texts: list(agreed.value.texts),
      },
      colleague,
    );
  }

  /**
   * A colleague team leader records a Finding with its first statement and
   * classification at one revision; returns the Finding's id.
   */
  recordFindingAsColleague(
    caseId: string,
    {
      stage,
      classification,
      statement = findingStatement(),
    }: {
      stage: 'stage_1' | 'stage_2';
      classification: string;
      statement?: Record<string, unknown>;
    },
  ): string {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    return this.addFinding(stored, stage, classification, statement, colleague)
      .id;
  }

  /**
   * A later Finding version recorded by a colleague: a corrected statement,
   * a classification by the team leader or approver, a response, a plan
   * judgment or a verification.
   */
  recordFindingUpdateAsColleague(
    caseId: string,
    findingId: string,
    kind: FindingRecordKind,
    value: Record<string, unknown>,
    reason: string | null = null,
  ) {
    const stored = this.cases.get(caseId);
    const found = stored?.findings.find((entry) => entry.id === findingId);
    if (!stored || !found) throw new Error('Unknown Finding');
    stored.revision += 1;
    this.addFindingRecord(
      found,
      kind,
      value,
      reason,
      stored.revision,
      colleague,
    );
  }

  /**
   * A colleague confirms the proposal for CI with every declared study and no
   * factor, optionally on behalf of the certification body, making any
   * earlier expected revision stale.
   */
  confirmDurationAsColleague(
    caseId: string,
    reason: string | null = null,
    onBehalf: Record<string, unknown> | null = null,
  ) {
    const stored = this.cases.get(caseId);
    const application = stored && latestStep(stored, 'application');
    if (!stored || !application) throw new Error('Unknown Case');
    const facts = applicationFactsOf(application.value);
    const factors: DurationFactors = {
      primary: 'CI',
      haccpStudies: { CI: facts.haccpStudyCount },
      increases: {},
      reductions: {},
    };
    const result = computeDuration(facts, factors);
    if (result.kind !== 'proposal') throw new Error('Seed needs a proposal');
    this.append(
      stored,
      'duration',
      {
        ruleVersion: DURATION_RULE_VERSION,
        inputs: {
          ...factors,
          subcategories: facts.foodChainSubcategories,
          effectiveFte: facts.effectiveFte,
        },
        computation: result,
        confirmed: Object.fromEntries(
          CONFIRMED_DURATION_FIELDS.map((field) => [
            field,
            centsText(roundedCents(result.proposal[field])),
          ]),
        ),
        justification: null,
        onBehalf,
      },
      reason,
      colleague,
    );
  }

  /** A colleague's correction, making any earlier expected revision stale. */
  correctAsColleague(caseId: string, reason: string) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    this.append(
      stored,
      'application',
      lactisFacts({ totalHeadcount: 42 }),
      reason,
      colleague,
    );
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(String(input), 'http://localhost');
    const headers = new Headers(init?.headers);
    const request: RecordedRequest = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.search,
      key: headers.get('idempotency-key'),
      contentType: headers.get('content-type'),
      company: headers.get('x-company-context-id'),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    this.requests.push(request);
    const index = this.interceptions.findIndex((entry) => entry.match(request));
    if (index >= 0) {
      const [interception] = this.interceptions.splice(index, 1);
      if (interception) return interception.respond();
    }
    if (request.path === '/api/access/current-actor')
      return Response.json(this.actor());
    if (request.path === '/api/certification-procedure-deadlines')
      return this.deadlines(request);
    const rawBody = typeof init?.body === 'string' ? init.body : '';
    if (request.method === 'POST' && request.key) {
      const receipt = this.receipts.get(`${request.path}:${request.key}`);
      if (receipt)
        return receipt.body === rawBody
          ? Response.json(receipt.response, { status: 201 })
          : refusal(409, 'IDEMPOTENCY_CONFLICT');
    }
    const response = this.route(request);
    if (request.method === 'POST' && request.key && response.status === 201)
      this.receipts.set(`${request.path}:${request.key}`, {
        body: rawBody,
        response: await response.clone().json(),
      });
    return response;
  }

  private route(request: RecordedRequest): Response {
    const projectPath = `/api/projects/${this.projectId}`;
    if (request.path === `${projectPath}/certification-cases`) {
      if (request.method === 'POST') return this.open(request.body);
      const cases = [...this.cases.values()]
        .reverse()
        .map((stored) => this.summary(stored));
      return Response.json({
        projectId: this.projectId,
        cases,
        total: cases.length,
      });
    }
    if (request.path === `${projectPath}/certification-legal-entities`)
      return Response.json({
        projectId: this.projectId,
        items: [
          {
            id: certificationIds.entity,
            legalName: 'Lactis Demo SRL',
            taxId: 'RO-DEMO-1',
          },
          {
            id: certificationIds.otherEntity,
            legalName: 'Lactis Demo Logistics SRL',
            taxId: null,
          },
        ],
      });
    const content =
      /^\/api\/certification-cases\/([^/]+)\/documents\/([^/]+)\/content$/u.exec(
        request.path,
      );
    if (content) return this.content(content[1], content[2]);
    const register = /^\/api\/certification-cases\/([^/]+)\/register$/u.exec(
      request.path,
    );
    if (register) return this.register(register[1], request.search);
    const registerPath =
      /^\/api\/certification-cases\/([^/]+)\/(exchanges|reverification-items)(?:\/([^/]+)(\/withdrawal)?)?$/u.exec(
        request.path,
      );
    if (registerPath) {
      const staged = registerPath[1]
        ? this.cases.get(registerPath[1])
        : undefined;
      if (!staged) return new Response(null, { status: 404 });
      const [, , collection, target, withdrawal] = registerPath;
      if (
        collection === 'exchanges' &&
        target === undefined &&
        request.method === 'GET'
      ) {
        const cursor = new URLSearchParams(request.search).get('cursor') ?? '';
        const [caseId, revision, before] = cursor.split(':');
        if (caseId !== staged.id)
          return refusal(400, 'INVALID_CERTIFICATION_INPUT');
        if (Number(revision) !== staged.revision)
          return refusal(409, 'CERTIFICATION_STALE');
        const remaining = staged.exchanges.records
          .filter((entry) => entry.sequence < Number(before))
          .sort((left, right) => right.sequence - left.sequence);
        const selected = remaining.slice(0, 200);
        const last = selected.at(-1);
        return Response.json({
          records: selected.map((entry) => ({
            ...entry,
            current: entry.versions.at(-1),
          })),
          total: staged.exchanges.records.length,
          nextCursor:
            remaining.length > 200 && last
              ? `${staged.id}:${staged.revision}:${last.sequence}`
              : null,
        });
      }
      if (request.method !== 'POST') return new Response(null, { status: 404 });
      if (collection === 'exchanges' && withdrawal === undefined)
        return this.recordExchange(staged, request.body, target);
      if (collection === 'reverification-items' && target === undefined)
        return this.addItem(staged, request.body);
      if (
        collection === 'reverification-items' &&
        target !== undefined &&
        withdrawal
      )
        return this.withdrawItem(staged, target, request.body);
      return new Response(null, { status: 404 });
    }
    const stage =
      /^\/api\/certification-cases\/([^/]+)\/stages\/([^/]+)\/(plan|report)$/u.exec(
        request.path,
      );
    const findingPath =
      /^\/api\/certification-cases\/([^/]+)\/findings(?:\/([^/]+)\/([^/]+))?$/u.exec(
        request.path,
      );
    if (findingPath) {
      const staged = findingPath[1]
        ? this.cases.get(findingPath[1])
        : undefined;
      if (!staged || request.method !== 'POST')
        return new Response(null, { status: 404 });
      const [, , findingId, update] = findingPath;
      if (findingId === undefined || update === undefined)
        return this.recordFinding(staged, request.body);
      const kind = FINDING_UPDATES.get(update);
      if (!kind) return new Response(null, { status: 404 });
      return this.updateFinding(staged, findingId, kind, request.body);
    }
    if (stage) {
      const staged = stage[1] ? this.cases.get(stage[1]) : undefined;
      const which =
        stage[2] === 'stage-1'
          ? 'stage_1'
          : stage[2] === 'stage-2'
            ? 'stage_2'
            : undefined;
      if (!staged || !which || request.method !== 'POST')
        return new Response(null, { status: 404 });
      return stage[3] === 'plan'
        ? this.planStage(staged, which, request.body)
        : this.reportStage(staged, which, request.body);
    }
    const match =
      /^\/api\/certification-cases\/([^/]+)(\/timeline|\/application|\/application-review|\/duration-proposal|\/duration|\/documents|\/eligible-documents|\/agreement|\/team|\/team-decision|\/recommendation|\/dossier-review|\/decision|\/certificate-data|\/certificate|\/certificate-revisions|\/certificate-draft|\/client-opinion|\/certificate-draft-approval|\/discrepancies|\/discrepancy-resolutions)?$/u.exec(
        request.path,
      );
    const stored = match?.[1] ? this.cases.get(match[1]) : undefined;
    if (!match || !stored) return new Response(null, { status: 404 });
    switch (match[2]) {
      case undefined:
        return Response.json(this.detail(stored));
      case '/timeline':
        return Response.json({ caseId: stored.id, entries: stored.steps });
      case '/application':
        return this.recordApplication(stored, request.body);
      case '/application-review':
        return this.review(stored, request.body);
      case '/duration-proposal':
        return this.proposeDuration(stored, request.body);
      case '/duration':
        return this.confirmDuration(stored, request.body);
      case '/documents':
        return request.method === 'POST'
          ? this.attachDocument(stored, request.body)
          : Response.json({ caseId: stored.id, items: stored.attachments });
      case '/eligible-documents':
        if (!this.documentAccess) return new Response(null, { status: 403 });
        return Response.json({
          caseId: stored.id,
          items: this.sources.slice(0, 25).map((source) => ({
            documentId: source.documentId,
            versionId: source.versionId,
            versionNumber: source.versionNumber,
            representationId: source.representationId,
            sourceTitle: source.sourceTitle,
          })),
          truncated: this.sources.length > 25,
        });
      case '/agreement':
        return this.recordAgreement(stored, request.body);
      case '/team':
        return this.proposeTeam(stored, request.body);
      case '/team-decision':
        return this.decideTeam(stored, request.body);
      case '/recommendation':
        return this.recommend(stored, request.body);
      case '/dossier-review':
        return this.reviewDossier(stored, request.body);
      case '/decision':
        return this.decide(stored, request.body);
      case '/certificate-data':
        return this.agreeCertificateData(stored, request.body);
      case '/certificate-revisions':
        return this.reviseCertificate(stored, request.body);
      case '/certificate-draft':
        return this.recordRelease(stored, 'certificate_draft', request.body);
      case '/client-opinion':
        return this.recordRelease(stored, 'client_opinion', request.body);
      case '/certificate-draft-approval':
        return this.recordRelease(
          stored,
          'certificate_draft_approval',
          request.body,
        );
      case '/certificate':
        return this.recordCertificate(stored, request.body);
      case '/discrepancies':
        return this.recordDiscrepancy(stored, request.body);
      case '/discrepancy-resolutions':
        return this.resolveDiscrepancy(stored, request.body);
      default:
        return new Response(null, { status: 404 });
    }
  }

  /**
   * The server's checks, in its order: the auditor grant, the input, the
   * revision, the leader of the approved team, the Stage 2 report, no
   * blocking Finding, no decision, the reason, then an unchanged correction.
   */
  private recommend(stored: StoredCase, body: unknown): Response {
    if (!holdsAuditor(this.actor())) return new Response(null, { status: 403 });
    const {
      expectedRevision,
      reason,
      recommendation,
      basis,
      recommendedOn = null,
      ...rest
    } = record(body);
    if (
      Object.keys(rest).length > 0 ||
      typeof expectedRevision !== 'number' ||
      (recommendation !== 'grant' &&
        recommendation !== 'do_not_grant' &&
        recommendation !== 'additional_audit') ||
      !bounded(basis, 4000) ||
      !(recommendedOn === null || calendarDate(recommendedOn)) ||
      !optionalText(reason)
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    const closed = this.lockOpen(stored, expectedRevision);
    if (closed) return closed;
    if (!this.leads(stored))
      return refusal(409, 'CERTIFICATION_NOT_TEAM_LEADER');
    if (!latestStep(stored, 'stage_2_report'))
      return refusal(409, 'CERTIFICATION_STAGE_2_NOT_REPORTED');
    if (
      stored.findings.some((finding) =>
        findingBlocks(this.findingView(stored, finding)),
      )
    )
      return refusal(409, 'CERTIFICATION_FINDINGS_OPEN');
    if (latestStep(stored, 'decision'))
      return refusal(409, 'CERTIFICATION_DECIDED');
    return this.appendStage(
      stored,
      'recommendation',
      { recommendation, basis, recommendedOn },
      reason,
    );
  }

  /**
   * The server's checks, in its order: the approver grant, every item
   * answered, the revision, independence, the attestation, the acting
   * persons outside every team version and their signed forms, a
   * recommendation, no decision.
   */
  private reviewDossier(stored: StoredCase, body: unknown): Response {
    if (!holdsApprover(this.actor()))
      return new Response(null, { status: 403 });
    const {
      expectedRevision,
      reason,
      items,
      conclusion,
      reviewedBy = null,
      approvedBy = null,
      independenceAttested,
      ...rest
    } = record(body);
    const answers = record(items);
    const valid = DOSSIER_ITEM_NAMES.every((item) => {
      const entry = answers[item];
      if (!entry || typeof entry !== 'object') return false;
      const { answer, note = null } = record(entry);
      return (
        (answer === 'present' ||
          answer === 'missing' ||
          answer === 'not_applicable') &&
        (note === null || bounded(note, 1000)) &&
        (answer !== 'missing' || note !== null)
      );
    });
    if (
      Object.keys(rest).length > 0 ||
      Object.keys(answers).length !== DOSSIER_ITEM_NAMES.length ||
      !valid ||
      typeof expectedRevision !== 'number' ||
      !bounded(conclusion, 4000) ||
      !actingInput(reviewedBy) ||
      !actingInput(approvedBy) ||
      !optionalText(reason)
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    const closed = this.lockOpen(stored, expectedRevision);
    if (closed) return closed;
    if (this.onTeam(stored)) return refusal(409, 'CERTIFICATION_INDEPENDENCE');
    if (independenceAttested !== true)
      return refusal(400, 'CERTIFICATION_INDEPENDENCE_ATTESTATION');
    for (const act of [reviewedBy, approvedBy]) {
      const refused = this.actingRefusal(stored, act);
      if (refused) return refused;
    }
    if (!latestStep(stored, 'recommendation'))
      return refusal(409, 'CERTIFICATION_RECOMMENDATION_MISSING');
    if (latestStep(stored, 'decision'))
      return refusal(409, 'CERTIFICATION_DECIDED');
    return this.appendStage(
      stored,
      'dossier_review',
      {
        items: Object.fromEntries(
          DOSSIER_ITEM_NAMES.map((item) => {
            const { answer, note = null } = record(answers[item]);
            return [item, { answer, note }];
          }),
        ),
        conclusion,
        reviewedBy,
        approvedBy,
        independenceAttested: true,
      },
      reason,
    );
  }

  /**
   * An act on behalf of the certification body by a person named on no
   * team version, citing a signed form attached to the Case, or nothing.
   */
  private actingRefusal(stored: StoredCase, act: unknown): Response | null {
    if (act === null || act === undefined) return null;
    const { actedBy, formAttachmentId } = record(act);
    if (this.namedOnAnyTeam(stored, actedBy))
      return refusal(409, 'CERTIFICATION_INDEPENDENCE');
    if (
      formAttachmentId !== null &&
      formAttachmentId !== undefined &&
      !stored.attachments.some((item) => item.id === formAttachmentId)
    )
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    return null;
  }

  /** Whether a name is the name of a member of any team version. */
  private namedOnAnyTeam(stored: StoredCase, name: unknown): boolean {
    return stored.steps.some(
      (step) =>
        step.step === 'team' &&
        list(step.value.members).some(
          (member) => normalName(record(member).name) === normalName(name),
        ),
    );
  }

  /**
   * The server's checks, in its order: the approver grant, the attestation,
   * the input, the revision, independence, an outcome a correction keeps,
   * the decision maker outside the approved team, the form's role, every
   * precondition, the reason, then an unchanged correction.
   */
  private decide(stored: StoredCase, body: unknown): Response {
    if (!holdsApprover(this.actor()))
      return new Response(null, { status: 403 });
    const {
      expectedRevision,
      reason,
      decision,
      grantedTexts = null,
      decidedOn,
      decidedBy,
      decidedByFunction = null,
      decisionFormAttachmentId = null,
      independenceAttested,
      rationale,
      additionalInformation = null,
      ...rest
    } = record(body);
    if (independenceAttested !== true)
      return refusal(400, 'CERTIFICATION_INDEPENDENCE_ATTESTATION');
    const texts = grantedTexts === null ? null : certificateTexts(grantedTexts);
    if (
      Object.keys(rest).length > 0 ||
      typeof expectedRevision !== 'number' ||
      !(
        (decision === 'granted' && texts !== null && texts !== undefined) ||
        (decision === 'refused' && grantedTexts === null)
      ) ||
      !calendarDate(decidedOn) ||
      !bounded(decidedBy, 200) ||
      !(decidedByFunction === null || bounded(decidedByFunction, 200)) ||
      !(
        decisionFormAttachmentId === null || nonblank(decisionFormAttachmentId)
      ) ||
      !bounded(rationale, 4000) ||
      !(additionalInformation === null || bounded(additionalInformation, 4000))
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    const closed =
      ['refused', 'certified'].includes(stored.status) &&
      expectedRevision === stored.revision
        ? undefined
        : this.lockOpen(stored, expectedRevision);
    if (closed) return closed;
    if (this.onTeam(stored)) return refusal(409, 'CERTIFICATION_INDEPENDENCE');
    const previous = latestStep(stored, 'decision');
    if (previous && previous.value.decision !== decision)
      return refusal(409, 'CERTIFICATION_DECISION_OUTCOME_FIXED');
    if (this.namesTeamMember(stored, decidedBy))
      return refusal(409, 'CERTIFICATION_INDEPENDENCE');
    if (
      decisionFormAttachmentId !== null &&
      !this.hasAttachment(stored, decisionFormAttachmentId, ['decision_form'])
    )
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    const failures = this.decisionFailures(stored, decision, decidedOn);
    if (failures.length > 0)
      return Response.json(
        {
          code: 'CERTIFICATION_DECISION_PRECONDITIONS',
          message: 'The Certification Decision preconditions do not hold.',
          failures,
        },
        { status: 409 },
      );
    const value = {
      decision,
      grantedTexts: texts,
      decidedOn,
      decidedBy,
      decidedByFunction,
      decisionFormAttachmentId,
      independenceAttested: true,
      rationale,
      additionalInformation,
    };
    if (stored.status === 'certified') {
      if (
        !previous ||
        !sameValue(
          { ...previous.value, grantedTexts: null },
          { ...value, grantedTexts: null },
        )
      )
        return refusal(409, 'CERTIFICATION_ISSUED_DECISION_FIXED');
      const agreed = latestStep(stored, 'certificate_data');
      if (!agreed || !sameTexts(list(agreed.value.texts), list(texts)))
        return refusal(409, 'CERTIFICATION_CERTIFICATE_DATA_DIFFERS');
    }
    const stated = nonblank(reason) ? reason : null;
    if (!previous !== (stated === null))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    if (previous && sameValue(previous.value, value))
      return refusal(409, 'CERTIFICATION_CORRECTION_UNCHANGED');
    this.append(stored, 'decision', value, stated, me);
    if (decision === 'refused') stored.status = 'refused';
    return Response.json(this.detail(stored), { status: 201 });
  }

  /**
   * The server's checks, in its order: the programme manager grant, the
   * input, the revision, the Stage 2 report, the form's role, the reason,
   * then an unchanged correction.
   */
  private agreeCertificateData(stored: StoredCase, body: unknown): Response {
    if (!holdsManager(this.actor())) return new Response(null, { status: 403 });
    const {
      expectedRevision,
      reason,
      texts,
      agreedOn,
      agreementAttachmentId,
      ...rest
    } = record(body);
    const agreed = certificateTexts(texts);
    if (
      Object.keys(rest).length > 0 ||
      typeof expectedRevision !== 'number' ||
      !agreed ||
      !calendarDate(agreedOn) ||
      !nonblank(agreementAttachmentId) ||
      !optionalText(reason)
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    const closed = this.lockOpen(stored, expectedRevision, [
      'open',
      'certified',
    ]);
    if (closed) return closed;
    if (!latestStep(stored, 'stage_2_report'))
      return refusal(409, 'CERTIFICATION_STAGE_2_NOT_REPORTED');
    if (
      !this.hasAttachment(stored, agreementAttachmentId, ['certificate_data'])
    )
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    return this.appendStage(
      stored,
      'certificate_data',
      { texts: agreed, agreedOn, agreementAttachmentId },
      reason,
    );
  }

  /**
   * The server's checks, in its order: the approver grant, the attestation,
   * the input, the revision, independence, a granting decision, the agreed
   * data stating exactly what it grants, the signatory, the PDF's role and
   * a number unused in the Company.
   */
  private recordCertificate(stored: StoredCase, body: unknown): Response {
    if (!holdsApprover(this.actor()))
      return new Response(null, { status: 403 });
    const {
      expectedRevision,
      number,
      issuedOn,
      attachmentId,
      signedBy = null,
      signedByFunction = null,
      independenceAttested,
      ...rest
    } = record(body);
    if (independenceAttested !== true)
      return refusal(400, 'CERTIFICATION_INDEPENDENCE_ATTESTATION');
    if (
      Object.keys(rest).length > 0 ||
      typeof expectedRevision !== 'number' ||
      !bounded(number, 64) ||
      !calendarDate(issuedOn) ||
      !nonblank(attachmentId) ||
      !(signedBy === null || bounded(signedBy, 200)) ||
      !(signedByFunction === null || bounded(signedByFunction, 200))
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    const closed = this.lockOpen(stored, expectedRevision);
    if (closed) return closed;
    if (this.onTeam(stored)) return refusal(409, 'CERTIFICATION_INDEPENDENCE');
    const decided = latestStep(stored, 'decision');
    if (decided?.value.decision !== 'granted')
      return refusal(409, 'CERTIFICATION_NOT_GRANTED');
    const release = this.release(stored);
    if (release.issuanceBlockers.length)
      return refusal(409, 'CERTIFICATION_CERTIFICATE_APPROVAL_REQUIRED');
    const draft = latestStep(stored, 'certificate_draft');
    if (draft?.value.number !== number)
      return refusal(409, 'CERTIFICATION_CERTIFICATE_NUMBER_DIFFERS');
    if (
      !calendarDate(issuedOn) ||
      issuedOn < String(decided.value.decidedOn) ||
      issuedOn > this.latestBusinessDate()
    )
      return refusal(409, 'CERTIFICATION_CERTIFICATE_ISSUE_DATE');
    const agreed = latestStep(stored, 'certificate_data');
    if (!agreed) return refusal(409, 'CERTIFICATION_CERTIFICATE_DATA_MISSING');
    const texts = list(agreed.value.texts);
    if (!sameTexts(texts, list(decided.value.grantedTexts)))
      return refusal(409, 'CERTIFICATION_CERTIFICATE_DATA_DIFFERS');
    if (signedBy !== null && this.namesTeamMember(stored, signedBy))
      return refusal(409, 'CERTIFICATION_INDEPENDENCE');
    if (!this.hasAttachment(stored, attachmentId, ['certificate']))
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    const trimmed = number.trim();
    if (
      [...this.cases.values()].some(
        (entry) => entry.certificate?.number === trimmed,
      )
    )
      return refusal(409, 'CERTIFICATION_CERTIFICATE_NUMBER_TAKEN');
    this.issue(
      stored,
      String(decided.value.decidedOn),
      {
        number: trimmed,
        issuedOn,
        approvedDraftVersionId: draft.id,
        attachmentId,
        signedBy,
        signedByFunction,
        independenceAttested,
        texts,
      },
      me,
    );
    return Response.json(this.detail(stored), { status: 201 });
  }

  /** The Certificate, valid three years minus one day from the decision. */
  private issue(
    stored: StoredCase,
    decidedOn: string,
    input: {
      number: string;
      issuedOn?: string | null;
      approvedDraftVersionId?: string | null;
      attachmentId: string;
      signedBy: string | null;
      signedByFunction: string | null;
      independenceAttested: boolean;
      texts: unknown[];
    },
    by: Actor,
  ) {
    stored.revision += 1;
    stored.status = 'certified';
    stored.certificate = {
      id: `11310000-0000-4000-8000-9000000000${String(++this.sequence).padStart(2, '0')}`,
      ...input,
      issuedOn: input.issuedOn ?? null,
      approvedDraftVersionId: input.approvedDraftVersionId ?? null,
      validFrom: decidedOn,
      validUntil: addDays(addMonths(decidedOn, 36), -1),
      firstSurveillanceBy: addMonths(decidedOn, 12),
      recordedBy: by,
      recordedAt: this.tick(),
    };
  }

  /** Complete release facts for the response, independent of paged exchanges. */
  private release(stored: StoredCase) {
    const drafts = stored.steps.filter(
      (entry) => entry.step === 'certificate_draft',
    );
    const opinions = stored.steps.filter(
      (entry) => entry.step === 'client_opinion',
    );
    const approvals = stored.steps.filter(
      (entry) => entry.step === 'certificate_draft_approval',
    );
    const draft = drafts.at(-1);
    const decision = latestStep(stored, 'decision');
    const data = latestStep(stored, 'certificate_data');
    const outdated =
      draft !== undefined &&
      (draft.value.decisionVersionId !== decision?.id ||
        draft.value.certificateDataVersionId !== data?.id);
    const opinion = opinions
      .filter((entry) => entry.value.draftVersionId === draft?.id)
      .at(-1);
    const approval = approvals
      .filter((entry) => entry.value.draftVersionId === draft?.id)
      .at(-1);
    const approvalBlockers: string[] = [];
    if (decision?.value.decision !== 'granted')
      approvalBlockers.push('not_granted');
    if (!draft) approvalBlockers.push('draft_missing');
    if (outdated) approvalBlockers.push('draft_outdated');
    if (!opinion) approvalBlockers.push('opinion_missing');
    else if (opinion.value.outcome === 'changes_requested')
      approvalBlockers.push('changes_requested');
    if (
      decision?.value.decision === 'granted' &&
      data &&
      !sameTexts(list(data.value.texts), list(decision.value.grantedTexts))
    )
      approvalBlockers.push('texts_differ');
    if (stored.consistency.open.some((entry) => entry.verdict !== 'to_clarify'))
      approvalBlockers.push('discrepancies_open');
    const issuanceBlockers = approvalBlockers.filter(
      (entry) => entry !== 'discrepancies_open',
    );
    if (!approval || (opinion && opinion.caseRevision > approval.caseRevision))
      issuanceBlockers.push('approval_missing');
    const issued = stored.certificate;
    const transmission =
      stored.exchanges.records
        .flatMap((entry) => {
          const version = entry.versions.at(-1);
          return version &&
            version.direction === 'sent' &&
            version.itemKind === 'certificate' &&
            record(version.counterpart).kind === 'client' &&
            list(version.attachmentIds).includes(issued?.attachmentId)
            ? [version]
            : [];
        })
        .at(0) ?? null;
    const revisions = stored.certificateRevisions.map(
      (revision): Record<string, unknown> => ({
        ...revision,
        transmission:
          stored.exchanges.records
            .flatMap((entry) => {
              const version = entry.versions.at(-1);
              return version &&
                version.direction === 'sent' &&
                version.itemKind === 'certificate' &&
                record(version.counterpart).kind === 'client' &&
                list(version.attachmentIds).includes(revision.attachmentId) &&
                typeof version.businessDate === 'string' &&
                typeof revision.revisedOn === 'string' &&
                version.businessDate >= revision.revisedOn &&
                !list(version.attachmentIds).includes(issued?.attachmentId) &&
                stored.certificateRevisions.filter((other) =>
                  list(version.attachmentIds).includes(other.attachmentId),
                ).length === 1
                ? [version]
                : [];
            })
            .sort(
              (left, right) =>
                String(left.businessDate).localeCompare(
                  String(right.businessDate),
                ) || Number(left.sequence) - Number(right.sequence),
            )
            .at(0) ?? null,
      }),
    );
    const effective = revisions.at(-1)?.texts ?? issued?.texts;
    return {
      revisions,
      currentRevisionIndex: issued ? revisions.length : null,
      revisionRequired:
        issued !== null &&
        (!data ||
          decision?.value.decision !== 'granted' ||
          !sameTexts(list(effective), list(data.value.texts)) ||
          !sameTexts(list(effective), list(decision.value.grantedTexts))),
      validity:
        decision?.value.decision === 'granted'
          ? {
              validFrom: String(decision.value.decidedOn),
              validUntil: addDays(
                addMonths(String(decision.value.decidedOn), 36),
                -1,
              ),
              firstSurveillanceBy: addMonths(
                String(decision.value.decidedOn),
                12,
              ),
            }
          : null,
      drafts,
      opinions,
      approvals,
      currentDraftId: draft?.id ?? null,
      outdated,
      approvalBlockers: issued ? [] : approvalBlockers,
      issuanceBlockers: issued ? [] : issuanceBlockers,
      transmission,
      daysSinceIssuance:
        issued?.issuedOn && !transmission
          ? Math.max(
              0,
              Math.floor(
                (Date.parse(this.latestBusinessDate()) -
                  Date.parse(issued.issuedOn)) /
                  86400000,
              ),
            )
          : null,
      legacyIssuance: issued !== null && issued.issuedOn === null,
    };
  }

  private recordRelease(
    stored: StoredCase,
    step: 'certificate_draft' | 'client_opinion' | 'certificate_draft_approval',
    body: unknown,
  ): Response {
    if (
      step === 'certificate_draft_approval'
        ? !holdsApprover(this.actor())
        : !holdsManager(this.actor())
    )
      return new Response(null, { status: 403 });
    const command = record(body);
    const closed = this.lockOpen(stored, command.expectedRevision);
    if (closed) return closed;
    if (latestStep(stored, 'decision')?.value.decision !== 'granted')
      return refusal(409, 'CERTIFICATION_NOT_GRANTED');
    const previous = latestStep(stored, step);
    const reason = nonblank(command.reason) ? command.reason : null;
    if ((previous === undefined) !== (reason === null))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    let value: Record<string, unknown>;
    try {
      if (step === 'certificate_draft') {
        const draft = parseCertificateDraft(command);
        if (
          draft.decisionVersionId !== latestStep(stored, 'decision')?.id ||
          draft.certificateDataVersionId !==
            latestStep(stored, 'certificate_data')?.id
        )
          return refusal(409, 'CERTIFICATION_DRAFT_OUTDATED');
        if (
          !this.hasAttachment(stored, draft.attachmentId, ['certificate_draft'])
        )
          return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
        value = { ...draft };
      } else if (step === 'client_opinion') {
        const opinion = parseClientOpinion(command);
        const draft = latestStep(stored, 'certificate_draft');
        if (
          draft?.id !== opinion.draftVersionId ||
          this.release(stored).outdated
        )
          return refusal(409, 'CERTIFICATION_DRAFT_OUTDATED');
        if (
          this.release(stored).opinions.some(
            (entry) =>
              entry.value.draftVersionId === opinion.draftVersionId &&
              entry.value.outcome === 'changes_requested',
          )
        )
          return refusal(409, 'CERTIFICATION_DRAFT_CHANGES_REQUESTED');
        if (opinion.outcome !== 'skipped') {
          const received = stored.exchanges.records
            .flatMap((entry) => entry.versions)
            .find((entry) => entry.id === opinion.exchangeRecordId);
          if (
            !received ||
            received.direction !== 'received' ||
            received.itemKind !== 'client_opinion' ||
            record(received.counterpart).kind !== 'client'
          )
            return refusal(409, 'CERTIFICATION_OPINION_EXCHANGE_REQUIRED');
        }
        value = { ...opinion };
      } else {
        const approval = parseDraftApproval(command);
        if (
          this.onTeam(stored) ||
          (approval.onBehalf &&
            this.namesTeamMember(stored, approval.onBehalf.actedBy))
        )
          return refusal(409, 'CERTIFICATION_INDEPENDENCE');
        if (
          approval.draftVersionId !==
            latestStep(stored, 'certificate_draft')?.id ||
          this.release(stored).approvalBlockers.length
        )
          return refusal(409, 'CERTIFICATION_DRAFT_APPROVAL_PRECONDITIONS');
        value = { ...approval };
      }
    } catch {
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    }
    if (
      step === 'certificate_draft_approval' &&
      previous &&
      sameValue(previous.value, value) &&
      !this.release(stored).issuanceBlockers.includes('approval_missing')
    )
      return refusal(409, 'CERTIFICATION_CORRECTION_UNCHANGED');
    this.append(stored, step, value, reason, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  private reviseCertificate(stored: StoredCase, body: unknown): Response {
    if (!holdsApprover(this.actor()))
      return new Response(null, { status: 403 });
    const input = record(body);
    const allowed = [
      'expectedRevision',
      'reason',
      'revisedOn',
      'attachmentId',
      'revisionMarked',
      'independenceAttested',
      'onBehalf',
    ];
    if (
      Object.keys(input).some((key) => !allowed.includes(key)) ||
      !bounded(input.reason, 2000) ||
      !calendarDate(input.revisedOn) ||
      !nonblank(input.attachmentId) ||
      typeof input.revisionMarked !== 'boolean'
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (input.independenceAttested !== true)
      return refusal(400, 'CERTIFICATION_INDEPENDENCE_ATTESTATION');
    const closed = this.lockOpen(stored, input.expectedRevision, ['certified']);
    if (closed) return closed;
    if (this.onTeam(stored)) return refusal(409, 'CERTIFICATION_INDEPENDENCE');
    if (input.revisedOn > this.latestBusinessDate())
      return refusal(409, 'CERTIFICATION_ACT_IN_FUTURE');
    const onBehalf = input.onBehalf ?? null;
    if (!actingInput(onBehalf))
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    const acting = this.actingRefusal(stored, onBehalf);
    if (acting) return acting;
    const decision = latestStep(stored, 'decision');
    const data = latestStep(stored, 'certificate_data');
    if (
      !stored.certificate ||
      decision?.value.decision !== 'granted' ||
      !data ||
      !sameTexts(list(data.value.texts), list(decision.value.grantedTexts))
    )
      return refusal(409, 'CERTIFICATION_CERTIFICATE_DATA_DIFFERS');
    const attached = stored.attachments.find(
      (entry) =>
        entry.id === input.attachmentId && entry.role === 'certificate',
    );
    if (!attached) return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    const used = [
      stored.certificate.attachmentId,
      ...stored.certificateRevisions.map((entry) => entry.attachmentId),
    ];
    if (
      stored.attachments.some(
        (entry) =>
          used.includes(entry.id) && entry.versionId === attached.versionId,
      )
    )
      return refusal(409, 'CERTIFICATION_CERTIFICATE_PDF_REUSED');
    stored.revision += 1;
    stored.certificateRevisions.push({
      id: crypto.randomUUID(),
      index: stored.certificateRevisions.length + 1,
      caseRevision: stored.revision,
      reason: input.reason.trim(),
      revisedOn: input.revisedOn,
      attachmentId: input.attachmentId,
      texts: structuredClone(data.value.texts),
      decisionVersionId: decision.id,
      certificateDataVersionId: data.id,
      revisionMarked: input.revisionMarked,
      independenceAttested: true,
      onBehalf,
      recordedBy: me,
      recordedAt: this.tick(),
    });
    return Response.json(this.detail(stored), { status: 201 });
  }

  /** The stale and closed refusals every Case command checks first. */
  private lockOpen(
    stored: StoredCase,
    expectedRevision: unknown,
    statuses: readonly StoredCase['status'][] = ['open'],
  ): Response | undefined {
    if (expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (!statuses.includes(stored.status))
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    return undefined;
  }

  /** Whether a name is the name of a member of the approved team. */
  private namesTeamMember(stored: StoredCase, name: unknown): boolean {
    const normal = (value: unknown) =>
      String(value)
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/\s+/gu, ' ')
        .trim()
        .toLocaleLowerCase('en');
    const team = approvedTeamOf(stored);
    return (
      team !== undefined &&
      list(team.value.members).some(
        (member) => normal(record(member).name) === normal(name),
      )
    );
  }

  /** Every unmet precondition of a decision, in the server's order. */
  private decisionFailures(
    stored: StoredCase,
    decision: unknown,
    decidedOn: string,
  ): string[] {
    const failures: string[] = [];
    if (latestStep(stored, 'application_review')?.value.outcome !== 'accepted')
      failures.push('APPLICATION_NOT_ACCEPTED');
    if (!latestStep(stored, 'duration')) failures.push('DURATION_MISSING');
    if (!latestStep(stored, 'agreement')) failures.push('AGREEMENT_MISSING');
    if (!approvedTeamOf(stored)) failures.push('TEAM_NOT_APPROVED');
    if (latestStep(stored, 'stage_1_report')?.value.conclusion !== 'ready')
      failures.push('STAGE_1_NOT_READY');
    if (!latestStep(stored, 'stage_2_report'))
      failures.push('STAGE_2_NOT_REPORTED');
    const views = stored.findings.map((finding) =>
      this.findingView(stored, finding),
    );
    if (views.some(findingBlocks)) failures.push('FINDINGS_OPEN');
    if (views.some((view) => view.overdue)) failures.push('FINDINGS_OVERDUE');
    const recommended = latestStep(stored, 'recommendation');
    if (!recommended) failures.push('RECOMMENDATION_MISSING');
    else if (
      decision === 'granted' &&
      recommended.value.recommendation !== 'grant'
    )
      failures.push('GRANT_AGAINST_RECOMMENDATION');
    const reviewed = latestStep(stored, 'dossier_review');
    if (
      !reviewed ||
      Object.values(record(reviewed.value.items)).some(
        (entry) => record(entry).answer === 'missing',
      )
    )
      failures.push('DOSSIER_REVIEW_INCOMPLETE');
    if (decision === 'granted' && !latestStep(stored, 'certificate_data'))
      failures.push('CERTIFICATE_DATA_MISSING');
    if (decidedOn > this.latestBusinessDate())
      failures.push('DECISION_IN_FUTURE');
    return failures;
  }

  /** The exact bytes of one attachment, under the Document rights. */
  private content(
    caseId: string | undefined,
    attachmentId: string | undefined,
  ): Response {
    const stored = caseId ? this.cases.get(caseId) : undefined;
    const attached = stored?.attachments.find(
      (item) => item.id === attachmentId,
    );
    if (!attached) return new Response(null, { status: 404 });
    if (!this.documentAccess) return new Response(null, { status: 403 });
    const source = this.sources.find(
      (entry) => entry.representationId === attached.representationId,
    );
    if (!source) return new Response(null, { status: 503 });
    return new Response(source.bytes, {
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(source.bytes.length),
      },
    });
  }

  /**
   * The generated register: a fictional PDF naming the Case and language. The
   * server accepts only one `language` of the closed set, or none (English).
   */
  private register(caseId: string | undefined, search: string): Response {
    const stored = caseId ? this.cases.get(caseId) : undefined;
    if (!stored) return new Response(null, { status: 404 });
    const query = new URLSearchParams(search);
    const languages = query.getAll('language');
    const language = languages[0] ?? 'en';
    if (
      [...query.keys()].some((key) => key !== 'language') ||
      languages.length > 1 ||
      !['en', 'fr', 'ro', 'ru'].includes(language)
    )
      return refusal(400, 'CERTIFICATION_REGISTER_QUERY_INVALID');
    const bytes = new TextEncoder().encode(
      `%PDF-1.7\n% Fictional dossier register of ${stored.orderReference} at revision ${stored.revision} (${language})\n%%EOF\n`,
    );
    return new Response(bytes, {
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(bytes.length),
      },
    });
  }

  /** The server's checks, in its order: revision, Document rights, source, duplicate. */
  private attachDocument(stored: StoredCase, body: unknown): Response {
    const input = record(body);
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open' && stored.status !== 'certified')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (
      stored.status === 'certified' &&
      ![
        'certificate',
        'certificate_data',
        'evidence',
        'other',
        'correspondence',
      ].includes(String(input.role))
    )
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    if (!this.documentAccess) return new Response(null, { status: 403 });
    const source = this.sources.find(
      (entry) =>
        entry.documentId === input.documentId &&
        entry.versionId === input.versionId &&
        entry.representationId === input.representationId,
    );
    if (!source) return new Response(null, { status: 404 });
    if (
      stored.attachments.some(
        (item) => item.representationId === source.representationId,
      )
    )
      return refusal(409, 'CERTIFICATION_DOCUMENT_ALREADY_ATTACHED');
    const note = typeof input.note === 'string' ? input.note : null;
    this.attach(stored, source, String(input.role), note, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  /** The server's checks, in its order: revision, duration, reason, date, role. */
  private recordAgreement(stored: StoredCase, body: unknown): Response {
    const input = record(body);
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (!latestStep(stored, 'duration'))
      return refusal(409, 'CERTIFICATION_DURATION_MISSING');
    const first = !latestStep(stored, 'agreement');
    const reason = typeof input.reason === 'string' ? input.reason : null;
    if (first !== (reason === null))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    const signedOn = String(input.signedOn);
    if (signedOn > this.latestBusinessDate())
      return refusal(409, 'CERTIFICATION_AGREEMENT_IN_FUTURE');
    const attached = stored.attachments.find(
      (item) => item.id === input.attachmentId,
    );
    if (attached?.role !== 'agreement')
      return refusal(409, 'CERTIFICATION_AGREEMENT_DOCUMENT');
    this.append(
      stored,
      'agreement',
      { signedOn, attachmentId: attached.id },
      reason,
      me,
    );
    return Response.json(this.detail(stored), { status: 201 });
  }

  /**
   * The server's checks, in its order: composition and analysis, revision,
   * agreement, reason, the analysis after a declared consultant, its
   * evidence, links.
   */
  private proposeTeam(stored: StoredCase, body: unknown): Response {
    const input = record(body);
    const composition = teamComposition(input.members);
    if (composition !== null) return refusal(400, composition);
    const analysis =
      input.impartialityAnalysis === undefined
        ? null
        : input.impartialityAnalysis;
    const analysisBody = analysis === null ? null : record(analysis);
    const evidence =
      analysisBody === null
        ? []
        : evidenceInput(analysisBody.evidenceAttachmentIds);
    if (
      analysisBody !== null &&
      (!bounded(analysisBody.note, 4000) || evidence === undefined)
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    const reason = input.reason === undefined ? null : input.reason;
    if (reason !== null && !nonblank(reason))
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (!latestStep(stored, 'agreement'))
      return refusal(409, 'CERTIFICATION_AGREEMENT_MISSING');
    const first = !latestStep(stored, 'team');
    if (first !== (reason === null))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    const facts = latestStep(stored, 'application')?.value;
    if (
      record(facts?.consultant ?? { used: false }).used === true &&
      !analysisBody
    )
      return refusal(400, 'CERTIFICATION_TEAM_ANALYSIS_REQUIRED');
    if (!this.allAttached(stored, evidence ?? []))
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    const members = list(input.members).map(record);
    if (
      members.some(
        (member) =>
          member.workspaceMembershipId !== null &&
          member.workspaceMembershipId !== me.workspaceMembershipId &&
          member.workspaceMembershipId !== colleague.workspaceMembershipId,
      )
    )
      return refusal(400, 'CERTIFICATION_TEAM_MEMBER_UNKNOWN');
    this.append(
      stored,
      'team',
      {
        members,
        impartialityAnalysis:
          analysisBody === null
            ? null
            : { note: analysisBody.note, evidenceAttachmentIds: evidence },
      },
      reason,
      me,
    );
    return Response.json(this.detail(stored), { status: 201 });
  }

  /**
   * The server's checks, in its order: the approver grant, the input and
   * its attestation, the revision, a pending team of that version,
   * independence of the actor and of the person acting, the signed form,
   * then declarations that are not confirmed.
   */
  private decideTeam(stored: StoredCase, body: unknown): Response {
    if (!holdsApprover(this.actor()))
      return new Response(null, { status: 403 });
    const input = record(body);
    const approved =
      input.decision === 'approved' &&
      (input.reason === undefined || input.reason === null);
    const onBehalf = input.onBehalf === undefined ? null : input.onBehalf;
    if (
      typeof input.teamVersion !== 'number' ||
      !(
        approved ||
        (input.decision === 'returned' && nonblank(input.reason))
      ) ||
      !actingInput(onBehalf)
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (input.independenceAttested !== true)
      return refusal(400, 'CERTIFICATION_INDEPENDENCE_ATTESTATION');
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    const team = latestStep(stored, 'team');
    const decided = latestStep(stored, 'team_decision');
    if (!team || decided?.value.teamVersion === team.version)
      return refusal(409, 'CERTIFICATION_TEAM_NOT_PENDING');
    if (input.teamVersion !== team.version)
      return refusal(409, 'STALE_VERSION');
    const onTeam = stored.steps.some(
      (step) =>
        step.step === 'team' &&
        list(step.value.members).some(
          (member) =>
            record(member).workspaceMembershipId === me.workspaceMembershipId,
        ),
    );
    if (onTeam) return refusal(409, 'CERTIFICATION_INDEPENDENCE');
    const acting = this.actingRefusal(stored, onBehalf);
    if (acting) return acting;
    if (
      approved &&
      list(team.value.members).some((member) => declaresConflict(member))
    )
      return refusal(409, 'CERTIFICATION_TEAM_CONFLICT_DECLARED');
    this.append(
      stored,
      'team_decision',
      {
        teamVersion: team.version,
        decision: input.decision,
        reason: approved ? null : input.reason,
        onBehalf,
        independenceAttested: true,
      },
      null,
      me,
    );
    return Response.json(this.detail(stored), { status: 201 });
  }

  /**
   * The server's checks, in its order: the input and its dates, the
   * revision, an approved team, a ready Stage 1 before Stage 2, the deviation
   * note, the plan role, the reason, then an unchanged correction.
   */
  private planStage(
    stored: StoredCase,
    stage: 'stage_1' | 'stage_2',
    body: unknown,
  ): Response {
    const { expectedRevision, reason, ...input } = record(body);
    const fields = [
      'startDate',
      'endDate',
      'onSiteDays',
      'remoteDays',
      'objectives',
      'scope',
      'planAttachmentId',
      'sentToClientOn',
      'deviationNote',
    ];
    const {
      startDate,
      endDate,
      onSiteDays,
      remoteDays,
      objectives,
      scope,
      planAttachmentId,
      sentToClientOn,
      deviationNote,
    } = input;
    if (
      Object.keys(input).some((key) => !fields.includes(key)) ||
      !calendarDate(startDate) ||
      !calendarDate(endDate) ||
      dayCents(onSiteDays, false) === undefined ||
      dayCents(remoteDays, true) === undefined ||
      !nonblank(objectives) ||
      !nonblank(scope) ||
      !nonblank(planAttachmentId) ||
      !(sentToClientOn === null || calendarDate(sentToClientOn)) ||
      !(deviationNote === null || nonblank(deviationNote)) ||
      !optionalText(reason)
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (startDate > endDate) return refusal(400, 'CERTIFICATION_STAGE_DATES');
    if (expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (!approvedTeamOf(stored))
      return refusal(409, 'CERTIFICATION_TEAM_NOT_APPROVED');
    if (stage === 'stage_2') {
      const report = latestStep(stored, 'stage_1_report')?.value;
      if (report?.conclusion !== 'ready')
        return refusal(409, 'CERTIFICATION_STAGE_1_NOT_READY');
      if (
        stored.findings.some((finding) => {
          const view = this.findingView(stored, finding);
          return (
            view.stage === 'stage_1' &&
            nonconformity(view.classification) &&
            view.status !== 'verified_effective'
          );
        })
      )
        return refusal(409, 'CERTIFICATION_STAGE_1_NONCONFORMITY_OPEN');
      if (startDate <= String(report.reportDate))
        return refusal(409, 'CERTIFICATION_STAGE_DATES');
    }
    const confirmed = record(latestStep(stored, 'duration')?.value.confirmed);
    const expected = dayCents(
      stage === 'stage_1' ? confirmed.stage1OnSite : confirmed.stage2OnSite,
      false,
    );
    if ((dayCents(onSiteDays, false) !== expected) !== (deviationNote !== null))
      return refusal(400, 'CERTIFICATION_STAGE_DEVIATION_NOTE');
    if (!this.hasAttachment(stored, planAttachmentId, ['plan']))
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    return this.appendStage(
      stored,
      stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan',
      {
        startDate,
        endDate,
        onSiteDays,
        remoteDays,
        objectives,
        scope,
        planAttachmentId,
        sentToClientOn,
        deviationNote,
      },
      reason,
    );
  }

  /**
   * The server's checks, in its order: the auditor grant, the input, the
   * revision, the leader of the approved team, the plan and its start, the
   * attachment roles, the reason, then an unchanged correction.
   */
  private reportStage(
    stored: StoredCase,
    stage: 'stage_1' | 'stage_2',
    body: unknown,
  ): Response {
    if (!holdsAuditor(this.actor())) return new Response(null, { status: 403 });
    const { expectedRevision, reason, ...input } = record(body);
    const fields =
      stage === 'stage_1'
        ? [
            'reportDate',
            'documentReviewCompleted',
            'conclusion',
            'conclusionNote',
            'reportAttachmentId',
            'participantListAttachmentId',
            'certificationBodyApproval',
          ]
        : [
            'reportDate',
            'summary',
            'reportAttachmentId',
            'participantListAttachmentId',
            'annexAttachmentId',
            'certificationBodyApproval',
          ];
    if (Object.keys(input).some((key) => !fields.includes(key)))
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (stage === 'stage_1' && input.documentReviewCompleted !== true)
      return refusal(400, 'CERTIFICATION_DOCUMENT_REVIEW_INCOMPLETE');
    const {
      reportDate,
      reportAttachmentId,
      participantListAttachmentId = null,
      annexAttachmentId = null,
      certificationBodyApproval = null,
    } = input;
    const value =
      stage === 'stage_1'
        ? {
            reportDate,
            documentReviewCompleted: true,
            conclusion: input.conclusion,
            conclusionNote: input.conclusionNote,
            reportAttachmentId,
            participantListAttachmentId,
            certificationBodyApproval,
          }
        : {
            reportDate,
            summary: input.summary,
            reportAttachmentId,
            participantListAttachmentId,
            annexAttachmentId,
            certificationBodyApproval,
          };
    if (
      !calendarDate(reportDate) ||
      !nonblank(reportAttachmentId) ||
      !(
        participantListAttachmentId === null ||
        nonblank(participantListAttachmentId)
      ) ||
      !(annexAttachmentId === null || nonblank(annexAttachmentId)) ||
      !actingInput(certificationBodyApproval) ||
      (stage === 'stage_1'
        ? (input.conclusion !== 'ready' && input.conclusion !== 'not_ready') ||
          !nonblank(input.conclusionNote)
        : !nonblank(input.summary)) ||
      !optionalText(reason)
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    const team = approvedTeamOf(stored);
    if (
      !team ||
      !list(team.value.members)
        .map(record)
        .some(
          (member) =>
            member.role === 'team_leader' &&
            member.workspaceMembershipId === me.workspaceMembershipId,
        )
    )
      return refusal(409, 'CERTIFICATION_NOT_TEAM_LEADER');
    const plan = latestStep(
      stored,
      stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan',
    );
    if (!plan) return refusal(409, 'CERTIFICATION_STAGE_NOT_PLANNED');
    if (reportDate < String(plan.value.startDate))
      return refusal(409, 'CERTIFICATION_STAGE_DATES');
    if (
      !this.hasAttachment(stored, reportAttachmentId, ['report']) ||
      (participantListAttachmentId !== null &&
        !this.hasAttachment(stored, participantListAttachmentId, [
          'participant_list',
        ])) ||
      (annexAttachmentId !== null &&
        !this.hasAttachment(stored, annexAttachmentId, [
          'report',
          'evidence',
          'iso22000_annex',
        ])) ||
      !this.allAttached(
        stored,
        certificationBodyApproval === null
          ? []
          : [record(certificationBodyApproval).formAttachmentId].filter(
              nonblank,
            ),
      )
    )
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    return this.appendStage(
      stored,
      stage === 'stage_1' ? 'stage_1_report' : 'stage_2_report',
      value,
      reason,
    );
  }

  /** A first version has no reason; a correction states one and changes a value. */
  private appendStage(
    stored: StoredCase,
    step: (typeof STAGE_STEPS)[number] | DecisionStep,
    value: Record<string, unknown>,
    reason: unknown,
  ): Response {
    const previous = latestStep(stored, step);
    const stated = nonblank(reason) ? reason : null;
    if (!previous !== (stated === null))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    if (previous && sameValue(previous.value, value))
      return refusal(409, 'CERTIFICATION_CORRECTION_UNCHANGED');
    this.append(stored, step, value, stated, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  /**
   * The server's checks, in its order: the auditor grant, the input, a new
   * Finding without reason, the revision, the leader of the approved team,
   * a planned and open Stage, the classification rules, then the evidence.
   */
  private recordFinding(stored: StoredCase, body: unknown): Response {
    if (!holdsAuditor(this.actor())) return new Response(null, { status: 403 });
    const { expectedRevision, reason, stage, classification, ...fields } =
      record(body);
    const statement = statementInput(fields);
    if (
      typeof expectedRevision !== 'number' ||
      (stage !== 'stage_1' && stage !== 'stage_2') ||
      !FINDING_CLASSIFICATION_VALUES.includes(String(classification)) ||
      !statement ||
      !optionalText(reason)
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (reason !== undefined && reason !== null)
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    if (expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (!this.leads(stored))
      return refusal(409, 'CERTIFICATION_NOT_TEAM_LEADER');
    if (
      !latestStep(stored, stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan')
    )
      return refusal(409, 'CERTIFICATION_STAGE_NOT_PLANNED');
    if (stage === 'stage_1' && latestStep(stored, 'stage_2_plan'))
      return refusal(409, 'CERTIFICATION_STAGE_CLOSED');
    const rule = classificationRule(String(classification), stage, statement);
    if (rule) return refusal(400, rule);
    if (!this.allAttached(stored, statement.evidenceAttachmentIds))
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    this.addFinding(stored, stage, String(classification), statement, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  /**
   * The server's checks, in its order: the role grant, the revision, team
   * independence or leadership, the Finding, then the rules of each update.
   */
  private updateFinding(
    stored: StoredCase,
    findingId: string,
    kind: FindingUpdate,
    body: unknown,
  ): Response {
    const granted =
      kind === 'reclassification'
        ? holdsApprover(this.actor())
        : holdsAuditor(this.actor());
    if (!granted) return new Response(null, { status: 403 });
    const { expectedRevision, reason, ...payload } = record(body);
    if (typeof expectedRevision !== 'number' || !optionalText(reason))
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (kind === 'reclassification') {
      if (this.onTeam(stored))
        return refusal(409, 'CERTIFICATION_INDEPENDENCE');
    } else if (!this.leads(stored))
      return refusal(409, 'CERTIFICATION_NOT_TEAM_LEADER');
    const found = stored.findings.find((entry) => entry.id === findingId);
    if (!found) return new Response(null, { status: 404 });
    const view = this.findingView(stored, found);
    const stated = nonblank(reason) ? reason : null;
    switch (kind) {
      case 'correction': {
        const statement = statementInput(payload);
        if (!statement) return refusal(400, 'INVALID_CERTIFICATION_INPUT');
        if (stated === null)
          return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
        if (sameValue(view.statement, statement))
          return refusal(409, 'CERTIFICATION_CORRECTION_UNCHANGED');
        const rule = classificationRule(
          view.classification,
          view.stage,
          statement,
        );
        if (rule) return refusal(400, rule);
        if (!this.allAttached(stored, statement.evidenceAttachmentIds))
          return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
        return this.appendFindingRecord(
          stored,
          found,
          'statement',
          statement,
          stated,
        );
      }
      case 'classification':
      case 'reclassification': {
        const { classification, ...rest } = payload;
        if (
          Object.keys(rest).length > 0 ||
          !FINDING_CLASSIFICATION_VALUES.includes(String(classification))
        )
          return refusal(400, 'INVALID_CERTIFICATION_INPUT');
        if (stated === null)
          return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
        if (classification === view.classification)
          return refusal(409, 'CERTIFICATION_CORRECTION_UNCHANGED');
        const rule = classificationRule(
          String(classification),
          view.stage,
          view.statement,
        );
        if (rule) return refusal(400, rule);
        return this.appendFindingRecord(
          stored,
          found,
          'classification',
          {
            classification,
            by: kind === 'reclassification' ? 'approver' : 'team_leader',
          },
          stated,
        );
      }
      case 'response': {
        const value = responseInput(payload);
        if (!value) return refusal(400, 'INVALID_CERTIFICATION_INPUT');
        if (
          !nonconformity(view.classification) ||
          view.status === 'verified_effective'
        )
          return refusal(409, 'CERTIFICATION_FINDING_NOT_OPEN');
        if (!this.allAttached(stored, value.evidenceAttachmentIds))
          return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
        return this.appendFindingRecord(stored, found, 'response', value, null);
      }
      case 'plan_judgment': {
        const { outcome, note, ...rest } = payload;
        if (
          Object.keys(rest).length > 0 ||
          (outcome !== 'adequate' && outcome !== 'inadequate') ||
          !nonblank(note)
        )
          return refusal(400, 'INVALID_CERTIFICATION_INPUT');
        if (view.status !== 'awaiting_plan_judgment')
          return refusal(409, 'CERTIFICATION_FINDING_NO_RESPONSE');
        return this.appendFindingRecord(
          stored,
          found,
          'plan_judgment',
          { outcome, note },
          null,
        );
      }
      case 'verification': {
        const value = verificationInput(payload);
        if (!value) return refusal(400, 'INVALID_CERTIFICATION_INPUT');
        if (view.status !== 'plan_adequate')
          return refusal(409, 'CERTIFICATION_FINDING_PLAN_NOT_ADEQUATE');
        if (!this.allAttached(stored, value.evidenceAttachmentIds))
          return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
        return this.appendFindingRecord(
          stored,
          found,
          'verification',
          value,
          null,
        );
      }
    }
  }

  private appendFindingRecord(
    stored: StoredCase,
    finding: StoredFinding,
    kind: FindingRecordKind,
    value: Record<string, unknown>,
    reason: string | null,
  ): Response {
    stored.revision += 1;
    this.addFindingRecord(finding, kind, value, reason, stored.revision, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  private addFinding(
    stored: StoredCase,
    stage: 'stage_1' | 'stage_2',
    classification: string,
    statement: Record<string, unknown>,
    by: Actor,
  ): StoredFinding {
    stored.revision += 1;
    const finding: StoredFinding = {
      id: `11310000-0000-4000-8000-7000000000${String(++this.sequence).padStart(2, '0')}`,
      stage,
      sequence: stored.findings.length + 1,
      records: [],
    };
    stored.findings.push(finding);
    this.addFindingRecord(
      finding,
      'statement',
      statement,
      null,
      stored.revision,
      by,
    );
    this.addFindingRecord(
      finding,
      'classification',
      { classification, by: 'team_leader' },
      null,
      stored.revision,
      by,
    );
    return finding;
  }

  private addFindingRecord(
    finding: StoredFinding,
    kind: FindingRecordKind,
    value: Record<string, unknown>,
    reason: string | null,
    caseRevision: number,
    by: Actor,
  ) {
    finding.records.push({
      id: `11310000-0000-4000-8000-8000000000${String(++this.sequence).padStart(2, '0')}`,
      kind,
      version:
        finding.records.filter((entry) => entry.kind === kind).length + 1,
      caseRevision,
      reason,
      recordedBy: by,
      recordedAt: this.tick(),
      value,
    });
  }

  /**
   * The server's derived view: the latest statement and classification, the
   * follow-up status replayed in Case order, and the dates counted from the
   * last planned day of the Finding's Stage.
   */
  private findingView(stored: StoredCase, finding: StoredFinding) {
    let statement: Record<string, unknown> = {};
    let classification = '';
    let status = 'no_action_required';
    for (const entry of finding.records)
      switch (entry.kind) {
        case 'statement':
          statement = entry.value;
          break;
        case 'classification': {
          const was = nonconformity(classification);
          classification = String(entry.value.classification);
          if (!nonconformity(classification)) status = 'no_action_required';
          else if (!was) status = 'awaiting_response';
          break;
        }
        case 'response':
          status = 'awaiting_plan_judgment';
          break;
        case 'plan_judgment':
          status =
            entry.value.outcome === 'adequate'
              ? 'plan_adequate'
              : 'plan_inadequate';
          break;
        case 'verification':
          status =
            entry.value.outcome === 'effective'
              ? 'verified_effective'
              : 'verified_not_effective';
          break;
      }
    const plan = latestStep(
      stored,
      finding.stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan',
    );
    const stageEnd = String(plan?.value.endDate);
    const limited =
      nonconformity(classification) &&
      (finding.stage === 'stage_1' || classification === 'major_nonconformity');
    const limitOn = limited ? addMonths(stageEnd, 6) : null;
    const today = new Date(this.clock).toISOString().slice(0, 10);
    return {
      id: finding.id,
      stage: finding.stage,
      sequence: finding.sequence,
      statement,
      classification,
      status,
      responseDueOn: nonconformity(classification)
        ? addDays(stageEnd, 14)
        : null,
      limitOn,
      overdue:
        limitOn !== null && status !== 'verified_effective' && today > limitOn,
      records: finding.records,
    };
  }

  /** Whether the actor is linked to the leader of the approved team. */
  private leads(stored: StoredCase): boolean {
    const team = approvedTeamOf(stored);
    return (
      team !== undefined &&
      list(team.value.members)
        .map(record)
        .some(
          (member) =>
            member.role === 'team_leader' &&
            member.workspaceMembershipId === me.workspaceMembershipId,
        )
    );
  }

  /** Whether the actor is linked to a member of any proposed team version. */
  private onTeam(stored: StoredCase): boolean {
    return stored.steps.some(
      (step) =>
        step.step === 'team' &&
        list(step.value.members).some(
          (member) =>
            record(member).workspaceMembershipId === me.workspaceMembershipId,
        ),
    );
  }

  private allAttached(stored: StoredCase, ids: readonly string[]): boolean {
    return ids.every((id) => stored.attachments.some((item) => item.id === id));
  }

  private hasAttachment(
    stored: StoredCase,
    attachmentId: unknown,
    roles: readonly string[],
  ): boolean {
    return stored.attachments.some(
      (item) => item.id === attachmentId && roles.includes(item.role),
    );
  }

  private attach(
    stored: StoredCase,
    source: FakeSource,
    role: string,
    note: string | null,
    by: Actor,
  ): StoredAttachment {
    stored.revision += 1;
    const attached: StoredAttachment = {
      id: `11310000-0000-4000-8000-6000000000${String(++this.sequence).padStart(2, '0')}`,
      caseRevision: stored.revision,
      role,
      documentId: source.documentId,
      versionId: source.versionId,
      representationId: source.representationId,
      versionNumber: source.versionNumber,
      sourceTitle: source.sourceTitle,
      fileName: source.fileName,
      sizeBytes: source.bytes.length,
      sha256: source.sha256,
      note,
      attachedBy: by,
      attachedAt: this.tick(),
    };
    stored.attachments.push(attached);
    return attached;
  }

  /** The accepted application's facts, or undefined before an acceptance. */
  private acceptedFacts(stored: StoredCase) {
    const review = latestStep(stored, 'application_review');
    const application = latestStep(stored, 'application');
    return review?.value.outcome === 'accepted' && application
      ? applicationFactsOf(application.value)
      : undefined;
  }

  private proposeDuration(stored: StoredCase, body: unknown): Response {
    const facts = this.acceptedFacts(stored);
    if (!facts) return refusal(409, 'CERTIFICATION_APPLICATION_NOT_ACCEPTED');
    return Response.json(computeDuration(facts, durationFactors(body)));
  }

  /** The server's checks, in its order: stage sum, revision, step, rule. */
  private confirmDuration(stored: StoredCase, body: unknown): Response {
    const input = record(body);
    const confirmed = record(input.confirmed);
    const cents = (field: (typeof CONFIRMED_DURATION_FIELDS)[number]) => {
      const value = confirmed[field];
      return typeof value === 'string'
        ? Math.round(Number(value) * 100)
        : Number.NaN;
    };
    if (
      cents('stage1OnSite') + cents('stage2OnSite') !==
      cents('initialOnSite')
    )
      return refusal(400, 'CERTIFICATION_DURATION_STAGES_MISMATCH');
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    const facts = this.acceptedFacts(stored);
    if (!facts) return refusal(409, 'CERTIFICATION_APPLICATION_NOT_ACCEPTED');
    const first = !stored.steps.some((step) => step.step === 'duration');
    const reason = typeof input.reason === 'string' ? input.reason : null;
    if (first !== (reason === null))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    const factors = durationFactors(input.inputs);
    const result = computeDuration(facts, factors);
    if (result.kind === 'refused')
      return Response.json(
        {
          code: 'CERTIFICATION_DURATION_REFUSED',
          message: 'CERTIFICATION_DURATION_REFUSED',
          refusals: result.refusals,
        },
        { status: 400 },
      );
    const factorsUsed = [
      ...Object.values(factors.increases),
      ...Object.values(factors.reductions),
    ].some((percent) => percent > 0);
    const differs =
      result.kind === 'manual' ||
      CONFIRMED_DURATION_FIELDS.some(
        (field) => cents(field) !== roundedCents(result.proposal[field]),
      );
    const justification =
      typeof input.justification === 'string' ? input.justification : null;
    if ((factorsUsed || differs) && justification === null)
      return refusal(400, 'CERTIFICATION_DURATION_JUSTIFICATION_REQUIRED');
    const onBehalf = input.onBehalf === undefined ? null : input.onBehalf;
    if (!actingInput(onBehalf))
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    const acting = this.actingFormRefusal(stored, onBehalf);
    if (acting) return acting;
    this.append(
      stored,
      'duration',
      {
        ruleVersion: DURATION_RULE_VERSION,
        inputs: {
          ...record(input.inputs),
          subcategories: facts.foodChainSubcategories,
          effectiveFte: facts.effectiveFte,
        },
        computation: result,
        confirmed,
        justification,
        onBehalf,
      },
      reason,
      me,
    );
    return Response.json(this.detail(stored), { status: 201 });
  }

  /** A signed form of an act on behalf of the certification body is attached. */
  private actingFormRefusal(stored: StoredCase, act: unknown): Response | null {
    if (act === null) return null;
    const { formAttachmentId } = record(act);
    return formAttachmentId === null ||
      formAttachmentId === undefined ||
      stored.attachments.some((item) => item.id === formAttachmentId)
      ? null
      : refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
  }

  /** The latest calendar date already reached somewhere (UTC+14). */
  private latestBusinessDate(): string {
    return new Date(this.clock + 14 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }

  private open(body: unknown): Response {
    const input = record(body);
    const reference =
      typeof input.orderReference === 'string'
        ? input.orderReference.trim()
        : '';
    if (
      input.clientLegalEntityId !== certificationIds.entity &&
      input.clientLegalEntityId !== certificationIds.otherEntity
    )
      return new Response(null, { status: 404 });
    if (
      [...this.cases.values()].some(
        (stored) => stored.orderReference === reference,
      )
    )
      return refusal(409, 'CERTIFICATION_ORDER_REFERENCE_TAKEN');
    const stored = this.create(reference, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  private recordApplication(stored: StoredCase, body: unknown): Response {
    const input = record(body);
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (latestStep(stored, 'decision'))
      return refusal(409, 'CERTIFICATION_DECIDED');
    const first = !stored.steps.some((step) => step.step === 'application');
    const reason = typeof input.reason === 'string' ? input.reason : null;
    if (first !== (reason === null))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    this.append(stored, 'application', record(input.facts), reason, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  private review(stored: StoredCase, body: unknown): Response {
    const input = record(body);
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (!stored.steps.some((step) => step.step === 'application'))
      return refusal(409, 'CERTIFICATION_APPLICATION_MISSING');
    if (stored.steps.some((step) => step.step === 'application_review'))
      return refusal(409, 'CERTIFICATION_APPLICATION_ALREADY_REVIEWED');
    const criteria = record(input.criteria);
    const answers = Object.values(criteria).map(
      (entry) => record(entry).answer,
    );
    if (
      input.outcome === 'accepted' &&
      answers.some((value) => value !== 'yes')
    )
      return refusal(400, 'CERTIFICATION_REVIEW_CRITERIA_NOT_MET');
    const onBehalf = input.onBehalf === undefined ? null : input.onBehalf;
    if (!actingInput(onBehalf))
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    const acting = this.actingFormRefusal(stored, onBehalf);
    if (acting) return acting;
    const rejected = input.outcome === 'rejected';
    this.append(
      stored,
      'application_review',
      {
        criteria,
        outcome: input.outcome,
        rejectionReason: rejected ? input.rejectionReason : null,
        onBehalf,
      },
      null,
      me,
    );
    if (rejected) stored.status = 'rejected';
    return Response.json(this.detail(stored), { status: 201 });
  }

  private create(orderReference: string, by: Actor): StoredCase {
    const stored: StoredCase = {
      id: `11310000-0000-4000-8000-1000000000${String(++this.sequence).padStart(2, '0')}`,
      orderReference,
      entity: { id: certificationIds.entity, legalName: 'Lactis Demo SRL' },
      status: 'open',
      revision: 1,
      openedAt: this.tick(),
      openedBy: by,
      steps: [],
      attachments: [],
      findings: [],
      certificate: null,
      certificateRevisions: [],
      consistency: { open: [], resolved: [] },
      exchanges: { records: [], entries: [], items: [] },
    };
    this.cases.set(stored.id, stored);
    return stored;
  }

  private append(
    stored: StoredCase,
    step: Step['step'],
    value: Record<string, unknown>,
    reason: string | null,
    by: Actor,
  ) {
    stored.revision += 1;
    stored.steps.push({
      id: `11310000-0000-4000-8000-2000000000${String(++this.sequence).padStart(2, '0')}`,
      step,
      version: stored.steps.filter((entry) => entry.step === step).length + 1,
      caseRevision: stored.revision,
      reason,
      recordedBy: by,
      recordedAt: this.tick(),
      value,
    });
  }

  private summary(stored: StoredCase) {
    const latest = (step: Step['step']) => latestStep(stored, step) ?? null;
    const application = latest('application');
    const review = latest('application_review');
    const duration = latest('duration');
    const agreement = latest('agreement');
    const team = latest('team');
    const decided = latest('team_decision');
    const stagesNext = () =>
      !latest('stage_1_plan')
        ? 'stage_1_plan'
        : latest('stage_1_report')?.value.conclusion !== 'ready'
          ? 'stage_1_report'
          : !latest('stage_2_plan')
            ? 'stage_2_plan'
            : !latest('stage_2_report')
              ? 'stage_2_report'
              : stored.findings.some((finding) =>
                    findingBlocks(this.findingView(stored, finding)),
                  )
                ? 'findings_follow_up'
                : !latest('recommendation')
                  ? 'recommendation'
                  : !latest('certificate_data')
                    ? 'certificate_data'
                    : !latest('dossier_review')
                      ? 'dossier_review'
                      : !latest('decision')
                        ? 'decision'
                        : 'certificate';
    return {
      id: stored.id,
      projectId: this.projectId,
      orderReference: stored.orderReference,
      clientLegalEntity: stored.entity,
      standard: 'iso_22000_2018',
      auditType: 'initial_certification',
      status: stored.status,
      revision: stored.revision,
      nextStep:
        stored.status !== 'open'
          ? null
          : !application
            ? 'application'
            : !review
              ? 'application_review'
              : !duration
                ? 'duration'
                : !agreement
                  ? 'agreement'
                  : !team
                    ? 'team'
                    : decided?.value.teamVersion !== team.version
                      ? 'team_decision'
                      : decided.value.decision === 'returned'
                        ? 'team'
                        : stagesNext(),
      openedBy: stored.openedBy,
      openedAt: stored.openedAt,
    };
  }

  private detail(stored: StoredCase) {
    const latest = (step: Step['step']) => latestStep(stored, step) ?? null;
    return {
      ...this.summary(stored),
      companyId: this.companyId,
      clientAccountId: certificationIds.client,
      application: latest('application'),
      applicationReview: latest('application_review'),
      duration: latest('duration'),
      agreement: latest('agreement'),
      team: latest('team'),
      teamDecision: latest('team_decision'),
      stages: STAGE_STEPS.flatMap((step) => {
        const version = latestStep(stored, step);
        return version ? [version] : [];
      }),
      findings: stored.findings.map((finding) =>
        this.findingView(stored, finding),
      ),
      recommendation: latest('recommendation'),
      dossierReview: latest('dossier_review'),
      decision: latest('decision'),
      certificateData: latest('certificate_data'),
      certificate: stored.certificate,
      release: this.release(stored),
      consistency: {
        ruleSetVersion: 'dossier-consistency-2026-11',
        counts: {
          critical: stored.consistency.open.filter(
            (entry) => entry.verdict === 'critical',
          ).length,
          error: stored.consistency.open.filter(
            (entry) => entry.verdict === 'error',
          ).length,
          toClarify: stored.consistency.open.filter(
            (entry) => entry.verdict === 'to_clarify',
          ).length,
        },
        open: stored.consistency.open,
        resolved: stored.consistency.resolved,
        resolvedTotal: stored.consistency.resolved.length,
      },
      exchanges: {
        records: stored.exchanges.records.slice(-200).map((entry) => ({
          sequence: entry.sequence,
          current: entry.versions.at(-1),
          versions: entry.versions,
        })),
        total: stored.exchanges.records.length,
        nextCursor:
          stored.exchanges.records.length > 200
            ? `${stored.id}:${stored.revision}:${stored.exchanges.records.length - 199}`
            : null,
        sendings: stored.exchanges.records.flatMap((entry) => {
          const current = entry.versions.at(-1);
          return current?.direction === 'sent' ? [current] : [];
        }),
        deadlines: {
          set: this.deadlineSets[0] ?? null,
          entries: this.deadlineSets.length ? stored.exchanges.entries : [],
        },
        reverification: {
          items: stored.exchanges.items,
          firstSurveillanceBy: stored.certificate?.firstSurveillanceBy ?? null,
        },
      },
    };
  }

  /** Seeds immutable exchange versions at the HTTP boundary for screen tests. */
  seedExchangeRecord(
    caseId: string,
    sequence: number,
    versions: Record<string, unknown>[],
  ) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case.');
    stored.exchanges.records.push({ sequence, versions });
  }

  /** Sets the deadline states the server would derive for a Case. */
  seedDeadlineStates(caseId: string, entries: Record<string, unknown>[]) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case.');
    stored.exchanges.entries = entries;
  }

  /** Adds a Re-verification Item as the server would show it. */
  seedReverificationItem(caseId: string, item: Record<string, unknown>) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case.');
    stored.exchanges.items.push(item);
  }

  /** Records the Company's deadline set as its administrator would. */
  seedDeadlineSet(days: Record<string, number | null>) {
    this.deadlineSets.unshift({
      version: this.deadlineSets.length + 1,
      days,
      configuredBy: me,
      configuredAt: this.tick(),
    });
  }

  /** The Company's procedure deadline set, for its administrator only. */
  private deadlines(request: RecordedRequest): Response {
    const actor = record(this.actor());
    const permissions = actor.workspacePermissions;
    if (
      !Array.isArray(permissions) ||
      !permissions.includes('company.assignment.manage')
    )
      return new Response(null, { status: 403 });
    if (request.method !== 'POST')
      return Response.json({
        current: this.deadlineSets[0] ?? null,
        history: this.deadlineSets,
      });
    const input = record(request.body);
    const days = record(input.days);
    const values = [
      'stage_plan_sent',
      'audit_dossier_transmitted',
      'stage_2_report_released',
    ];
    if (
      values.some((kind) => {
        const value = days[kind];
        return (
          value !== null &&
          (typeof value !== 'number' || value < 0 || value > 365)
        );
      })
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    const current = this.deadlineSets[0];
    if (input.expectedVersion !== (current ? current.version : 0))
      return refusal(409, 'STALE_VERSION');
    if (
      current &&
      values.every((kind) => record(current.days)[kind] === days[kind])
    )
      return refusal(409, 'CERTIFICATION_DEADLINES_UNCHANGED');
    const saved = {
      version: this.deadlineSets.length + 1,
      days: Object.fromEntries(values.map((kind) => [kind, days[kind]])),
      configuredBy: me,
      configuredAt: this.tick(),
    };
    this.deadlineSets.unshift(saved);
    return Response.json(saved, { status: 201 });
  }

  /** Records or corrects an Exchange Record as the server would. */
  private recordExchange(
    stored: StoredCase,
    body: unknown,
    target: string | undefined,
  ): Response {
    if (!holdsManager(this.actor())) return new Response(null, { status: 403 });
    const input = record(body);
    const counterpart = record(input.counterpart);
    const ids = input.attachmentIds;
    if (!Array.isArray(ids) || ids.length === 0)
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (input.channel === 'other' && !input.note)
      return refusal(400, 'CERTIFICATION_EXCHANGE_NOTE_REQUIRED');
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status === 'rejected')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    const existing =
      target === undefined
        ? undefined
        : stored.exchanges.records.find(
            (entry) => String(entry.sequence) === target,
          );
    if (target !== undefined && !existing)
      return new Response(null, { status: 404 });
    if ((existing !== undefined) !== (typeof input.reason === 'string'))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    if (
      ids.some(
        (id) => !stored.attachments.some((attachment) => attachment.id === id),
      )
    )
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    if (
      typeof input.businessDate !== 'string' ||
      input.businessDate > '2026-11-07'
    )
      return refusal(409, 'CERTIFICATION_EXCHANGE_IN_FUTURE');
    stored.revision += 1;
    const sequence = existing?.sequence ?? stored.exchanges.records.length + 1;
    const version = (existing?.versions.length ?? 0) + 1;
    const value = {
      id: `11310000-0000-4000-8000-7000000000${String(++this.sequence).padStart(2, '0')}`,
      sequence,
      version,
      caseRevision: stored.revision,
      direction: input.direction,
      itemKind: input.itemKind,
      counterpart: { kind: counterpart.kind, name: counterpart.name },
      businessDate: input.businessDate,
      channel: input.channel,
      reference: input.reference ?? null,
      note: input.note ?? null,
      attachmentIds: ids,
      reason: existing ? input.reason : null,
      recordedBy: me,
      recordedAt: this.tick(),
    };
    if (existing) existing.versions.push(value);
    else stored.exchanges.records.push({ sequence, versions: [value] });
    return Response.json(this.detail(stored), { status: 201 });
  }

  /** Adds a manual Re-verification Item as the server would. */
  private addItem(stored: StoredCase, body: unknown): Response {
    const actor = this.actor();
    if (!holdsManager(actor) && !holdsAuditor(actor) && !holdsApprover(actor))
      return new Response(null, { status: 403 });
    const input = record(body);
    if (typeof input.text !== 'string' || !input.text.trim())
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    stored.revision += 1;
    const source = input.source === null ? null : record(input.source);
    const attached = source
      ? stored.attachments.find((entry) => entry.id === source.attachmentId)
      : undefined;
    stored.exchanges.items.push({
      id: `11310000-0000-4000-8000-8000000000${String(++this.sequence).padStart(2, '0')}`,
      origin: 'manual',
      sequence:
        stored.exchanges.items.filter((item) => item.origin !== 'automatic')
          .length + 1,
      text: input.text,
      caseRevision: stored.revision,
      source: attached
        ? {
            kind: 'attachment',
            attachmentId: attached.id,
            sourceTitle: attached.sourceTitle,
            versionNumber: attached.versionNumber,
          }
        : null,
      addedBy: me,
      addedAt: this.tick(),
      status: 'open',
      withdrawal: null,
    });
    return Response.json(this.detail(stored), { status: 201 });
  }

  /** Withdraws a manual Re-verification Item as the server would. */
  private withdrawItem(
    stored: StoredCase,
    itemId: string,
    body: unknown,
  ): Response {
    if (!holdsManager(this.actor())) return new Response(null, { status: 403 });
    const input = record(body);
    if (typeof input.reason !== 'string' || !input.reason.trim())
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    const item = stored.exchanges.items.find((entry) => entry.id === itemId);
    if (!item) return new Response(null, { status: 404 });
    if (item.origin === 'automatic' || item.status !== 'open')
      return refusal(
        409,
        item.origin === 'automatic'
          ? 'CERTIFICATION_REVERIFICATION_AUTOMATIC'
          : 'CERTIFICATION_REVERIFICATION_WITHDRAWN',
      );
    stored.revision += 1;
    item.status = 'withdrawn';
    item.withdrawal = {
      caseRevision: stored.revision,
      reason: input.reason,
      by: me,
      at: this.tick(),
    };
    return Response.json(this.detail(stored), { status: 201 });
  }

  /** Adds an open Discrepancy the rule set would raise, as the server shows it. */
  seedDiscrepancy(caseId: string, discrepancy: Record<string, unknown>) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case.');
    stored.consistency.open.push(discrepancy);
  }

  /** Records a manual Discrepancy as the server would, in its order of checks. */
  private recordDiscrepancy(stored: StoredCase, body: unknown): Response {
    const actor = this.actor();
    const onTeam = this.onTeam(stored);
    if (!holdsManager(actor) && !holdsAuditor(actor) && !holdsApprover(actor))
      return new Response(null, { status: 403 });
    const input = record(body);
    const left = record(input.left);
    const right = record(input.right);
    const verdict = input.verdict;
    if (
      verdict !== 'critical' &&
      verdict !== 'error' &&
      verdict !== 'to_clarify'
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (
      !holdsManager(actor) &&
      !(holdsAuditor(actor) && onTeam) &&
      !(holdsApprover(actor) && !onTeam)
    )
      return refusal(
        409,
        holdsApprover(actor)
          ? 'CERTIFICATION_INDEPENDENCE'
          : 'CERTIFICATION_NOT_ON_TEAM',
      );
    const side = (value: Record<string, unknown>) => {
      const attached = stored.attachments.find(
        (item) => item.id === value.attachmentId,
      );
      return attached
        ? {
            value: { kind: 'text', text: value.value },
            detail: value.location ?? null,
            source: {
              kind: 'attachment',
              attachment: {
                attachmentId: attached.id,
                documentId: attached.documentId,
                versionId: attached.versionId,
                versionNumber: attached.versionNumber,
                sourceTitle: attached.sourceTitle,
              },
            },
          }
        : undefined;
    };
    const first = side(left);
    const second = side(right);
    if (!first || !second) return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    stored.revision += 1;
    const sequence =
      [...stored.consistency.open, ...stored.consistency.resolved].filter(
        (entry) => entry.origin === 'manual',
      ).length + 1;
    stored.consistency.open.push({
      id: `manual:11310000-0000-4000-8000-6000000000${String(++this.sequence).padStart(2, '0')}`,
      origin: 'manual',
      rule: null,
      sequence,
      subject: { kind: 'manual', text: input.subject },
      note: input.note ?? null,
      verdict,
      left: first,
      right: second,
      openedRevision: stored.revision,
      opened: { by: me, at: this.tick() },
      endedRevision: null,
      status: 'open',
      blocks:
        verdict === 'to_clarify'
          ? null
          : latestStep(stored, 'decision')
            ? 'certificate'
            : 'decision',
      resolution: null,
    });
    return Response.json(this.detail(stored), { status: 201 });
  }

  /** Accepts or corrects an open Discrepancy as the server would. */
  private resolveDiscrepancy(stored: StoredCase, body: unknown): Response {
    const actor = this.actor();
    if (!holdsManager(actor) && !holdsAuditor(actor) && !holdsApprover(actor))
      return new Response(null, { status: 403 });
    const input = record(body);
    if (typeof input.reason !== 'string' || !input.reason.trim())
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status === 'rejected')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    const index = stored.consistency.open.findIndex(
      (entry) => entry.id === input.discrepancyId,
    );
    const target = stored.consistency.open[index];
    if (!target) return refusal(409, 'CERTIFICATION_DISCREPANCY_NOT_OPEN');
    const onTeam = this.onTeam(stored);
    const approver = holdsApprover(actor) && !onTeam;
    const manager = holdsManager(actor);
    const refuse = () =>
      holdsApprover(actor) && onTeam
        ? refusal(409, 'CERTIFICATION_INDEPENDENCE')
        : new Response(null, { status: 403 });
    let source: unknown = null;
    if (input.resolution === 'accepted') {
      if (target.verdict === 'critical')
        return refusal(409, 'CERTIFICATION_DISCREPANCY_CRITICAL');
      if (target.verdict === 'error' ? !approver : !approver && !manager)
        return refuse();
    } else {
      if (target.origin !== 'manual')
        return refusal(409, 'CERTIFICATION_DISCREPANCY_CORRECTED_BY_RECORD');
      if (!approver && !manager) return refuse();
      const correctedBy = record(input.correctedBy);
      const attached = stored.attachments.find(
        (item) => item.id === correctedBy.attachmentId,
      );
      const version = stored.steps.find(
        (step) => step.id === correctedBy.stepVersionId,
      );
      if (attached)
        source = {
          kind: 'attachment',
          attachment: {
            attachmentId: attached.id,
            documentId: attached.documentId,
            versionId: attached.versionId,
            versionNumber: attached.versionNumber,
            sourceTitle: attached.sourceTitle,
          },
        };
      else if (version)
        source = {
          kind: 'step',
          step: version.step,
          version: version.version,
          versionId: version.id,
          attachment: null,
        };
      else return refusal(409, 'CERTIFICATION_CORRECTING_RECORD_UNKNOWN');
    }
    stored.revision += 1;
    stored.consistency.open.splice(index, 1);
    stored.consistency.resolved.unshift({
      ...target,
      status: 'resolved',
      blocks: null,
      resolution: {
        kind: input.resolution === 'accepted' ? 'accepted' : 'corrected',
        via: input.resolution === 'accepted' ? 'acceptance' : 'resolution',
        reason: input.reason,
        by: me,
        at: this.tick(),
        caseRevision: stored.revision,
        ...(input.resolution === 'accepted'
          ? { ruleSetVersion: 'dossier-consistency-2026-11' }
          : { source }),
      },
    });
    return Response.json(this.detail(stored), { status: 201 });
  }

  private tick(): string {
    this.clock += 60_000;
    return new Date(this.clock).toISOString();
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a request record.');
  return Object.fromEntries(Object.entries(value));
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected a list.');
  return value;
}

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const TEAM_ROLE_VALUES = [
  'team_leader',
  'auditor',
  'technical_expert',
  'observer',
];
const DECLARATION_NAMES = [
  'noConsultancy',
  'noEmployment',
  'noManagementInvolvement',
  'confidentiality',
];

/** Some declaration is a conflict or to verify; booleans are the first format. */
function declaresConflict(member: unknown): boolean {
  const declarations = record(record(member).declarations);
  return DECLARATION_NAMES.some(
    (name) => declarations[name] !== 'confirmed' && declarations[name] !== true,
  );
}

const DECLARATION_VALUES: unknown[] = [
  'confirmed',
  'conflict',
  'to_verify',
  true,
  false,
];

/** Absent, null, or an act with its person, function, date and optional form. */
function actingInput(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const {
    actedBy,
    actedByFunction,
    actedOn,
    formAttachmentId = null,
    ...rest
  } = record(value);
  return (
    Object.keys(rest).length === 0 &&
    bounded(actedBy, 200) &&
    bounded(actedByFunction, 200) &&
    calendarDate(actedOn) &&
    (formAttachmentId === null || nonblank(formAttachmentId))
  );
}

function normalName(value: unknown): string {
  return String(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en');
}

/** The server's composition refusal code for submitted members, if any. */
function teamComposition(value: unknown): string | null {
  const invalidInput = 'INVALID_CERTIFICATION_INPUT';
  if (!Array.isArray(value) || value.length < 1 || value.length > 10)
    return invalidInput;
  const members = value.map(record);
  for (const member of members) {
    const declarations = record(member.declarations);
    if (
      !TEAM_ROLE_VALUES.includes(String(member.role)) ||
      typeof member.holdsCategory !== 'boolean' ||
      DECLARATION_NAMES.some(
        (name) => !DECLARATION_VALUES.includes(declarations[name]),
      )
    )
      return invalidInput;
    const note = member.conflictNote === undefined ? null : member.conflictNote;
    if (declaresConflict(member) !== (note !== null))
      return 'CERTIFICATION_TEAM_CONFLICT_NOTE';
    if (
      !nonblank(member.name) ||
      !nonblank(member.competenceNote) ||
      (note !== null && !nonblank(note)) ||
      (member.workspaceMembershipId !== null &&
        typeof member.workspaceMembershipId !== 'string')
    )
      return invalidInput;
  }
  const links = members.flatMap((member) =>
    typeof member.workspaceMembershipId === 'string'
      ? [member.workspaceMembershipId]
      : [],
  );
  if (new Set(links).size !== links.length) return invalidInput;
  const leaders = members.filter((member) => member.role === 'team_leader');
  const [leader] = leaders;
  if (leaders.length !== 1 || !leader) return 'CERTIFICATION_TEAM_LEADER';
  const competent = members.some(
    (member) => member.role !== 'observer' && member.holdsCategory === true,
  );
  const expert = members.some(
    (member) =>
      member.role === 'technical_expert' && member.holdsCategory === true,
  );
  if (!competent || (leader.holdsCategory !== true && !expert))
    return 'CERTIFICATION_TEAM_CATEGORY';
  return null;
}

/** Whether the current actor captures the Certification Approver grant. */
function holdsApprover(actor: unknown): boolean {
  const company = record(record(actor).activeCompany);
  const permissions = company.certificationApproverPermissions;
  return (
    Array.isArray(permissions) && permissions.includes('certification.approve')
  );
}

/** Whether the current actor captures the Certification Auditor grant. */
function holdsAuditor(actor: unknown): boolean {
  const company = record(record(actor).activeCompany);
  const permissions = company.certificationAuditorPermissions;
  return (
    Array.isArray(permissions) &&
    permissions.includes('certification.audit.record')
  );
}

/** Whether the current actor captures the Certification Programme Manager grant. */
function holdsManager(actor: unknown): boolean {
  const company = record(record(actor).activeCompany);
  const permissions = company.certificationProgrammeManagerPermissions;
  return (
    Array.isArray(permissions) &&
    permissions.includes('certification.programme.manage')
  );
}

/** One to four Certificate texts, one per language, as the server accepts them. */
function certificateTexts(
  value: unknown,
): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4)
    return undefined;
  const texts = value.map((entry) =>
    entry && typeof entry === 'object' ? record(entry) : {},
  );
  if (
    texts.some(
      (text) =>
        Object.keys(text).some(
          (key) =>
            !['language', 'holderName', 'address', 'scope'].includes(key),
        ) ||
        !bounded(text.language, 10) ||
        !bounded(text.holderName, 300) ||
        !bounded(text.address, 500) ||
        !bounded(text.scope, 2000),
    )
  )
    return undefined;
  const languages = texts.map((text) => String(text.language).trim());
  if (new Set(languages).size !== languages.length) return undefined;
  return texts.map((text, index) => ({ ...text, language: languages[index] }));
}

/** The same texts language by language, spaces collapsed, as the server compares. */
function sameTexts(left: unknown[], right: unknown[]): boolean {
  const normal = (value: unknown) => String(value).replace(/\s+/gu, ' ').trim();
  return (
    left.length === right.length &&
    left.map(record).every((entry) => {
      const other = right
        .map(record)
        .find((candidate) => candidate.language === entry.language);
      return (
        other !== undefined &&
        normal(other.holderName) === normal(entry.holderName) &&
        normal(other.address) === normal(entry.address) &&
        normal(other.scope) === normal(entry.scope)
      );
    })
  );
}

function latestStep(stored: StoredCase, step: Step['step']) {
  return stored.steps.filter((entry) => entry.step === step).at(-1);
}

/** The latest team version when the latest decision approves it. */
function approvedTeamOf(stored: StoredCase) {
  const team = latestStep(stored, 'team');
  const decided = latestStep(stored, 'team_decision');
  return team &&
    decided?.value.decision === 'approved' &&
    decided.value.teamVersion === team.version
    ? team
    : undefined;
}

function calendarDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  );
}

/** Whole hundredths of a day amount the server accepts, else undefined. */
function dayCents(value: unknown, zeroAllowed: boolean): number | undefined {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/u.test(value)
  )
    return undefined;
  const [whole = '0', fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents > 0 || zeroAllowed ? cents : undefined;
}

/** Absent, null or a non-blank text, as an optional reason. */
function optionalText(value: unknown): boolean {
  return value === undefined || value === null || nonblank(value);
}

function nonconformity(classification: unknown): boolean {
  return (
    classification === 'major_nonconformity' ||
    classification === 'minor_nonconformity'
  );
}

/** The server's rule: a Finding that still holds the next step. */
function findingBlocks(view: {
  stage: string;
  classification: string;
  status: string;
}): boolean {
  if (view.classification === 'major_nonconformity' || view.stage === 'stage_1')
    return (
      nonconformity(view.classification) && view.status !== 'verified_effective'
    );
  if (view.classification === 'minor_nonconformity')
    return (
      view.status !== 'plan_adequate' && view.status !== 'verified_effective'
    );
  return false;
}

/** The server's classification refusal code for a statement, if any. */
function classificationRule(
  classification: string,
  stage: string,
  statement: Record<string, unknown>,
): string | null {
  if (
    classification !== 'opportunity_for_improvement' &&
    (statement.clause === null || statement.area === null)
  )
    return 'CERTIFICATION_FINDING_CLAUSE_REQUIRED';
  if (classification === 'area_of_concern' && stage !== 'stage_1')
    return 'CERTIFICATION_FINDING_CLASSIFICATION_STAGE';
  if (
    nonconformity(classification) &&
    list(statement.evidenceAttachmentIds).length === 0
  )
    return 'CERTIFICATION_FINDING_EVIDENCE_REQUIRED';
  return null;
}

/** Text within a limit, as the server accepts it. */
function bounded(value: unknown, limit: number): value is string {
  return nonblank(value) && value.length <= limit;
}

/** At most ten distinct attachment identifiers. */
function evidenceInput(value: unknown): string[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length > 10 ||
    !value.every(nonblank) ||
    new Set(value).size !== value.length
  )
    return undefined;
  return value.map(String);
}

/** The statement fields exactly, the clause and area optional. */
function statementInput(
  fields: Record<string, unknown>,
): (Record<string, unknown> & { evidenceAttachmentIds: string[] }) | undefined {
  const {
    clause = null,
    area = null,
    statement,
    evidenceAttachmentIds,
  } = fields;
  const evidence = evidenceInput(evidenceAttachmentIds);
  if (
    Object.keys(fields).some(
      (key) =>
        !['clause', 'area', 'statement', 'evidenceAttachmentIds'].includes(key),
    ) ||
    !(clause === null || bounded(clause, 40)) ||
    !(area === null || bounded(area, 300)) ||
    !bounded(statement, 4000) ||
    !evidence
  )
    return undefined;
  return { clause, area, statement, evidenceAttachmentIds: evidence };
}

function responseInput(
  fields: Record<string, unknown>,
): (Record<string, unknown> & { evidenceAttachmentIds: string[] }) | undefined {
  const {
    correction,
    cause,
    correctiveAction,
    receivedOn,
    plannedCompletionOn = null,
    evidenceAttachmentIds = [],
    ...rest
  } = fields;
  const evidence = evidenceInput(evidenceAttachmentIds);
  if (
    Object.keys(rest).length > 0 ||
    !bounded(correction, 4000) ||
    !bounded(cause, 4000) ||
    !bounded(correctiveAction, 4000) ||
    !calendarDate(receivedOn) ||
    !(plannedCompletionOn === null || calendarDate(plannedCompletionOn)) ||
    !evidence
  )
    return undefined;
  return {
    correction,
    cause,
    correctiveAction,
    receivedOn,
    plannedCompletionOn,
    evidenceAttachmentIds: evidence,
  };
}

function verificationInput(
  fields: Record<string, unknown>,
): (Record<string, unknown> & { evidenceAttachmentIds: string[] }) | undefined {
  const {
    verifiedOn,
    method,
    outcome,
    note,
    evidenceAttachmentIds = [],
    ...rest
  } = fields;
  const evidence = evidenceInput(evidenceAttachmentIds);
  if (
    Object.keys(rest).length > 0 ||
    !calendarDate(verifiedOn) ||
    (method !== 'document_review' && method !== 'on_site') ||
    (outcome !== 'effective' && outcome !== 'not_effective') ||
    !bounded(note, 2000) ||
    !evidence
  )
    return undefined;
  return {
    verifiedOn,
    method,
    outcome,
    note,
    evidenceAttachmentIds: evidence,
  };
}

/** Calendar arithmetic on ISO dates in UTC, as the server counts. */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(isoDate: string, months: number): string {
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

/** The same recorded value, whatever the order of its keys. */
function sameValue(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return keys.every(
    (key) => JSON.stringify(left[key]) === JSON.stringify(right[key]),
  );
}

type DurationFacts = {
  foodChainSubcategories: string[];
  haccpStudyCount: number;
  effectiveFte: number;
};
type DurationFactors = {
  primary: string;
  haccpStudies: Record<string, number>;
  increases: Record<string, number>;
  reductions: Record<string, number>;
};
type FakeDurationResult =
  | { kind: 'proposal'; proposal: DurationProposal }
  | { kind: 'manual'; reason: 'FTE_BAND_AMBIGUOUS' }
  | { kind: 'refused'; refusals: DurationRefusal[] };

function applicationFactsOf(value: Record<string, unknown>): DurationFacts {
  const { foodChainSubcategories, haccpStudyCount, effectiveFte } = value;
  if (
    !Array.isArray(foodChainSubcategories) ||
    typeof haccpStudyCount !== 'number' ||
    typeof effectiveFte !== 'number'
  )
    throw new Error('Expected recorded application facts.');
  return {
    foodChainSubcategories: foodChainSubcategories.map(String),
    haccpStudyCount,
    effectiveFte,
  };
}

function durationFactors(value: unknown): DurationFactors {
  const body = record(value);
  const numbers = (entry: unknown) =>
    Object.fromEntries(
      Object.entries(record(entry)).map(([key, number]) => [
        key,
        typeof number === 'number' ? number : Number.NaN,
      ]),
    );
  return {
    primary: String(body.primary),
    haccpStudies: numbers(body.haccpStudies),
    increases: numbers(body.increases),
    reductions: numbers(body.reductions),
  };
}

// The server's basic method in units of 1e-8 day, for fictional vectors only.
const UNIT = 100_000_000;
const QUARTER = UNIT / 4;
/** Basic time TD and per-additional-study time TH, in quarter days. */
const SUBCATEGORY_TIMES: Record<string, { td: number; th: number }> = {
  AI: { td: 4, th: 1 },
  AII: { td: 4, th: 1 },
  BI: { td: 4, th: 1 },
  BII: { td: 4, th: 1 },
  BIII: { td: 4, th: 1 },
  C0: { td: 8, th: 2 },
  CI: { td: 8, th: 2 },
  CII: { td: 8, th: 2 },
  CIII: { td: 8, th: 2 },
  CIV: { td: 8, th: 2 },
  D: { td: 4, th: 2 },
  E: { td: 6, th: 2 },
  FI: { td: 4, th: 2 },
  FII: { td: 4, th: 2 },
  G: { td: 6, th: 1 },
  H: { td: 6, th: 1 },
  I: { td: 6, th: 2 },
  J: { td: 6, th: 2 },
  K: { td: 8, th: 2 },
};
const FTE_BANDS = [
  { upTo: 5, tfte: 0 },
  { upTo: 49, tfte: 2 },
  { upTo: 99, tfte: 4 },
  { upTo: 199, tfte: 6 },
  { upTo: 499, tfte: 8 },
  { upTo: 999, tfte: 10 },
];

function computeDuration(
  facts: DurationFacts,
  factors: DurationFactors,
): FakeDurationResult {
  const sum = (values: number[]) =>
    values.reduce((total, value) => total + value, 0);
  const times = (code: string) =>
    SUBCATEGORY_TIMES[code] ?? { td: Number.NaN, th: Number.NaN };
  const subcategories = facts.foodChainSubcategories;
  if (sum(Object.values(factors.haccpStudies)) !== facts.haccpStudyCount)
    return { kind: 'refused', refusals: ['HACCP_STUDIES_MISMATCH'] };
  const refusals: DurationRefusal[] = [];
  const primary = times(factors.primary);
  if (!subcategories.includes(factors.primary))
    refusals.push('PRIMARY_NOT_SELECTED');
  else if (subcategories.some((code) => times(code).td > primary.td))
    refusals.push('PRIMARY_NOT_HIGHEST_BASIC_TIME');
  if (
    Object.keys(factors.haccpStudies).some(
      (code) => !subcategories.includes(code),
    ) ||
    (factors.haccpStudies[factors.primary] ?? 0) < 1
  )
    refusals.push('HACCP_STUDIES_MISMATCH');
  const reductions = Object.values(factors.reductions);
  if (reductions.some((percent) => percent > 10))
    refusals.push('REDUCTION_FACTOR_CAP');
  if (sum(reductions) > 20) refusals.push('REDUCTION_TOTAL_CAP');
  if (refusals.length) return { kind: 'refused', refusals };
  const wholeFte = Math.ceil(facts.effectiveFte);
  const band = FTE_BANDS.find((entry) => wholeFte <= entry.upTo);
  if (wholeFte >= 1000 || !band)
    return { kind: 'manual', reason: 'FTE_BAND_AMBIGUOUS' };
  const th = sum(
    subcategories.map((code) => {
      const studies = factors.haccpStudies[code] ?? 0;
      return (
        times(code).th * (code === factors.primary ? studies - 1 : studies)
      );
    }),
  );
  const base = primary.td + th + band.tfte;
  const net = sum(Object.values(factors.increases)) - sum(reductions);
  const initial = (base * (100 + net) * QUARTER) / 100;
  const surveillance = (initial * 333) / 1000;
  const recertification = (initial * 666) / 1000;
  const stage1 = Math.ceil(initial / 3 / QUARTER) * QUARTER;
  const stage2 = initial - stage1;
  const warnings: DurationWarning[] = [];
  if (surveillance < UNIT) warnings.push('SURVEILLANCE_BELOW_ONE_DAY');
  if (recertification < UNIT) warnings.push('RECERTIFICATION_BELOW_ONE_DAY');
  if (stage2 < UNIT) warnings.push('STAGE2_BELOW_ONE_DAY');
  return {
    kind: 'proposal',
    proposal: {
      ruleVersion: DURATION_RULE_VERSION,
      basicTime: days(primary.td * QUARTER),
      haccpTime: days(th * QUARTER),
      fteTime: days(band.tfte * QUARTER),
      baseDays: days(base * QUARTER),
      netAdjustmentPercent: net,
      initialOnSite: days(initial),
      initialTotal: days((initial * 6) / 5),
      stage1OnSite: days(stage1),
      stage2OnSite: days(stage2),
      surveillanceOnSite: days(surveillance),
      surveillanceTotal: days((surveillance * 6) / 5),
      recertificationOnSite: days(recertification),
      recertificationTotal: days((recertification * 6) / 5),
      warnings,
    },
  };
}

function days(units: number): string {
  if (!Number.isSafeInteger(units) || units < 0)
    throw new Error(`Inexact fictional duration ${String(units)}`);
  const fraction = String(units % UNIT)
    .padStart(8, '0')
    .replace(/0+$/u, '');
  const whole = String(Math.floor(units / UNIT));
  return fraction ? `${whole}.${fraction}` : whole;
}

/** A proposal amount rounded half up, in whole hundredths of a day. */
function roundedCents(amount: string): number {
  const [whole = '0', fraction = ''] = amount.split('.');
  const units = Number(whole) * UNIT + Number(fraction.padEnd(8, '0'));
  return Math.floor((units + UNIT / 200) / (UNIT / 100));
}

function centsText(cents: number): string {
  const fraction = String(cents % 100)
    .padStart(2, '0')
    .replace(/0+$/u, '');
  const whole = String(Math.floor(cents / 100));
  return fraction ? `${whole}.${fraction}` : whole;
}

function refusal(status: number, code: string): Response {
  return Response.json({ code, message: code }, { status });
}

function primes(count: number): number[] {
  const found: number[] = [];
  for (let candidate = 2; found.length < count; candidate += 1)
    if (found.every((prime) => candidate % prime !== 0)) found.push(candidate);
  return found;
}
const fractionBits = (value: number) =>
  ((value - Math.floor(value)) * 0x100000000) >>> 0;
const SHA256_ROUND = primes(64).map((prime) => fractionBits(Math.cbrt(prime)));
const SHA256_INITIAL = primes(8).map((prime) => fractionBits(Math.sqrt(prime)));
const rotate = (value: number, bits: number) =>
  (value >>> bits) | (value << (32 - bits));

/**
 * SHA-256 of fixture bytes, synchronous and without Node.js modules: this
 * fixture is also present in the web image, which has none.
 */
function sha256Hex(bytes: Uint8Array): string {
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);
  const hash = [...SHA256_INITIAL];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const low = words[i - 15];
      const high = words[i - 2];
      const s0 = rotate(low, 7) ^ rotate(low, 18) ^ (low >>> 3);
      const s1 = rotate(high, 17) ^ rotate(high, 19) ^ (high >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const t1 =
        (h +
          (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
          ((e & f) ^ (~e & g)) +
          SHA256_ROUND[i] +
          words[i]) >>>
        0;
      const t2 =
        ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) +
          ((a & b) ^ (a & c) ^ (b & c))) >>>
        0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, i) => {
      hash[i] = (hash[i] + value) >>> 0;
    });
  }
  return hash.map((value) => value.toString(16).padStart(8, '0')).join('');
}
