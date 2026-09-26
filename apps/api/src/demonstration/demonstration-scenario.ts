import type { ClientContactDecisionRole } from '../client/client.types.js';
import type { TaskPriority } from '../task/task.types.js';

/**
 * The versioned synthetic demonstration scenario (Platform PRD section 17).
 * It is data only: every record it describes is created through the public
 * commands of its owning module by the runner.
 *
 * Released steps are immutable. A later scenario version only appends steps,
 * and `demonstration-scenario.test.ts` pins every released step key and its
 * payload fingerprint.
 */
export const DEMONSTRATION_SCENARIO_VERSION = 'demo-v1';

/**
 * Frozen with the first release so a released step keeps its idempotency key
 * (`demo-v1:<stepKey>`) in every later scenario version.
 */
export const DEMONSTRATION_IDEMPOTENCY_NAMESPACE = 'demo-v1';

/** The dedicated persona provider: neither `clerk` nor `local-demo`. */
export const DEMONSTRATION_PERSONA_PROVIDER = 'demo-seed';

/** The marker every scenario-supplied display text carries. */
export const DEMONSTRATION_MARKER = 'DEMO';

export type DemonstrationCompanyKey = 'prisma-prim' | 'bic' | 'ecg';
export type DemonstrationPersonaKey = 'ana' | 'ion' | 'maria' | 'victor';

/** The ten delivered administrable Company bundles. */
export type DemonstrationBundle =
  | 'context'
  | 'director-client'
  | 'project'
  | 'task-manager'
  | 'document-registrar'
  | 'document-project-organizer'
  | 'commercial-intake'
  | 'commercial-activity-reader'
  | 'service-catalogue'
  | 'pricing-configuration';

/** Rows of the first-tenant substitution register named by scenario steps. */
export type DemonstrationRegisterId =
  | 'SUB-CO-01'
  | 'SUB-RO-01'
  | 'SUB-RO-02'
  | 'SUB-PR-01'
  | 'SUB-PR-03'
  | 'SUB-DE-01'
  | 'SUB-PJ-01'
  | 'SUB-TA-01'
  | 'SUB-DO-01';

export interface DemonstrationPersona {
  readonly key: DemonstrationPersonaKey;
  readonly subject: string;
  readonly displayName: string;
  readonly email: string;
  /** The one Company whose context the persona's business steps use. */
  readonly company: DemonstrationCompanyKey;
  /** The provisional role profile, indexed by register row SUB-RO-02. */
  readonly profile:
    'DEMO Manager' | 'DEMO Consultant' | 'DEMO Restricted member';
}

export interface DemonstrationContact {
  readonly name: string;
  readonly email: string;
  readonly position: string;
  readonly decisionRoles: readonly ClientContactDecisionRole[];
  readonly communicationPreferences: string;
}

export interface DemonstrationClientFields {
  readonly displayName: string;
  readonly taxId?: string;
  readonly address?: string;
  readonly generalEmail?: string;
  readonly businessActivity?: string;
  readonly contacts?: readonly DemonstrationContact[];
}

/** Every transition starts from the version its Task was created with. */
export type DemonstrationTaskTransition =
  | { readonly kind: 'start'; readonly expectedVersion: number }
  | {
      readonly kind: 'block';
      readonly expectedVersion: number;
      readonly reason: string;
    }
  | { readonly kind: 'complete'; readonly expectedVersion: number }
  | {
      readonly kind: 'cancel';
      readonly expectedVersion: number;
      readonly reason: string;
    };

/**
 * One step kind per public command. Administration kinds carry no actor: they
 * are always presented by the configured Workspace owner. Every other kind is
 * presented by its persona in that persona's Company context.
 */
