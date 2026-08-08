export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type Stage =
  | 'intake'
  | 'analysis'
  | 'validation'
  | 'pricing'
  | 'offer'
  | 'contract'
  | 'archive';
export type AnalysisState =
  'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'superseded';

export type RequestItem = {
  ref: string;
  client: string;
  service: string;
  status: string;
  tone: Tone;
  next: string;
  owner: string;
  due: string;
  language: string;
  stage: Stage;
  analysis: AnalysisState;
  blockers: number;
};

export type ReviewField = {
  id: string;
  label: string;
  ai: string;
  retained: string;
  source: string;
  fragment: string;
  confidence: number | null;
  state: 'confirmed' | 'inferred' | 'missing' | 'conflict' | 'corrected';
  critical: boolean;
  rationale: string;
  reviewer?: string;
  reviewedAt?: string;
};

export const requests: RequestItem[] = [
  {
    ref: 'REQ-0281',
    client: 'AgroNova SRL',
    service: 'HACCP + ISO 22000',
    status: 'Offre envoyée',
    tone: 'info',
    next: 'Enregistrer la décision client',
    owner: 'Dan Popescu',
    due: '17 août, 10:00',
    language: 'Roumain',
    stage: 'offer',
    analysis: 'completed',
    blockers: 0,
  },
  {
    ref: 'REQ-0280',
    client: 'Fruct Moldova',
    service: 'Diagnostic HACCP',
    status: 'Validation bloquée',
    tone: 'danger',
    next: 'Résoudre 2 champs critiques',
    owner: 'Irina Ceban',
    due: 'Aujourd’hui, 15:00',
    language: 'Russe',
    stage: 'validation',
    analysis: 'completed',
    blockers: 2,
  },
  {
    ref: 'REQ-0279',
    client: 'Nordex Plastics',
    service: 'Audit interne ISO 9001',
    status: 'Analyse échouée',
    tone: 'warning',
    next: 'Remplacer le PDF puis relancer',
    owner: 'Elena Rusu',
    due: '18 août',
    language: 'Roumain',
    stage: 'analysis',
    analysis: 'failed',
    blockers: 1,
  },
  {
    ref: 'REQ-0278',
    client: 'Purcari Wineries',
    service: 'Formation auditeur interne',
    status: 'Projet créé',
    tone: 'success',
    next: 'Consulter le projet',
    owner: 'Dan Popescu',
    due: 'Terminé le 14 août',
    language: 'Anglais',
    stage: 'archive',
    analysis: 'completed',
    blockers: 0,
  },
];

