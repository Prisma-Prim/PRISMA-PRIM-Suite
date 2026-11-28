import type { ReactNode } from 'react';
import {
  ArrowLeftRight,
  FileText,
  History,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { CertificationCaseView } from '../../certification/certification-command';
import type { CertificationMessageKey } from '../../certification/certification.copy';
import type { ConsistencyMessageKey } from '../../certification/certification-consistency.copy';
import type { ExchangeMessageKey } from '../../certification/certification-exchanges.copy';
import { findingBlocks } from '../../certification/certification-findings';
import type {
  CaseDetail,
  CertificationNextStep,
} from '../../certification/certification-response';
import { approvedTeam } from '../../certification/certification-stages';
import {
  TimelineView,
  type CaseStepStates,
} from '../../certification/CertificationViews';
import type { CertificationRegistry } from '../../certification/use-certification-registry';

/** What a step or register renderer receives: the Case owner and its read Case. */
export type CaseStepContext = Readonly<{
  registry: CertificationRegistry;
  view: CertificationCaseView;
  busy: boolean;
}>;

/**
 * Renders the body of one step or register under the page's own heading.
 * Null means the step is not open yet: the page then says it waits for the
 * earlier steps.
 */
export type CaseStepRenderer = (context: CaseStepContext) => ReactNode;

/** One step of the procedure, in the server's next-step order. */
export type CaseStep = Readonly<{
  id: string;
  /** Its name, from the Certification catalogue both interfaces share. */
  label: CertificationMessageKey;
  /** The next steps of the read Case this step carries. */
  covers: readonly NonNullable<CertificationNextStep>[];
  /** Whether its record exists, which marks it done on a closed Case. */
  recorded: (detail: CaseDetail) => boolean;
  /** Its plain-language state, as the step rail of the Case says it. */
  state: (states: CaseStepStates, detail: CaseDetail) => string;
  render: CaseStepRenderer;
}>;

/**
 * The steps of a Certification Case, from the application to the
 * Certificate. #1538 draws the steps up to Stage 2 in Clarté; each later
 * step still shows the current interface's sections of that step until
 * #1539 replaces its `render`, so every existing function stays reachable.
 */
export const caseSteps = [
  {
    id: 'application',
    label: 'stepApplication',
    covers: ['application'],
    recorded: (detail) => detail.application !== null,
    state: (states) => states.application,
    render: ({ registry, busy }) => registry.intake.render(busy, 'application'),
  },
  {
    id: 'review',
    label: 'stepReview',
    covers: ['application_review'],
    recorded: (detail) => detail.applicationReview !== null,
    state: (states) => states.review,
    render: ({ registry, busy }) => registry.intake.render(busy, 'review'),
  },
  {
    id: 'duration',
    label: 'stepDuration',
    covers: ['duration'],
    recorded: (detail) => detail.duration !== null,
    state: (states) => states.duration,
    render: ({ registry, busy }) => registry.intake.render(busy, 'duration'),
  },
  {
    id: 'agreement',
    label: 'stepAgreement',
    covers: ['agreement'],
    recorded: (detail) => detail.agreement !== null,
    state: (states) => states.agreement,
    render: ({ registry, busy }) => registry.intake.render(busy, 'agreement'),
  },
  {
    id: 'team',
    label: 'stepTeam',
    covers: ['team', 'team_decision'],
    recorded: (detail) => approvedTeam(detail) !== undefined,
    state: (states, detail) =>
      detail.team === null ? states.team : states.teamDecision,
    render: ({ registry, view, busy }) =>
      view.caseDetail.agreement === null && view.caseDetail.team === null
        ? null
        : registry.team.render(busy),
  },
  {
    id: 'stage1',
    label: 'stepStage1',
    covers: ['stage_1_plan', 'stage_1_report'],
    recorded: (detail) => detail.stage1Report !== null,
    state: (states) => states.stage1,
    render: ({ registry, busy }) =>
      registry.stages.renderStage(busy, 'stage_1', (stage) =>
        registry.findings.render(stage, busy),
      ),
  },
  {
    id: 'stage2',
    label: 'stepStage2',
    covers: ['stage_2_plan', 'stage_2_report'],
    recorded: (detail) => detail.stage2Report !== null,
    state: (states) => states.stage2,
    render: ({ registry, busy }) =>
      registry.stages.renderStage(busy, 'stage_2', (stage) =>
        registry.findings.render(stage, busy),
      ),
  },
  // #1539 replaces the renderers below with its Clarté screens.
  {
    id: 'findings',
    label: 'stepFindings',
    covers: ['findings_follow_up'],
    recorded: (detail) =>
      detail.stage2Report !== null && !detail.findings.some(findingBlocks),
    state: (states) => states.findings,
    render: ({ registry, view, busy }) =>
      view.caseDetail.stage1Plan === null ? null : (
        <>
          {registry.findings.render('stage_1', busy)}
          {view.caseDetail.stage2Plan !== null &&
            registry.findings.render('stage_2', busy)}
        </>
      ),
  },
  {
    id: 'recommendation',
    label: 'stepRecommendation',
    covers: ['recommendation'],
    recorded: (detail) => detail.recommendation !== null,
    state: (states) => states.recommendation,
    render: ({ registry, view, busy }) =>
      view.caseDetail.stage2Report === null
        ? null
        : registry.closing.render(busy, 'recommendation'),
  },
  {
    id: 'certificateData',
    label: 'stepCertificateData',
    covers: ['certificate_data'],
    recorded: (detail) => detail.certificateData !== null,
    state: (states) => states.certificateData,
    render: ({ registry, view, busy }) =>
      view.caseDetail.stage2Report === null &&
      view.caseDetail.certificateData === null
        ? null
        : registry.closing.render(busy, 'certificateData'),
  },
  {
    id: 'dossierReview',
    label: 'stepDossierReview',
    covers: ['dossier_review'],
    recorded: (detail) => detail.dossierReview !== null,
    state: (states) => states.dossierReview,
    render: ({ registry, view, busy }) =>
      view.caseDetail.recommendation === null
        ? null
        : registry.closing.render(busy, 'dossierReview'),
  },
  {
    id: 'decision',
    label: 'stepCertificationDecision',
    covers: ['decision'],
    recorded: (detail) => detail.decision !== null,
    state: (states) => states.decision,
    render: ({ registry, view, busy }) =>
      view.caseDetail.recommendation === null
        ? null
        : registry.closing.render(busy, 'decision'),
  },
  {
    id: 'certificate',
    label: 'stepCertificate',
    covers: ['certificate'],
    recorded: (detail) => detail.certificate !== null,
    state: (states) => states.certificate,
    render: ({ registry, busy }) =>
      registry.closing.render(busy, 'certificate'),
  },
] as const satisfies readonly CaseStep[];

export type CaseStepId = (typeof caseSteps)[number]['id'];

/** Where a register's name comes from: the catalogue that owns that register. */
export type CaseRegisterLabel =
  | { catalogue: 'certification'; key: CertificationMessageKey }
  | { catalogue: 'exchanges'; key: ExchangeMessageKey }
  | { catalogue: 'consistency'; key: ConsistencyMessageKey };

/** A register of the whole Case, beside the steps. */
export type CaseRegister = Readonly<{
  id: string;
  label: CaseRegisterLabel;
  icon: LucideIcon;
  render: CaseStepRenderer;
}>;

/**
 * The Case's registers. The timeline is Clarté's (#1538); the others show
 * the current interface's sections until #1539 replaces their `render`.
 */
export const caseRegisters = [
  {
    id: 'documents',
    label: { catalogue: 'certification', key: 'documentsTitle' },
    icon: FileText,
    render: ({ registry, busy }) => registry.documents.render(busy),
  },
  {
    id: 'exchanges',
    label: { catalogue: 'exchanges', key: 'title' },
    icon: ArrowLeftRight,
    render: ({ registry, busy }) => registry.dossier.render(busy, 'exchanges'),
  },
  {
    id: 'consistency',
    label: { catalogue: 'consistency', key: 'title' },
    icon: ShieldCheck,
    render: ({ registry, busy }) =>
      registry.dossier.render(busy, 'consistency'),
  },
  {
    id: 'timeline',
    label: { catalogue: 'certification', key: 'timelineTitle' },
    icon: History,
    render: ({ registry, view }) => (
      <section aria-label={registry.copy('timelineTitle')}>
        <TimelineView
          timeline={view.timeline}
          findings={view.caseDetail.findings}
          certificate={view.caseDetail.certificate}
          register={view.register}
          people={registry.team.knownPeople(view)}
        />
      </section>
    ),
  },
] as const satisfies readonly CaseRegister[];

export type CaseRegisterId = (typeof caseRegisters)[number]['id'];

/** How a step stands on the read Case. */
export type CaseStepStatus = 'done' | 'current' | 'upcoming' | 'notReached';

/**
 * Done, current or upcoming by the server's next step on an open Case; on a
 * closed Case, done when recorded and otherwise never reached.
 */
export function caseStepStatuses(
  detail: CaseDetail,
): ReadonlyMap<CaseStepId, CaseStepStatus> {
  const next = detail.nextStep;
  const currentIndex =
    next === null
      ? -1
      : caseSteps.findIndex((step) =>
          step.covers.some((covered) => covered === next),
        );
  return new Map(
    caseSteps.map((step, index): [CaseStepId, CaseStepStatus] => {
      if (currentIndex < 0)
        return [step.id, step.recorded(detail) ? 'done' : 'notReached'];
      if (index < currentIndex) return [step.id, 'done'];
      return [step.id, index === currentIndex ? 'current' : 'upcoming'];
    }),
  );
}

/** The step a Case opens on: its current step, or its last recorded one when closed. */
export function landingStep(detail: CaseDetail): CaseStepId {
  const next = detail.nextStep;
  const current = caseSteps.find((step) =>
    step.covers.some((covered) => covered === next),
  );
  if (current) return current.id;
  const recorded = caseSteps.filter((step) => step.recorded(detail)).at(-1);
  return recorded?.id ?? 'application';
}