export type DemonstrationAction =
  | {
      readonly kind: 'company.register';
      readonly company: DemonstrationCompanyKey;
      readonly displayName: string;
    }
  | {
      readonly kind: 'persona.provision';
      readonly persona: DemonstrationPersonaKey;
    }
  | {
      readonly kind: 'grant';
      readonly persona: DemonstrationPersonaKey;
      readonly company: DemonstrationCompanyKey;
      readonly bundle: DemonstrationBundle;
    }
  | {
      readonly kind: 'client.register';
      readonly actor: DemonstrationPersonaKey;
      readonly client: string;
      readonly fields: DemonstrationClientFields;
    }
  | {
      readonly kind: 'client.relate';
      readonly company: DemonstrationCompanyKey;
      readonly client: string;
    }
  | {
      readonly kind: 'project.create';
      readonly actor: DemonstrationPersonaKey;
      readonly project: string;
      readonly client: string;
      readonly title: string;
    }
  | {
      readonly kind: 'project.responsible';
      readonly actor: DemonstrationPersonaKey;
      readonly project: string;
      readonly expectedRevision: number;
      readonly responsible: DemonstrationPersonaKey;
    }
  | {
      readonly kind: 'task.create';
      readonly actor: DemonstrationPersonaKey;
      readonly project: string;
      readonly task: string;
      readonly title: string;
      readonly assignee: DemonstrationPersonaKey | null;
      readonly dueDate: string;
      readonly priority: TaskPriority;
    }
  | {
      readonly kind: 'task.transition';
      readonly actor: DemonstrationPersonaKey;
      readonly task: string;
      readonly transition: DemonstrationTaskTransition;
    }
  | {
      readonly kind: 'document.register';
      readonly actor: DemonstrationPersonaKey;
      readonly document: string;
      readonly client: string;
      readonly title: string;
      readonly purpose: string;
      readonly url: string;
    }
  | {
      readonly kind: 'document.link';
      readonly actor: DemonstrationPersonaKey;
      readonly document: string;
      readonly project: string;
      readonly expectedRevision: number;
    }
  | {
      readonly kind: 'request.create';
      readonly actor: DemonstrationPersonaKey;
      readonly request: string;
      readonly client: string | null;
      readonly originalText: string;
      readonly subject: string;
      readonly sourceLabel: string;
      readonly opportunity: {
        readonly title: string;
        readonly scope: string | null;
        readonly nextAction: string;
      };
    }
  | {
      readonly kind: 'opportunity.next-action';
      readonly actor: DemonstrationPersonaKey;
      readonly request: string;
      readonly expectedVersion: number;
      readonly nextAction: string;
    }
  | {
      readonly kind: 'catalogue.definition';
      readonly actor: DemonstrationPersonaKey;
      readonly definition: string;
      readonly code: string;
      readonly name: string;
      readonly description: string;
    }
  | {
      readonly kind: 'catalogue.offering';
      readonly actor: DemonstrationPersonaKey;
      readonly offering: string;
      readonly definition: string;
      readonly commercialLabel: string;
    }
  | {
      readonly kind: 'pricing.rule';
      readonly actor: DemonstrationPersonaKey;
      readonly label: string;
    };

export type DemonstrationStep = {
  readonly key: string;
  readonly register: DemonstrationRegisterId;
} & DemonstrationAction;

export interface DemonstrationScenario {
  readonly version: string;
  readonly personas: readonly DemonstrationPersona[];
  readonly steps: readonly DemonstrationStep[];
}

export const DEMONSTRATION_PERSONAS = [
  {
    key: 'ana',
    subject: 'DEMO-persona-ana',
    displayName: 'Ana DEMO',
    email: 'ana.demo@example.test',
    company: 'prisma-prim',
    profile: 'DEMO Manager',
  },
  {
    key: 'ion',
    subject: 'DEMO-persona-ion',
    displayName: 'Ion DEMO',
    email: 'ion.demo@example.test',
    company: 'prisma-prim',
    profile: 'DEMO Consultant',
  },
  {
    key: 'maria',
    subject: 'DEMO-persona-maria',
    displayName: 'Maria DEMO',
    email: 'maria.demo@example.test',
    company: 'bic',
    profile: 'DEMO Manager',
  },
  {
    key: 'victor',
    subject: 'DEMO-persona-victor',
    displayName: 'Victor DEMO',
    email: 'victor.demo@example.test',
    company: 'ecg',
    profile: 'DEMO Restricted member',
  },
] as const satisfies readonly DemonstrationPersona[];

const MANAGER_BUNDLES = [
  'context',
  'director-client',
  'project',
  'task-manager',
  'document-registrar',
  'document-project-organizer',
  'commercial-intake',
  'commercial-activity-reader',
  'service-catalogue',
  'pricing-configuration',
] as const satisfies readonly DemonstrationBundle[];

// The delivered Task-assignee eligibility needs Project and Client read plus
// Task read, which only Task Manager carries (as in the #281 fixture).
const CONSULTANT_BUNDLES = [
  'context',
  'director-client',
  'project',
  'task-manager',
] as const satisfies readonly DemonstrationBundle[];

