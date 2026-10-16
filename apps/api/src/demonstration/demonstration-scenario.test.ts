import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TASK_PRIORITIES } from '../task/task.types.js';
import {
  DEMONSTRATION_PERSONA_PROVIDER,
  DEMONSTRATION_SCENARIO,
  DEMONSTRATION_BASE_SCENARIO,
  demonstrationIdempotencyKey,
  type DemonstrationStep,
} from './demonstration-scenario.js';

const scenario = DEMONSTRATION_SCENARIO;

// Every released step key with the fingerprint of its payload (a persona step
// includes its persona definition). A later scenario version may only append.
const RELEASED_DEMO_V1_STEPS: readonly (readonly [string, string])[] = [
  ['company.prisma-prim', '0307a89febd4e267'],
  ['company.bic', '0045f4ca78ebf682'],
  ['company.ecg', '1c676b23d77461c1'],
  ['persona.ana', 'dd134ac4153b07c9'],
  ['persona.ion', '225bd169670ab92b'],
  ['persona.maria', '76c307c6c2f5e869'],
  ['persona.victor', '5701630429ddbe2c'],
  ['grant.ana.context', 'fa4112f280ad197b'],
  ['grant.ana.director-client', 'bc3f6aab6470f39e'],
  ['grant.ana.project', '9da78dc655aebd01'],
  ['grant.ana.task-manager', '3ceed8acd07b8634'],
  ['grant.ana.document-registrar', '6b2f288e35839a36'],
  ['grant.ana.document-project-organizer', '1b67042b409bd1bf'],
  ['grant.ana.commercial-intake', 'b252a737b601e61d'],
  ['grant.ana.commercial-activity-reader', '9a7a4f92e6e1a0ce'],
  ['grant.ana.service-catalogue', '8f1e106030591eba'],
  ['grant.ana.pricing-configuration', '66a55985d5d9218f'],
  ['grant.ion.context', '76a3cd03068f006f'],
  ['grant.ion.director-client', 'c131cd72bde576f8'],
  ['grant.ion.project', '98c8094b25ca340c'],
  ['grant.ion.task-manager', 'ab0c177eed73dfe3'],
  ['grant.maria.context', '4821584e42338a8b'],
  ['grant.maria.director-client', '98b31294e8c56b76'],
  ['grant.maria.project', '0348f77c07d920a7'],
  ['grant.maria.task-manager', 'ed8174c6425a4b76'],
  ['grant.maria.document-registrar', 'bfd25c007a6792bb'],
  ['grant.maria.document-project-organizer', '17cdcbba42cd9c69'],
  ['grant.maria.commercial-intake', 'bc93410a2e9dcc23'],
  ['grant.maria.commercial-activity-reader', '55df47c06198d069'],
  ['grant.maria.service-catalogue', 'c23ab8bd3e50eeda'],
  ['grant.maria.pricing-configuration', 'e806bf006cbe5f6d'],
  ['grant.victor.context', 'c199ed636b57c665'],
  ['client.grup-demo', '9b5415202c4fe97b'],
  ['client.demo-lactate', '80244027d0577af3'],
  ['client.demo-construct', '82afb5f4fa85d7fb'],
  ['client.grup-demo.bic-relationship', '2e248f5ea78e8317'],
  ['project.iso22000-implementation', 'aced5a30907a029b'],
  ['project.iso22000-implementation.responsible', '27f3368434c71bc2'],
  ['project.iso9001-consulting', '37d83fbb621b0fc7'],
  ['project.iso9001-consulting.responsible', '060a5fc7fb1e6894'],
  ['project.iso9001-certification-audit', 'a3d07895cd1968b7'],
  ['project.iso9001-certification-audit.responsible', 'cd93f2da93af0333'],
  ['project.iso45001-certification-audit', '80c9d0344c89fc69'],
  ['project.iso45001-certification-audit.responsible', '76e2204eddcb1801'],
  ['task.haccp-plan-review', '8face4d014593fa9'],
  ['task.prerequisite-programmes', '5ec230bb96301ba6'],
  ['task.prerequisite-programmes.start', 'b51a8635b10e7fc9'],
  ['task.kick-off-meeting', '33ba57ebd5342a26'],
  ['task.kick-off-meeting.complete', 'ea536d857c60d5f0'],
  ['task.supplier-records', '0412c32c33830260'],
  ['task.supplier-records.block', '93eb8694ec45223a'],
  ['task.gap-analysis', '112ae57d40de3a33'],
  ['task.internal-audit-training', '6bf870686852e4b6'],
  ['task.internal-audit-training.cancel', '8f669bd87061edfe'],
  ['task.audit-plan', '0e6b1ed6bbf8c02c'],
  ['task.audit-team', '571ff31c02b5d206'],
  ['task.audit-team.start', 'f90f552e883fffcb'],
  ['document.iso22000-questionnaire', '8114c2c23f29aa7b'],
  ['document.iso22000-questionnaire.link', 'a89e3a1e3ebc499c'],
  ['document.iso9001-questionnaire', 'cdf23421f8f0ff6d'],
  ['document.iso9001-questionnaire.link', '1b97835cb45e5bf5'],
  ['document.iso45001-questionnaire', 'e3ec1545b0d4ace5'],
  ['document.iso45001-questionnaire.link', 'f29e6a644effe3ba'],
  ['request.grup-demo-iso14001', 'deeaf8f5b6dee5a9'],
  ['request.grup-demo-iso14001.next-action', '49359dfeffae7943'],
  ['request.unidentified-iso9001', 'f3ed751f98258a82'],
  ['request.demo-construct-iso45001', '06dc1e0c5263dd7c'],
  ['catalogue.demo-iso9001-cons', '7d97769b7f5909a7'],
  ['catalogue.demo-iso9001-cons.offering', '75a5a4a7bd8ff1f7'],
  ['catalogue.demo-iso22000-cons', '92d4c46e6457362e'],
  ['catalogue.demo-iso22000-cons.offering', '899cfe72267265f5'],
  ['catalogue.demo-iso14001-cons', 'b4b0f1650fb39f52'],
  ['catalogue.demo-iso14001-cons.offering', '9210b999eec5dd10'],
  ['catalogue.demo-iso9001-cert', '0a1c6b9011745ff8'],
  ['catalogue.demo-iso9001-cert.offering', 'de1214da7e60429c'],
  ['catalogue.demo-iso45001-cert', 'e25f113458049484'],
  ['catalogue.demo-iso45001-cert.offering', '72067f8eb6fa8b04'],
  ['pricing.prisma-prim.rule-v1', '6469c9bbe45fbc6c'],
  ['pricing.bic.rule-v1', '62c86bd63ee09c32'],
];

