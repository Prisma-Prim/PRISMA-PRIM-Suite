import type { ComponentType } from 'react';
import type { ComparisonFixture } from './comparisonFixture';
import { InstitutionalAssuranceConcept } from './concepts/institutional-assurance/Concept';
import { PremiumEditorialConcept } from './concepts/premium-editorial/Concept';

export const designLabScreens = [
  'dashboard',
  'client-request',
  'analysis-review',
] as const;

export type DesignLabScreen = (typeof designLabScreens)[number];

export interface ConceptProps {
  fixture: ComparisonFixture;
  screen: DesignLabScreen;
}

export interface DirectionSlot {
  id: string;
  title: string;
  prompt: string;
  Concept?: ComponentType<ConceptProps>;
}

export const directionSlots: ReadonlyArray<DirectionSlot> = [
  {
    id: 'institutional-assurance',
    title: 'Institutional assurance',
    prompt: 'Calm, rigorous, and conventionally trustworthy.',
    Concept: InstitutionalAssuranceConcept,
  },
  {
    id: 'premium-editorial',
    title: 'Premium editorial',
    prompt: 'Refined dossier composition with strong hierarchy.',
    Concept: PremiumEditorialConcept,
  },
  {
    id: 'operations-cockpit',
    title: 'Operations cockpit',
    prompt: 'Dense queues, exceptions, and rapid actions.',
  },
  {
    id: 'guided-workflow',
    title: 'Guided workflow',
    prompt: 'Explicit progress, checklists, and the next safe action.',
  },
  {
    id: 'document-centric-workspace',
    title: 'Document-centric workspace',
    prompt: 'Source documents and extracted evidence organize the work.',
  },
  {
    id: 'human-ai-review-workspace',
    title: 'Human-AI review workspace',
    prompt: 'Provenance, uncertainty, and human decisions lead.',
  },
];