const RESTRICTED_BUNDLES = [
  'context',
] as const satisfies readonly DemonstrationBundle[];

function grants(
  persona: DemonstrationPersonaKey,
  company: DemonstrationCompanyKey,
  bundles: readonly DemonstrationBundle[],
): DemonstrationStep[] {
  return bundles.map((bundle): DemonstrationStep => ({
    key: `grant.${persona}.${bundle}`,
    register: 'SUB-RO-02',
    kind: 'grant',
    persona,
    company,
    bundle,
  }));
}

function catalogueEntry(input: {
  actor: DemonstrationPersonaKey;
  slug: string;
  code: string;
  name: string;
}): DemonstrationStep[] {
  const definition = `catalogue.${input.slug}`;
  return [
    {
      key: definition,
      register: 'SUB-PR-01',
      kind: 'catalogue.definition',
      actor: input.actor,
      definition,
      code: input.code,
      name: input.name,
      description: `${input.name}: illustrative DEMO Service Definition, not a real service offer.`,
    },
    {
      key: `${definition}.offering`,
      register: 'SUB-PR-01',
      kind: 'catalogue.offering',
      actor: input.actor,
      offering: `${definition}.offering`,
      definition,
      commercialLabel: `${input.name} (illustrative DEMO offering)`,
    },
  ];
}