const RELEASED_DEMO_V2_STEPS: readonly (readonly [string, string])[] = [
  ['grant.ana.pricing-user', '37b786d41a1b85c7'],
  ['grant.maria.pricing-user', '9abb0e286de82949'],
  ['pricing.demo-iso9001-cons.tariff-v1', 'ac3a95cabcd71e1b'],
  ['pricing.demo-iso22000-cons.tariff-v1', '1d2407256b752f2e'],
  ['pricing.demo-iso14001-cons.tariff-v1', '0f41f3887497639c'],
  ['pricing.demo-iso9001-cert.tariff-v1', '9dc432dd08fb9f5c'],
  ['pricing.demo-iso45001-cert.tariff-v1', 'e47d8d575a5ebac1'],
  ['pricing.prisma-prim.snapshot', '9fd474b7fbdad6a7'],
  ['pricing.bic.snapshot', '32d5304ce4f101d0'],
];

// Scenario fields holding displayed free text, identifiers, contact data and
// links; every other string is a closed code or a scenario-internal key.
const DISPLAY_TEXT_FIELDS = new Set([
  'displayName',
  'profile',
  'address',
  'businessActivity',
  'name',
  'position',
  'communicationPreferences',
  'title',
  'reason',
  'purpose',
  'originalText',
  'subject',
  'sourceLabel',
  'scope',
  'nextAction',
  'description',
  'commercialLabel',
  'label',
  'unit',
  'taxLabel',
]);
const IDENTIFIER_FIELDS = new Set(['taxId', 'code']);
const EMAIL_FIELDS = new Set(['email', 'generalEmail']);
const URL_FIELDS = new Set(['url']);
const COMPANY_DISPLAY_NAMES = new Set(['PRISMA-PRIM', 'BIC', 'ECG']);

interface ScenarioText {
  readonly path: string;
  readonly field: string;
  readonly value: string;
}

function texts(value: unknown, path: string, field = ''): ScenarioText[] {
  if (typeof value === 'string') return [{ path, field, value }];
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      texts(item, `${path}[${index}]`, field),
    );
  if (typeof value === 'object' && value !== null)
    return Object.entries(value).flatMap(([key, item]) =>
      texts(item, `${path}.${key}`, key),
    );
  return [];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function fingerprint(step: DemonstrationStep): string {
  // Register links are provenance metadata, not command payload. All business
  // values and keys remain pinned independently of index corrections.
  const business = Object.fromEntries(
    Object.entries(step).filter(([key]) => key !== 'register'),
  );
  const payload =
    step.kind === 'persona.provision'
      ? {
          ...business,
          persona: scenario.personas.find(
            (persona) => persona.key === step.persona,
          ),
        }
      : business;
  return createHash('sha256')
    .update(canonical(payload))
    .digest('hex')
    .slice(0, 16);
}

