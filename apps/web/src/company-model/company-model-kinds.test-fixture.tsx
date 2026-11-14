import { expect } from 'vitest';
import {
  fireEvent,
  getDefaultNormalizer,
  screen,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ActorContext } from '../access-types';
import type { InterfaceLocale } from '../localization/interface-locale';
import { resolveMessage } from '../localization/messages';
import type { CompanyModelCopyKey } from './company-model-kind';
import type { CompanyModelWorkspaceProps } from './CompanyModelWorkspace';
import {
  OFFER_MODEL,
  OfferModelWorkspace,
} from '../offer-model/offer-model.kind';
import { offerModelMessages } from '../offer-model/offer-model.copy';
import * as offer from '../offer-model/offer-model.fixture';
import {
  CONTRACT_MODEL,
  ContractModelWorkspace,
} from '../contract-model/contract-model.kind';
import { contractModelMessages } from '../contract-model/contract-model.copy';
import * as contract from '../contract-model/contract-model.fixture';

type Content = Readonly<Record<string, unknown>> & {
  sourceKind: 'ILLUSTRATIVE' | 'COMPANY_SUPPLIED';
  serviceTitle: string;
};
type Grant = { bundle: string; permissions: readonly string[] };

/** One adapter as the shared workspace tests drive it. */
export type ModelKindCase = {
  name: 'Offer' | 'Contract';
  Workspace: (props: CompanyModelWorkspaceProps) => ReactNode;
  /** The model root route as the browser requests it. */
  root: string;
  grantsField: 'offerModelGrants' | 'contractModelGrants';
  editor: Grant;
  approver: Grant;
  actor: ActorContext;
  approverActor: ActorContext;
  attribution: typeof offer.syntheticAttribution;
  content: Content;
  model: {
    id: string;
    workspaceId: string;
    companyId: string;
    revision: number;
    head: {
      id: string;
      versionNumber: number;
      predecessorVersionId: string | null;
      content: Content;
      decision: null;
      withdrawal: null;
    };
    activeVersion: null;
  };
  /** A literal of the head's body that protected-content checks look for. */
  protectedText: string;
  /** Content distinct from `content` in its title, first section and stages. */
  successorContent: Content;
  firstSection: { label: string; value: string };
  stageTitle: {
    label: string;
    count: number;
    value: (number: number) => string;
  };
  message: (locale: InterfaceLocale, key: CompanyModelCopyKey) => string;
  /** Fills every field of an open blank form with `content`. */
  fill: () => void;
  /** Shows that every literal of `content` is displayed. */
  expectDisplayed: () => void;
};