const reviewed = {
  reviewer: 'Dan Popescu',
  reviewedAt: '15 août 2026 · 10:18',
};
export const baseFields: ReviewField[] = [
  {
    id: 'legal_entity',
    label: 'Entité juridique',
    ai: 'AgroNova SRL',
    retained: 'AgroNova SRL',
    source: 'Email client v1',
    fragment: '§1',
    confidence: 99,
    state: 'confirmed',
    critical: true,
    rationale: 'Nom légal explicite dans la signature.',
    ...reviewed,
  },
  {
    id: 'legal_form',
    label: 'Forme juridique',
    ai: 'SRL',
    retained: 'SRL',
    source: 'Extras registru v1',
    fragment: 'p.1',
    confidence: 99,
    state: 'confirmed',
    critical: true,
    rationale: 'Conforme au registre.',
    ...reviewed,
  },
  {
    id: 'tax_code',
    label: 'Code fiscal',
    ai: '1018600048217',
    retained: '1018600048217',
    source: 'Extras registru v1',
    fragment: 'p.1',
    confidence: 98,
    state: 'confirmed',
    critical: true,
    rationale: 'Identifiant unique lisible.',
    ...reviewed,
  },
  {
    id: 'vat',
    label: 'Statut TVA',
    ai: 'Assujetti',
    retained: 'Assujetti',
    source: 'Certificat TVA v2',
    fragment: 'p.1',
    confidence: 97,
    state: 'confirmed',
    critical: true,
    rationale: 'Certificat en cours de validité.',
    ...reviewed,
  },
  {
    id: 'address',
    label: 'Adresse légale',
    ai: 'Str. Industrială 18, Chișinău',
    retained: 'Str. Industrială 18, Chișinău',
    source: 'Extras registru v1',
    fragment: 'p.1',
    confidence: 97,
    state: 'confirmed',
    critical: true,
    rationale: 'Adresse enregistrée.',
    ...reviewed,
  },
  {
    id: 'country',
    label: 'Pays',
    ai: 'République de Moldova',
    retained: 'République de Moldova',
    source: 'Email client v1',
    fragment: 'signature',
    confidence: 99,
    state: 'confirmed',
    critical: false,
    rationale: 'Pays explicite.',
    ...reviewed,
  },
  {
    id: 'activity',
    label: 'Activité',
    ai: 'Transformation de fruits et légumes',
    retained: 'Transformation de fruits et légumes',
    source: 'Présentation entreprise v1',
    fragment: 'p.2',
    confidence: 96,
    state: 'confirmed',
    critical: true,
    rationale: 'Activité principale confirmée.',
    ...reviewed,
  },
  {
    id: 'sector',
    label: 'Secteur',
    ai: 'Industrie alimentaire',
    retained: 'Industrie alimentaire',
    source: 'Présentation entreprise v1',
    fragment: 'p.2',
    confidence: 94,
    state: 'inferred',
    critical: false,
    rationale: 'Classification proposée à partir de l’activité.',
    ...reviewed,
  },
  {
    id: 'headcount',
    label: 'Effectif concerné',
    ai: '86 employés',
    retained: '86 employés',
    source: 'Présentation entreprise v1',
    fragment: 'p.4',
    confidence: 94,
    state: 'confirmed',
    critical: true,
    rationale: 'Effectif du périmètre explicite.',
    ...reviewed,
  },
  {
    id: 'sites',
    label: 'Nombre de sites',
    ai: '3 sites',
    retained: '2 sites',
    source: 'Email v1 ↔ Annexe v1',
    fragment: '§2 ↔ p.1',
    confidence: 68,
    state: 'corrected',
    critical: true,
    rationale: 'Le troisième lieu est un siège administratif.',
    ...reviewed,
  },
  {
    id: 'service',
    label: 'Service demandé',
    ai: 'Diagnostic HACCP + ISO 22000',
    retained: 'Diagnostic HACCP + ISO 22000',
    source: 'Cahier des besoins v1',
    fragment: '§3',
    confidence: 81,
    state: 'inferred',
    critical: true,
    rationale: 'Déduction à confirmer par le consultant.',
    ...reviewed,
  },
  {
    id: 'standards',
    label: 'Normes concernées',
    ai: 'HACCP, ISO 22000:2018',
    retained: 'HACCP, ISO 22000:2018',
    source: 'Cahier des besoins v1',
    fragment: '§3.2',
    confidence: 91,
    state: 'confirmed',
    critical: true,
    rationale: 'Normes citées explicitement.',
    ...reviewed,
  },
  {
    id: 'scope',
    label: 'Périmètre',
    ai: 'Production et conditionnement',
    retained: 'Production et conditionnement',
    source: 'Cahier des besoins v1',
    fragment: '§4',
    confidence: 90,
    state: 'confirmed',
    critical: true,
    rationale: 'Périmètre opérationnel confirmé.',
    ...reviewed,
  },
  {
    id: 'target_date',
    label: 'Date cible',
    ai: 'Non trouvée',
    retained: '15 novembre 2026',
    source: 'Réponse client v1',
    fragment: 'message du 15/08',
    confidence: 100,
    state: 'corrected',
    critical: true,
    rationale: 'Date complétée par confirmation écrite.',
    ...reviewed,
  },
  {
    id: 'contact',
    label: 'Contact décisionnaire',
    ai: 'Ion Rusu',
    retained: 'Ion Rusu',
    source: 'Email client v1',
    fragment: 'signature',
    confidence: 98,
    state: 'confirmed',
    critical: true,
    rationale: 'Auteur et fonction identifiés.',
    ...reviewed,
  },
  {
    id: 'email',
    label: 'Email du contact',
    ai: 'director.calitate@agronova.md',
    retained: 'director.calitate@agronova.md',
    source: 'Email client v1',
    fragment: 'signature',
    confidence: 99,
    state: 'confirmed',
    critical: true,
    rationale: 'Adresse source vérifiée.',
    ...reviewed,
  },
  {
    id: 'language',
    label: 'Langue de travail',
    ai: 'Roumain',
    retained: 'Roumain',
    source: 'Corpus de la demande',
    fragment: '3 documents',
    confidence: 98,
    state: 'confirmed',
    critical: false,
    rationale: 'Langue dominante du corpus.',
    ...reviewed,
  },
  {
    id: 'constraints',
    label: 'Contraintes particulières',
    ai: 'Visites hors production',
    retained: 'Visites hors production',
    source: 'Cahier des besoins v1',
    fragment: '§7',
    confidence: 76,
    state: 'inferred',
    critical: false,
    rationale: 'À confirmer lors du cadrage.',
    ...reviewed,
  },
];