function isReservedExampleHost(hostname: string): boolean {
  return /(?:^|\.)(?:example\.(?:test|com|net|org))$/u.test(hostname);
}

function stepsOf<Kind extends DemonstrationStep['kind']>(
  kind: Kind,
): Extract<DemonstrationStep, { kind: Kind }>[] {
  return scenario.steps.filter(
    (step): step is Extract<DemonstrationStep, { kind: Kind }> =>
      step.kind === kind,
  );
}

describe('versioned demonstration scenario', () => {
  it('extends the released scenario with five illustrative tariffs and two reproducible calculations', () => {
    expect(
      scenario.steps.filter((step) => step.kind === 'pricing.tariff'),
    ).toHaveLength(5);
    expect(
      scenario.steps
        .filter((step) => step.kind === 'pricing.snapshot')
        .map((step) => step.key),
    ).toEqual(['pricing.prisma-prim.snapshot', 'pricing.bic.snapshot']);
  });
  it('pins every released step key and payload, so later versions only append', () => {
    expect(
      scenario.steps
        .slice(0, RELEASED_DEMO_V1_STEPS.length)
        .map((step) => [step.key, fingerprint(step)]),
    ).toEqual(RELEASED_DEMO_V1_STEPS);
    expect(scenario.steps.length).toBeGreaterThanOrEqual(
      RELEASED_DEMO_V1_STEPS.length,
    );
  });

  it('pins the appended CF-1 steps without changing released command identities', () => {
    expect(scenario.version).toBe('demo-v2');
    expect(
      scenario.steps
        .slice(RELEASED_DEMO_V1_STEPS.length)
        .map((step) => [step.key, fingerprint(step)]),
    ).toEqual(RELEASED_DEMO_V2_STEPS);
  });

  it('keeps unique step keys and stable idempotency keys', () => {
    const keys = scenario.steps.map((step) => step.key);
    expect(new Set(keys).size).toBe(keys.length);
    const [first] = scenario.steps;
    expect(first && demonstrationIdempotencyKey(first)).toBe(
      'demo-v1:company.prisma-prim',
    );
  });

  it('supplies only synthetic, visibly marked content', () => {
    const allTexts = [
      ...texts(scenario.personas, 'personas'),
      ...scenario.steps.flatMap((step) => texts(step, step.key)),
    ];
    const violations: string[] = [];
    for (const { path, field, value } of allTexts) {
      if (DISPLAY_TEXT_FIELDS.has(field)) {
        const companyName =
          field === 'displayName' && COMPANY_DISPLAY_NAMES.has(value);
        if (!companyName && !value.includes('DEMO'))
          violations.push(`${path} lacks DEMO`);
      }
      if (IDENTIFIER_FIELDS.has(field) && !value.startsWith('DEMO-'))
        violations.push(`${path} is not a DEMO- identifier`);
      if (EMAIL_FIELDS.has(field)) {
        const domain = value.split('@')[1] ?? '';
        if (!isReservedExampleHost(domain))
          violations.push(`${path} uses an unreserved email domain`);
      }
      if (URL_FIELDS.has(field)) {
        const url = new URL(value);
        if (url.protocol !== 'https:' || !isReservedExampleHost(url.hostname))
          violations.push(`${path} uses an unreserved URL`);
      }
      if (field !== 'dueDate') {
        if (/\+?\(?\d(?:[\s().-]?\d){6,}/u.test(value))
          violations.push(`${path} looks like a telephone number`);
        if (/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,}/u.test(value))
          violations.push(`${path} looks like a bank account`);
      }
      if (/\d{8,}/u.test(value))
        violations.push(`${path} holds a run of 8 or more digits`);
    }
    for (const persona of scenario.personas)
      if (!persona.subject.startsWith('DEMO-'))
        violations.push(`${persona.key} subject is not a DEMO- identifier`);
    expect(violations).toEqual([]);
    for (const step of stepsOf('request.create')) {
      const [firstSentence = ''] = step.originalText.split('.');
      expect(step.originalText.startsWith('DEMO')).toBe(true);
      expect(firstSentence).toContain('DEMO');
    }
  });

  it('defines four DEMO personas of a dedicated provider with their provisional profiles', () => {
    expect(DEMONSTRATION_PERSONA_PROVIDER).not.toBe('clerk');
    expect(DEMONSTRATION_PERSONA_PROVIDER).not.toBe('local-demo');
    expect(
      scenario.personas.map((persona) => [
        persona.displayName,
        persona.company,
        persona.profile,
      ]),
    ).toEqual([
      ['Ana DEMO', 'prisma-prim', 'DEMO Manager'],
      ['Ion DEMO', 'prisma-prim', 'DEMO Consultant'],
      ['Maria DEMO', 'bic', 'DEMO Manager'],
      ['Victor DEMO', 'ecg', 'DEMO Restricted member'],
    ]);
    const bundlesOf = (persona: string) =>
      DEMONSTRATION_BASE_SCENARIO.steps
        .filter((step) => step.kind === 'grant')
        .filter((step) => step.persona === persona)
        .map((step) => `${step.company}:${step.bundle}`);
    const manager = [
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
    ];
    expect(bundlesOf('ana')).toEqual(manager.map((b) => `prisma-prim:${b}`));
    expect(bundlesOf('ion')).toEqual(
      ['context', 'director-client', 'project', 'task-manager'].map(
        (bundle) => `prisma-prim:${bundle}`,
      ),
    );
    expect(bundlesOf('maria')).toEqual(manager.map((b) => `bic:${b}`));
    expect(bundlesOf('victor')).toEqual(['ecg:context']);
  });

  it('resolves every reference to an earlier step', () => {
    const defined = new Set<string>();
    const missing: string[] = [];
    const need = (step: DemonstrationStep, reference: string) => {
      if (!defined.has(reference)) missing.push(`${step.key} -> ${reference}`);
    };
    for (const step of scenario.steps) {
      switch (step.kind) {
        case 'company.register':
          defined.add(`company:${step.company}`);
          break;
        case 'persona.provision':
          defined.add(`persona:${step.persona}`);
          break;
        case 'grant':
          need(step, `persona:${step.persona}`);
          need(step, `company:${step.company}`);
          break;
        case 'client.register':
          need(step, `persona:${step.actor}`);
          defined.add(`client:${step.client}`);
          break;
        case 'client.relate':
          need(step, `company:${step.company}`);
          need(step, `client:${step.client}`);
          break;
        case 'project.create':
          need(step, `client:${step.client}`);
          defined.add(`project:${step.project}`);
          break;
        case 'project.responsible':
          need(step, `project:${step.project}`);
          need(step, `persona:${step.responsible}`);
          break;
        case 'task.create':
          need(step, `project:${step.project}`);
          if (step.assignee) need(step, `persona:${step.assignee}`);
          defined.add(`task:${step.task}`);
          break;
        case 'task.transition':
          need(step, `task:${step.task}`);
          break;
        case 'document.register':
          need(step, `client:${step.client}`);
          defined.add(`document:${step.document}`);
          break;
        case 'document.link':
          need(step, `document:${step.document}`);
          need(step, `project:${step.project}`);
          break;
        case 'request.create':
          if (step.client) need(step, `client:${step.client}`);
          defined.add(`request:${step.request}`);
          break;
        case 'opportunity.next-action':
          need(step, `request:${step.request}`);
          break;
        case 'catalogue.definition':
          defined.add(`definition:${step.definition}`);
          break;
        case 'catalogue.offering':
          need(step, `definition:${step.definition}`);
          defined.add(`offering:${step.offering}`);
          break;
        case 'pricing.tariff':
          need(step, `offering:${step.offering}`);
          break;
        case 'pricing.snapshot':
          need(step, `request:${step.request}`);
          need(step, `offering:${step.offering}`);
          break;
        case 'pricing.rule':
          break;
        default: {
          const exhaustive: never = step;
          throw new Error(`Unhandled step ${JSON.stringify(exhaustive)}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('covers the operational examples of demo-v1', () => {
    const personaCompany = new Map(
      scenario.personas.map((persona) => [persona.key, persona.company]),
    );
    expect(
      stepsOf('client.register').map((step) => [
        step.fields.displayName,
        personaCompany.get(step.actor),
      ]),
    ).toEqual([
      ['GRUP DEMO SA', 'prisma-prim'],
      ['DEMO Lactate SRL', 'prisma-prim'],
      ['DEMO Construct SRL', 'bic'],
    ]);
    const [grup] = stepsOf('client.register');
    expect(grup?.fields.taxId).toBe('DEMO-IDNO-0001');
    expect(grup?.fields.contacts).toHaveLength(2);
    for (const contact of grup?.fields.contacts ?? []) {
      expect(contact.position).toContain('DEMO');
      expect(contact.decisionRoles.length).toBeGreaterThan(0);
      expect(contact.communicationPreferences).toContain('DEMO');
    }
    expect(stepsOf('client.relate')).toEqual([
      expect.objectContaining({ company: 'bic', client: 'grup-demo' }),
    ]);

    const projects = stepsOf('project.create');
    const responsible = new Map(
      stepsOf('project.responsible').map((step) => [
        step.project,
        step.responsible,
      ]),
    );
    expect(
      projects.map((step) => [
        step.title,
        step.client,
        personaCompany.get(step.actor),
        responsible.get(step.project),
      ]),
    ).toEqual([
      ['DEMO ISO 22000 implementation', 'demo-lactate', 'prisma-prim', 'ion'],
      ['DEMO ISO 9001 consulting', 'grup-demo', 'prisma-prim', 'ana'],
      ['DEMO ISO 9001 certification audit', 'grup-demo', 'bic', 'maria'],
      ['DEMO ISO 45001 certification audit', 'demo-construct', 'bic', 'maria'],
    ]);

    const tasks = stepsOf('task.create');
    const transitions = new Map(
      stepsOf('task.transition').map((step) => [step.task, step.transition]),
    );
    const finalState = (task: string) => {
      const transition = transitions.get(task);
      if (!transition) return 'todo';
      switch (transition.kind) {
        case 'start':
          return 'in_progress';
        case 'block':
          return 'blocked';
        case 'complete':
          return 'done';
        case 'cancel':
          return 'cancelled';
      }
    };
    const open = new Set(['todo', 'in_progress', 'blocked']);
    expect(tasks.length).toBeGreaterThanOrEqual(8);
    expect(new Set(tasks.map((task) => finalState(task.task)))).toEqual(
      new Set(['todo', 'in_progress', 'blocked', 'done', 'cancelled']),
    );
    for (const transition of transitions.values())
      if (transition.kind === 'block' || transition.kind === 'cancel')
        expect(transition.reason).toContain('DEMO');
    expect(new Set(tasks.map((task) => task.priority))).toEqual(
      new Set(TASK_PRIORITIES),
    );
    expect(tasks.some((task) => task.assignee !== null)).toBe(true);
    expect(tasks.some((task) => task.assignee === null)).toBe(true);
    expect(
      tasks.filter(
        (task) =>
          task.dueDate < '2026-10-01' && open.has(finalState(task.task)),
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      tasks.filter((task) => task.dueDate > '2026-12-31').length,
    ).toBeGreaterThanOrEqual(3);

    const documents = stepsOf('document.register');
    expect(documents.map((step) => personaCompany.get(step.actor))).toEqual([
      'prisma-prim',
      'prisma-prim',
      'bic',
    ]);
    expect(stepsOf('document.link').map((step) => step.document)).toEqual(
      documents.map((step) => step.document),
    );

    expect(
      stepsOf('request.create').map((step) => [
        personaCompany.get(step.actor),
        step.client,
      ]),
    ).toEqual([
      ['prisma-prim', 'grup-demo'],
      ['prisma-prim', null],
      ['bic', 'demo-construct'],
    ]);
    expect(stepsOf('request.create')[0]?.opportunity.title).toBe(
      'DEMO ISO 14001 consulting',
    );
    expect(stepsOf('opportunity.next-action')).toEqual([
      expect.objectContaining({ request: 'grup-demo-iso14001' }),
    ]);
  });

  it('offers consulting from PRISMA-PRIM and certification from BIC only', () => {
    const personaCompany = new Map(
      scenario.personas.map((persona) => [persona.key, persona.company]),
    );
    const codesBy = (company: string) =>
      stepsOf('catalogue.offering')
        .filter((step) => personaCompany.get(step.actor) === company)
        .map(
          (step) =>
            stepsOf('catalogue.definition').find(
              (definition) => definition.definition === step.definition,
            )?.code,
        );
    expect(codesBy('prisma-prim')).toEqual([
      'DEMO-ISO9001-CONS',
      'DEMO-ISO22000-CONS',
      'DEMO-ISO14001-CONS',
    ]);
    expect(codesBy('bic')).toEqual(['DEMO-ISO9001-CERT', 'DEMO-ISO45001-CERT']);
    expect(codesBy('ecg')).toEqual([]);
    expect(
      stepsOf('pricing.rule').map((step) => personaCompany.get(step.actor)),
    ).toEqual(['prisma-prim', 'bic']);
  });
});