export const offerKind: ModelKindCase = {
  name: 'Offer',
  Workspace: OfferModelWorkspace,
  root: `/api${OFFER_MODEL.path}`,
  grantsField: OFFER_MODEL.grants.field,
  editor: OFFER_MODEL.grants.editor,
  approver: OFFER_MODEL.grants.approver,
  actor: offer.syntheticActor,
  approverActor: offer.syntheticApprover,
  attribution: offer.syntheticAttribution,
  content: offer.syntheticContent,
  model: offer.syntheticModel,
  protectedText: offer.syntheticContent.issuer.legalName,
  successorContent: {
    ...offer.syntheticContent,
    serviceTitle: 'Succesor demonstrativ',
    sections: { ...offer.syntheticContent.sections, introduction: 'Nouă' },
    stages: offer.syntheticContent.stages.map((stage) => ({
      ...stage,
      title: `Succesor ${stage.title}`,
    })),
  },
  firstSection: {
    label: 'Introduction',
    value: offer.syntheticContent.sections.introduction,
  },
  stageTitle: {
    label: 'Stage title',
    count: 18,
    value: (number) => `Etapă ${number}`,
  },
  message: (locale, key) => resolveMessage(offerModelMessages, locale, key),
  fill() {
    const content = offer.syntheticContent;
    fillLabels({
      'Source description': content.sourceDescription,
      'Issuer legal name': content.issuer.legalName,
      'Issuer tax identifier': content.issuer.taxId,
      'Issuer legal address': content.issuer.legalAddress,
      'Romanian service title': content.serviceTitle,
      'Framework name 1': 'Cadru demonstrativ',
      'Framework edition 1': 'Ediția 1',
      Introduction: content.sections.introduction,
      'Provider profile': content.sections.providerProfile,
      Scope: content.sections.scope,
      Objectives: content.sections.objectives,
      'Assessment guidance': content.sections.assessmentGuidance,
      Methodology: content.sections.methodology,
      Deliverables: content.sections.deliverables,
      'Realization conditions': content.sections.realizationConditions,
      'Payment conditions': content.sections.paymentConditions,
      'Closing rationale': content.sections.closingRationale,
    });
    content.stages.forEach((stage, index) =>
      fillLabels({
        [`Stage title ${index + 1}`]: stage.title,
        [`Planned activity ${index + 1}`]: stage.plannedActivity,
        [`Intended result ${index + 1}`]: stage.intendedResult,
      }),
    );
  },
  expectDisplayed() {
    const content = offer.syntheticContent;
    for (const value of [
      content.sourceDescription,
      content.issuer.legalName,
      content.issuer.taxId,
      content.issuer.legalAddress,
      ...Object.values(content.sections),
    ])
      expectLiteral(value);
    expect(screen.getByText('Cadru demonstrativ — Ediția 1')).toBeVisible();
    for (const stage of content.stages)
      for (const value of Object.values(stage))
        expect(screen.getByText(value, { exact: true })).toBeVisible();
  },
};

export const contractKind: ModelKindCase = {
  name: 'Contract',
  Workspace: ContractModelWorkspace,
  root: `/api${CONTRACT_MODEL.path}`,
  grantsField: CONTRACT_MODEL.grants.field,
  editor: CONTRACT_MODEL.grants.editor,
  approver: CONTRACT_MODEL.grants.approver,
  actor: contract.syntheticActor,
  approverActor: contract.syntheticApprover,
  attribution: contract.syntheticAttribution,
  content: contract.syntheticContent,
  model: contract.syntheticModel,
  protectedText: contract.syntheticContent.issuer.legalName,
  successorContent: {
    ...contract.syntheticContent,
    serviceTitle: 'Succesor demonstrativ',
    sections: { ...contract.syntheticContent.sections, subject: 'Clauză nouă' },
    annex: {
      ...contract.syntheticContent.annex,
      activities: contract.syntheticContent.annex.activities.map(
        (activity) => ({ ...activity, title: `Succesor ${activity.title}` }),
      ),
    },
  },
  firstSection: {
    label: 'I. Subject',
    value: contract.syntheticContent.sections.subject,
  },
  stageTitle: {
    label: 'Activity title',
    count: 13,
    value: (number) => `Activitate demonstrativă ${number}`,
  },
  message: (locale, key) => resolveMessage(contractModelMessages, locale, key),
  fill() {
    const content = contract.syntheticContent;
    fillLabels({
      'Source description': content.sourceDescription,
      'Contract title': content.title,
      'Romanian service title': content.serviceTitle,
      'Intended place wording': content.place,
      'Issuer legal name': content.issuer.legalName,
      'Issuer tax identifier': content.issuer.taxId,
      'Issuer legal address': content.issuer.legalAddress,
      'Full provider requisites wording': content.providerDetails,
      'Client requisites introduction': content.clientDetailsIntroduction,
      'Framework name 1': 'Cadru sintetic',
      'Framework edition 1': 'Ediție sintetică 1',
      'I. Subject': content.sections.subject,
      'II. Execution term': content.sections.executionTerm,
      'III. Rights and obligations': content.sections.rightsAndObligations,
      'IV. Confidentiality': content.sections.confidentiality,
      'V. Price and payment wording': content.sections.priceAndPayment,
      'VI. Liability': content.sections.liability,
      'VII. Termination': content.sections.termination,
      'VIII. Final provisions': content.sections.finalProvisions,
      'IX. Parties and signatures wording':
        content.sections.partiesAndSignatures,
      'Blank provider signature area': content.signatureAreas.provider,
      'Blank Client signature area': content.signatureAreas.client,
      'Blank annex provider signature area':
        content.signatureAreas.annexProvider,
      'Blank annex Client signature area': content.signatureAreas.annexClient,
      'Annex title': content.annex.title,
      'Annex reference wording': content.annex.referenceWording,
    });
    content.annex.activities.forEach((activity, index) =>
      fillLabels({
        [`Activity title ${index + 1}`]: activity.title,
        [`Planned activity ${index + 1}`]: activity.plannedActivity,
        [`Intended result ${index + 1}`]: activity.intendedResult,
      }),
    );
  },
  expectDisplayed() {
    const content = contract.syntheticContent;
    for (const value of [
      content.sourceDescription,
      content.title,
      content.place,
      content.issuer.legalName,
      content.issuer.taxId,
      content.issuer.legalAddress,
      content.providerDetails,
      content.clientDetailsIntroduction,
      ...Object.values(content.sections),
      ...Object.values(content.signatureAreas),
      content.annex.title,
      content.annex.referenceWording,
    ])
      expectLiteral(value);
    expect(
      screen.getByText('Cadru sintetic — Ediție sintetică 1'),
    ).toBeVisible();
    for (const activity of content.annex.activities)
      for (const value of Object.values(activity))
        expect(screen.getByText(value, { exact: true })).toBeVisible();
  },
};

