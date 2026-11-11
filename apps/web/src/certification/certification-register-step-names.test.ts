import { expect, it } from 'vitest';
import { interfaceLocales } from '../localization/interface-locale';
import { resolveMessage } from '../localization/messages';
import {
  consistencyMessages,
  type ConsistencyMessageKey,
} from './certification-consistency.copy';
import type { StepVersion } from './certification-response';
import {
  certificationMessages,
  type CertificationMessageKey,
} from './certification.copy';

// The dossier register PDF lists every step version of a Case, and a reader
// matches each PDF line with the Case page by its step name (#1287). This
// guard reads the API's register labels and compares them with the names the
// page shows, in every language. The labels are read through import.meta.glob:
// the production web image copies only apps/web, so a static import of
// apps/api would break that build. The module is unparsed input, so its shape
// is checked here.
const labelsFile =
  'apps/api/src/certification/certification-register.labels.ts';
const labelModules = import.meta.glob(
  '../../../api/src/certification/certification-register.labels.ts',
  { eager: true },
);

/**
 * Where the Case page names a step: the title of each of its timeline entries;
 * its own row of the step list, except the two Stages, whose plan and report
 * share one row; and a step version cited as a Discrepancy source in the
 * dossier consistency region.
 */
interface PageName {
  timeline: CertificationMessageKey;
  stepList: CertificationMessageKey | null;
  consistency: ConsistencyMessageKey;
}

const PAGE_NAMES: Readonly<Record<StepVersion['step'], PageName>> = {
  application: {
    timeline: 'timelineApplication',
    stepList: 'stepApplication',
    consistency: 'stepApplication',
  },
  application_review: {
    timeline: 'timelineReview',
    stepList: 'stepReview',
    consistency: 'stepApplicationReview',
  },
  duration: {
    timeline: 'timelineDuration',
    stepList: 'stepDuration',
    consistency: 'stepDuration',
  },
  agreement: {
    timeline: 'timelineAgreement',
    stepList: 'stepAgreement',
    consistency: 'stepAgreement',
  },
  team: {
    timeline: 'timelineTeam',
    stepList: 'stepTeam',
    consistency: 'stepTeam',
  },
  team_decision: {
    timeline: 'timelineTeamDecision',
    stepList: 'stepTeamDecision',
    consistency: 'stepTeamDecision',
  },
  stage_1_plan: {
    timeline: 'timelineStage1Plan',
    stepList: null,
    consistency: 'stepStage1Plan',
  },
  stage_1_report: {
    timeline: 'timelineStage1Report',
    stepList: null,
    consistency: 'stepStage1Report',
  },
  stage_2_plan: {
    timeline: 'timelineStage2Plan',
    stepList: null,
    consistency: 'stepStage2Plan',
  },
  stage_2_report: {
    timeline: 'timelineStage2Report',
    stepList: null,
    consistency: 'stepStage2Report',
  },
  recommendation: {
    timeline: 'timelineRecommendation',
    stepList: 'stepRecommendation',
    consistency: 'stepRecommendation',
  },
  dossier_review: {
    timeline: 'timelineDossierReview',
    stepList: 'stepDossierReview',
    consistency: 'stepDossierReview',
  },
  decision: {
    timeline: 'timelineCertificationDecision',
    stepList: 'stepCertificationDecision',
    consistency: 'stepDecision',
  },
  certificate_data: {
    timeline: 'timelineCertificateData',
    stepList: 'stepCertificateData',
    consistency: 'stepCertificateData',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The step labels of each register language the API module exports. */
function registerStepLabels(
  labelsModule: unknown,
): ReadonlyMap<string, Readonly<Record<string, unknown>>> {
  const labels = isRecord(labelsModule)
    ? labelsModule.REGISTER_LABELS
    : undefined;
  if (!isRecord(labels))
    throw new Error(
      `REGISTER_LABELS is not exported by ${labelsFile}. If the labels moved, update the import.meta.glob path in this test.`,
    );
  return new Map(
    Object.entries(labels).map(([language, languageLabels]) => {
      const steps = isRecord(languageLabels) ? languageLabels.steps : undefined;
      if (!isRecord(steps))
        throw new Error(
          `REGISTER_LABELS.${language}.steps in ${labelsFile} is no longer a table of step labels; update this guard.`,
        );
      return [language, steps];
    }),
  );
}

/** The step name a timeline title starts with, before its dash. */
function stepNameOf(title: string): string {
  const dash = title.indexOf(' — ');
  if (dash < 1)
    throw new Error(`Timeline title without a leading step name: ${title}`);
  return title.slice(0, dash);
}

it('names every step version in the dossier register as the Case page does, in every language', () => {
  const registers = registerStepLabels(Object.values(labelModules)[0]);
  expect([...registers.keys()].sort()).toEqual([...interfaceLocales].sort());
  const printed: Record<string, unknown> = {};
  const shown: Record<string, string> = {};
  const cited: Record<string, string> = {};
  const listed: Record<string, string> = {};
  const listedAsShown: Record<string, string> = {};
  for (const locale of interfaceLocales) {
    const steps = registers.get(locale);
    if (!steps) throw new Error(`No register labels for ${locale}.`);
    expect(Object.keys(steps).sort(), locale).toEqual(
      Object.keys(PAGE_NAMES).sort(),
    );
    const message = (key: CertificationMessageKey) =>
      resolveMessage(certificationMessages, locale, key);
    for (const [step, page] of Object.entries(PAGE_NAMES)) {
      const key = `${locale} ${step}`;
      const name = stepNameOf(message(page.timeline));
      printed[key] = steps[step];
      shown[key] = name;
      cited[key] = resolveMessage(
        consistencyMessages,
        locale,
        page.consistency,
      );
      if (page.stepList) {
        listed[key] = message(page.stepList);
        listedAsShown[key] = name;
      }
    }
  }
  // The step list, the timeline and the consistency region give a step the
  // same name ...
  expect(listed).toEqual(listedAsShown);
  expect(cited).toEqual(shown);
  // ... and the register prints each version under that name.
  expect(printed).toEqual(shown);
});