const DEMONSTRATION_STEPS: readonly DemonstrationStep[] = [
  {
    key: 'company.prisma-prim',
    register: 'SUB-CO-01',
    kind: 'company.register',
    company: 'prisma-prim',
    displayName: 'PRISMA-PRIM',
  },
  {
    key: 'company.bic',
    register: 'SUB-CO-01',
    kind: 'company.register',
    company: 'bic',
    displayName: 'BIC',
  },
  {
    key: 'company.ecg',
    register: 'SUB-CO-01',
    kind: 'company.register',
    company: 'ecg',
    displayName: 'ECG',
  },
  ...DEMONSTRATION_PERSONAS.map((persona): DemonstrationStep => ({
    key: `persona.${persona.key}`,
    register: 'SUB-RO-01',
    kind: 'persona.provision',
    persona: persona.key,
  })),
  ...grants('ana', 'prisma-prim', MANAGER_BUNDLES),
  ...grants('ion', 'prisma-prim', CONSULTANT_BUNDLES),
  ...grants('maria', 'bic', MANAGER_BUNDLES),
  ...grants('victor', 'ecg', RESTRICTED_BUNDLES),
  {
    key: 'client.grup-demo',
    register: 'SUB-DE-01',
    kind: 'client.register',
    actor: 'ana',
    client: 'grup-demo',
    fields: {
      displayName: 'GRUP DEMO SA',
      taxId: 'DEMO-IDNO-0001',
      address: 'DEMO Example Street 1, DEMO City',
      generalEmail: 'office@grup-demo.example.test',
      businessActivity: 'DEMO food processing group with two DEMO sites',
      contacts: [
        {
          name: 'Elena DEMO',
          email: 'elena.demo@grup-demo.example.test',
          position: 'DEMO Quality manager',
          decisionRoles: ['final_decision_maker', 'financial'],
          communicationPreferences:
            'DEMO prefers email and a short weekly DEMO summary',
        },
        {
          name: 'Petru DEMO',
          email: 'petru.demo@grup-demo.example.test',
          position: 'DEMO Production lead',
          decisionRoles: ['influencer', 'technical'],
          communicationPreferences: 'DEMO available on weekday DEMO mornings',
        },
      ],
    },
  },
  {
    key: 'client.demo-lactate',
    register: 'SUB-DE-01',
    kind: 'client.register',
    actor: 'ana',
    client: 'demo-lactate',
    fields: {
      displayName: 'DEMO Lactate SRL',
      businessActivity: 'DEMO dairy products',
    },
  },
  {
    key: 'client.demo-construct',
    register: 'SUB-DE-01',
    kind: 'client.register',
    actor: 'maria',
    client: 'demo-construct',
    fields: {
      displayName: 'DEMO Construct SRL',
      businessActivity: 'DEMO construction works',
    },
  },
  {
    key: 'client.grup-demo.bic-relationship',
    register: 'SUB-DE-01',
    kind: 'client.relate',
    company: 'bic',
    client: 'grup-demo',
  },
  {
    key: 'project.iso22000-implementation',
    register: 'SUB-PJ-01',
    kind: 'project.create',
    actor: 'ion',
    project: 'iso22000-implementation',
    client: 'demo-lactate',
    title: 'DEMO ISO 22000 implementation',
  },
  {
    key: 'project.iso22000-implementation.responsible',
    register: 'SUB-PJ-01',
    kind: 'project.responsible',
    actor: 'ion',
    project: 'iso22000-implementation',
    expectedRevision: 0,
    responsible: 'ion',
  },
  {
    key: 'project.iso9001-consulting',
    register: 'SUB-PJ-01',
    kind: 'project.create',
    actor: 'ana',
    project: 'iso9001-consulting',
    client: 'grup-demo',
    title: 'DEMO ISO 9001 consulting',
  },
  {
    key: 'project.iso9001-consulting.responsible',
    register: 'SUB-PJ-01',
    kind: 'project.responsible',
    actor: 'ana',
    project: 'iso9001-consulting',
    expectedRevision: 0,
    responsible: 'ana',
  },
  {
    key: 'project.iso9001-certification-audit',
    register: 'SUB-PJ-01',
    kind: 'project.create',
    actor: 'maria',
    project: 'iso9001-certification-audit',
    client: 'grup-demo',
    title: 'DEMO ISO 9001 certification audit',
  },
  {
    key: 'project.iso9001-certification-audit.responsible',
    register: 'SUB-PJ-01',
    kind: 'project.responsible',
    actor: 'maria',
    project: 'iso9001-certification-audit',
    expectedRevision: 0,
    responsible: 'maria',
  },
  {
    key: 'project.iso45001-certification-audit',
    register: 'SUB-PJ-01',
    kind: 'project.create',
    actor: 'maria',
    project: 'iso45001-certification-audit',
    client: 'demo-construct',
    title: 'DEMO ISO 45001 certification audit',
  },
  {
    key: 'project.iso45001-certification-audit.responsible',
    register: 'SUB-PJ-01',
    kind: 'project.responsible',
    actor: 'maria',
    project: 'iso45001-certification-audit',
    expectedRevision: 0,
    responsible: 'maria',
  },
  {
    key: 'task.haccp-plan-review',
    register: 'SUB-TA-01',
    kind: 'task.create',
    actor: 'ion',
    project: 'iso22000-implementation',
    task: 'haccp-plan-review',
    title: 'DEMO Review the HACCP plan',
    assignee: 'ion',
    dueDate: '2026-09-15',
    priority: 'critical',
  },
  {
    key: 'task.prerequisite-programmes',
    register: 'SUB-TA-01',
    kind: 'task.create',
    actor: 'ion',
    project: 'iso22000-implementation',
    task: 'prerequisite-programmes',
    title: 'DEMO Document the prerequisite programmes',
    assignee: 'ion',
    dueDate: '2026-09-25',
    priority: 'important',
  },
  {
    key: 'task.prerequisite-programmes.start',
    register: 'SUB-TA-01',
    kind: 'task.transition',
    actor: 'ion',
    task: 'prerequisite-programmes',
    transition: { kind: 'start', expectedVersion: 1 },
  },
  {
    key: 'task.kick-off-meeting',
    register: 'SUB-TA-01',
    kind: 'task.create',
    actor: 'ion',
    project: 'iso22000-implementation',
    task: 'kick-off-meeting',
    title: 'DEMO Hold the kick-off meeting',
    assignee: 'ion',
    dueDate: '2026-09-10',
    priority: 'normal',
  },
  {
    key: 'task.kick-off-meeting.complete',
    register: 'SUB-TA-01',
    kind: 'task.transition',
    actor: 'ion',
    task: 'kick-off-meeting',
    transition: { kind: 'complete', expectedVersion: 1 },
  },
  {
    key: 'task.supplier-records',
    register: 'SUB-TA-01',
    kind: 'task.create',
    actor: 'ion',
    project: 'iso22000-implementation',
    task: 'supplier-records',
    title: 'DEMO Collect the supplier approval records',
    assignee: null,
    dueDate: '2027-01-20',
    priority: 'important',
  },
  {
    key: 'task.supplier-records.block',
    register: 'SUB-TA-01',
    kind: 'task.transition',
    actor: 'ion',
    task: 'supplier-records',
    transition: {
      kind: 'block',
      expectedVersion: 1,
      reason: 'DEMO Waiting for the DEMO supplier list from the Client',
    },
  },
  {
    key: 'task.gap-analysis',
    register: 'SUB-TA-01',
    kind: 'task.create',
    actor: 'ana',
    project: 'iso9001-consulting',
    task: 'gap-analysis',
    title: 'DEMO Prepare the gap analysis',
    assignee: 'ion',
    dueDate: '2027-01-15',
    priority: 'normal',
  },
  {
    key: 'task.internal-audit-training',
    register: 'SUB-TA-01',
    kind: 'task.create',
    actor: 'ana',
    project: 'iso9001-consulting',
    task: 'internal-audit-training',
    title: 'DEMO Plan the internal audit training',
    assignee: null,
    dueDate: '2027-02-10',
    priority: 'normal',
  },
  {
    key: 'task.internal-audit-training.cancel',
    register: 'SUB-TA-01',
    kind: 'task.transition',
    actor: 'ana',
    task: 'internal-audit-training',
    transition: {
      kind: 'cancel',
      expectedVersion: 1,
      reason: 'DEMO The Client postponed the DEMO training',
    },
  },
  {
    key: 'task.audit-plan',
    register: 'SUB-TA-01',
    kind: 'task.create',
    actor: 'maria',
    project: 'iso9001-certification-audit',
    task: 'audit-plan',
    title: 'DEMO Draft the audit plan',
    assignee: 'maria',
    dueDate: '2027-03-01',
    priority: 'critical',
  },
  {
    key: 'task.audit-team',
    register: 'SUB-TA-01',
    kind: 'task.create',
    actor: 'maria',
    project: 'iso45001-certification-audit',
    task: 'audit-team',
    title: 'DEMO Confirm the audit team availability',
    assignee: null,
    dueDate: '2026-11-20',
    priority: 'important',
  },
  {
    key: 'task.audit-team.start',
    register: 'SUB-TA-01',
    kind: 'task.transition',
    actor: 'maria',
    task: 'audit-team',
    transition: { kind: 'start', expectedVersion: 1 },
  },
  {
    key: 'document.iso22000-questionnaire',
    register: 'SUB-DO-01',
    kind: 'document.register',
    actor: 'ana',
    document: 'iso22000-questionnaire',
    client: 'demo-lactate',
    title: 'DEMO ISO 22000 pre-assessment questionnaire',
    purpose: 'DEMO working questionnaire for the ISO 22000 implementation',
    url: 'https://documents.example.test/demo/iso22000-questionnaire',
  },
  {
    key: 'document.iso22000-questionnaire.link',
    register: 'SUB-DO-01',
    kind: 'document.link',
    actor: 'ana',
    document: 'iso22000-questionnaire',
    project: 'iso22000-implementation',
    expectedRevision: 0,
  },
  {
    key: 'document.iso9001-questionnaire',
    register: 'SUB-DO-01',
    kind: 'document.register',
    actor: 'ana',
    document: 'iso9001-questionnaire',
    client: 'grup-demo',
    title: 'DEMO ISO 9001 consulting questionnaire',
    purpose: 'DEMO working questionnaire for the ISO 9001 consulting',
    url: 'https://documents.example.test/demo/iso9001-questionnaire',
  },
  {
    key: 'document.iso9001-questionnaire.link',
    register: 'SUB-DO-01',
    kind: 'document.link',
    actor: 'ana',
    document: 'iso9001-questionnaire',
    project: 'iso9001-consulting',
    expectedRevision: 0,
  },
  {
    key: 'document.iso45001-questionnaire',
    register: 'SUB-DO-01',
    kind: 'document.register',
    actor: 'maria',
    document: 'iso45001-questionnaire',
    client: 'demo-construct',
    title: 'DEMO ISO 45001 application questionnaire',
    purpose: 'DEMO working questionnaire for the ISO 45001 certification audit',
    url: 'https://documents.example.test/demo/iso45001-questionnaire',
  },
  {
    key: 'document.iso45001-questionnaire.link',
    register: 'SUB-DO-01',
    kind: 'document.link',
    actor: 'maria',
    document: 'iso45001-questionnaire',
    project: 'iso45001-certification-audit',
    expectedRevision: 0,
  },
  {
    key: 'request.grup-demo-iso14001',
    register: 'SUB-DE-01',
    kind: 'request.create',
    actor: 'ana',
    request: 'grup-demo-iso14001',
    client: 'grup-demo',
    originalText:
      'DEMO synthetic request for demonstration only. GRUP DEMO SA asks for ISO 14001 consulting for one DEMO production site.',
    subject: 'DEMO ISO 14001 consulting request',
    sourceLabel: 'DEMO email',
    opportunity: {
      title: 'DEMO ISO 14001 consulting',
      scope: 'DEMO environmental management system for one DEMO site',
      nextAction: 'DEMO Call the Client to confirm the scope',
    },
  },
  {
    key: 'request.grup-demo-iso14001.next-action',
    register: 'SUB-DE-01',
    kind: 'opportunity.next-action',
    actor: 'ana',
    request: 'grup-demo-iso14001',
    expectedVersion: 1,
    nextAction: 'DEMO Send the illustrative scope summary',
  },
  {
    key: 'request.unidentified-iso9001',
    register: 'SUB-DE-01',
    kind: 'request.create',
    actor: 'ana',
    request: 'unidentified-iso9001',
    client: null,
    originalText:
      'DEMO synthetic request for demonstration only. A caller asks about ISO 9001 consulting without naming the DEMO organization.',
    subject: 'DEMO ISO 9001 enquiry without a Client',
    sourceLabel: 'DEMO telephone note',
    opportunity: {
      title: 'DEMO ISO 9001 enquiry',
      scope: null,
      nextAction: 'DEMO Identify the requesting organization',
    },
  },
  {
    key: 'request.demo-construct-iso45001',
    register: 'SUB-DE-01',
    kind: 'request.create',
    actor: 'maria',
    request: 'demo-construct-iso45001',
    client: 'demo-construct',
    originalText:
      'DEMO synthetic request for demonstration only. DEMO Construct SRL asks for an ISO 45001 certification audit.',
    subject: 'DEMO ISO 45001 certification request',
    sourceLabel: 'DEMO web form',
    opportunity: {
      title: 'DEMO ISO 45001 certification',
      scope: 'DEMO occupational health and safety management system',
      nextAction: 'DEMO Send the application questionnaire',
    },
  },
  ...catalogueEntry({
    actor: 'ana',
    slug: 'demo-iso9001-cons',
    code: 'DEMO-ISO9001-CONS',
    name: 'DEMO ISO 9001 consulting',
  }),
  ...catalogueEntry({
    actor: 'ana',
    slug: 'demo-iso22000-cons',
    code: 'DEMO-ISO22000-CONS',
    name: 'DEMO ISO 22000 consulting',
  }),
  ...catalogueEntry({
    actor: 'ana',
    slug: 'demo-iso14001-cons',
    code: 'DEMO-ISO14001-CONS',
    name: 'DEMO ISO 14001 consulting',
  }),
  ...catalogueEntry({
    actor: 'maria',
    slug: 'demo-iso9001-cert',
    code: 'DEMO-ISO9001-CERT',
    name: 'DEMO ISO 9001 certification audit',
  }),
  ...catalogueEntry({
    actor: 'maria',
    slug: 'demo-iso45001-cert',
    code: 'DEMO-ISO45001-CERT',
    name: 'DEMO ISO 45001 certification audit',
  }),
  {
    key: 'pricing.prisma-prim.rule-v1',
    register: 'SUB-PR-03',
    kind: 'pricing.rule',
    actor: 'ana',
    label: 'DEMO illustrative rule v1',
  },
  {
    key: 'pricing.bic.rule-v1',
    register: 'SUB-PR-03',
    kind: 'pricing.rule',
    actor: 'maria',
    label: 'DEMO illustrative rule v1',
  },
];

export const DEMONSTRATION_SCENARIO: DemonstrationScenario = {
  version: DEMONSTRATION_SCENARIO_VERSION,
  personas: DEMONSTRATION_PERSONAS,
  steps: DEMONSTRATION_STEPS,
};

/** The stable per-step key a command presents; never derived from the run. */
export function demonstrationIdempotencyKey(step: DemonstrationStep): string {
  return `${DEMONSTRATION_IDEMPOTENCY_NAMESPACE}:${step.key}`;
}

/**
 * Accepted-invitation entries that admit exactly the scenario personas into
 * the configured demonstration Workspace, in the delivered admission format.
 */
export function demonstrationPersonaAdmissions(
  workspaceId: string,
  scenario: DemonstrationScenario = DEMONSTRATION_SCENARIO,
): { provider: string; subject: string; workspaceId: string }[] {
  return scenario.personas.map((persona) => ({
    provider: DEMONSTRATION_PERSONA_PROVIDER,
    subject: persona.subject,
    workspaceId,
  }));
}