export const modelKinds = [offerKind, contractKind];

/** The case's Actor in another Company context or with other grants. */
export function actorWith(
  kind: ModelKindCase,
  {
    actor = kind.approverActor,
    companyId = kind.model.companyId,
    displayName = 'Synthetic Company',
    grants,
  }: {
    actor?: ActorContext;
    companyId?: string;
    displayName?: string;
    grants: unknown;
  },
): ActorContext {
  const company = { id: companyId, displayName };
  return {
    ...actor,
    activeCompany:
      kind.grantsField === 'offerModelGrants'
        ? { ...company, offerModelGrants: grants }
        : { ...company, contractModelGrants: grants },
  };
}

/** The case's approver Actor in another Company, keeping its grants. */
export function approverInCompany(
  kind: ModelKindCase,
  companyId: string,
  displayName: string,
): ActorContext {
  const company = kind.approverActor.activeCompany;
  return actorWith(kind, {
    companyId,
    displayName,
    grants: company?.[kind.grantsField],
  });
}

/** One captured grant row of the case's bundle. */
export function grant(
  bundle: Grant,
  assignmentId: string,
  overrides: Partial<{
    permissionSetVersion: string;
    permissions: readonly string[];
  }> = {},
) {
  return {
    bundle: bundle.bundle,
    assignmentId,
    permissionSetVersion: overrides.permissionSetVersion ?? 'v1',
    permissions: overrides.permissions ?? bundle.permissions,
  };
}

/** Fills text areas by exact label, resolving all labels in one DOM pass. */
function fillLabels(fields: Record<string, string>) {
  const controls = new Map<string, HTMLElement[]>();
  for (const label of document.querySelectorAll('label')) {
    const control = label.htmlFor && document.getElementById(label.htmlFor);
    const text = label.textContent ?? '';
    if (!control || !(text in fields)) continue;
    controls.set(text, [...(controls.get(text) ?? []), control]);
  }
  for (const [label, value] of Object.entries(fields)) {
    const matches = controls.get(label) ?? [];
    const [control] = matches;
    if (matches.length !== 1 || !control)
      throw new Error(`Expected one field labelled ${label}.`);
    fireEvent.change(control, { target: { value } });
  }
}
const literal = getDefaultNormalizer({
  trim: false,
  collapseWhitespace: false,
});
function expectLiteral(value: string) {
  expect(
    screen.getAllByText(value, { normalizer: literal }).length,
  ).toBeGreaterThan(0);
}