export const fructFields: ReviewField[] = baseFields.map((field) => {
  if (field.id === 'sites')
    return {
      ...field,
      ai: '2 ou 4 sites',
      retained: '',
      source: 'Questionnaire v1 ↔ Annexe v2',
      fragment: '§5 ↔ p.3',
      confidence: 54,
      state: 'conflict',
      rationale: 'Deux sources approuvées se contredisent.',
      reviewer: undefined,
      reviewedAt: undefined,
    };
  if (field.id === 'target_date')
    return {
      ...field,
      ai: 'Non trouvée',
      retained: '',
      source: 'Aucune source',
      fragment: '—',
      confidence: null,
      state: 'missing',
      rationale: 'La date conditionne la planification et le devis.',
      reviewer: undefined,
      reviewedAt: undefined,
    };
  return {
    ...field,
    retained: field.retained.replace('AgroNova', 'Fruct Moldova'),
  };
});

export const stages: { id: Stage; label: string }[] = [
  { id: 'intake', label: 'Demande' },
  { id: 'analysis', label: 'Analyse IA' },
  { id: 'validation', label: 'Revue humaine' },
  { id: 'pricing', label: 'Calcul' },
  { id: 'offer', label: 'Offre' },
  { id: 'contract', label: 'Contrat' },
  { id: 'archive', label: 'Archives' },
];

export const coverageRows = [
  [
    'P0-01',
    'Revue de 18 champs',
    '#/request/REQ-0280/validation',
    '18 lignes, preuves et décisions spécifiques',
  ],
  [
    'P0-02',
    'États et reprise de l’analyse',
    '#/request/REQ-0279/analysis',
    'Échec, remplacement et relance jouables',
  ],
  [
    'P0-03',
    'Calcul déterministe',
    '#/request/REQ-0281/pricing',
    'Snapshot exact à 8 424,60 € TTC',
  ],
  [
    'P0-04',
    'Cycle complet des offres',
    '#/offers/OFR-2026-142',
    'QA, approbation, envoi, décision et versions',
  ],
  [
    'P0-05',
    'Cycle complet des contrats',
    '#/contracts/CTR-2026-096',
    'Liste, fiche, QA, preuve et remplacement',
  ],
  [
    'P0-06',
    'Documents et indexation',
    '#/documents',
    'Approbation, retrait, versions et reprise',
  ],
  [
    'P0-07',
    'Refus RAG sûr',
    '#/documents?scenario=tariff',
    'Réponses, refus et citations détaillées',
  ],
  [
    'P0-08',
    'Clients et contacts',
    '#/clients/CLI-001',
    'CRUD, états de données et historique lié',
  ],
  [
    'P0-09',
    'Actions humaines explicites',
    '#/request/REQ-0280/validation',
    'Aucune attestation sensible précochée',
  ],
  [
    'P0-10',
    'Responsive 1 200 px',
    '#/dashboard',
    'Grilles pilotées par conteneur',
  ],
  [
    'P1-01',
    'Dashboard d’évaluation',
    '#/dashboard',
    'Statuts, dénominateurs et 20 cas accessibles',
  ],
  [
    'P1-02',
    'Navigation profonde',
    '#/request/REQ-0280/validation',
    'Entité et étape encodées dans l’URL',
  ],
  [
    'P1-03',
    'États système',
    '#/requests',
    'Vide, chargement, erreur et reprise',
  ],
  [
    'P1-04',
    'Accessibilité',
    '#/coverage',
    'Tables, focus, clavier et texte ≥ 12 px',
  ],
  [
    'P1-05',
    'Assistant contextuel',
    '#/request/REQ-0280/validation',
    'Contexte dérivé de la page active',
  ],
  [
    'P1-06',
    'Scénario roumain',
    '#/dashboard?lang=ro',
    'Navigation et actions essentielles localisées',
  ],
  [
    'P2-01',
    'Identité compacte',
    '#/dashboard',
    'Logotype CSS net et monogramme compact',
  ],
  [
    'P2-02',
    'Libellés et dates',
    '#/activity',
    'Français cohérent, chronologie au 15 août 2026',
  ],
] as const;
