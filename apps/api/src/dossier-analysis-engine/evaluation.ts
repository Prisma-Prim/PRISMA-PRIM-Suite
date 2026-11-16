import { createHash } from 'node:crypto';
import {
  analyzeDossier,
  searchDossier,
  validateSuggestions,
  createContextBundle,
  type EvidenceSource,
} from './index.js';

function source(id: string, text: string): EvidenceSource {
  return {
    id,
    documentId: id,
    documentVersionId: `${id}-v1`,
    representationId: null,
    sourceSha256: createHash('sha256').update(`pdf-${id}`).digest('hex'),
    fileName: `${id}.pdf`,
    documentTitle: id,
    documentType: 'certificate',
    versionNumber: 1,
    versionStatus: 'official',
    language: 'en',
    extraction: {
      state: 'complete',
      parserVersion: 'fixture-v1',
      passages: [
        {
          locator: 'p1',
          text,
          sha256: createHash('sha256').update(text).digest('hex'),
          page: 1,
        },
      ],
      issues: [],
      unitsTotal: 1,
      unitsReadable: 1,
    },
  };
}
/** Deterministic synthetic evaluation. This measures the local rules, not a model. */
export function evaluateEngine() {
  const sources = [
    source('a', 'Legal name: Acme\nTax ID: 123\nScope: Manufacture'),
    source('b', 'Legal name: Acme\nTax ID: 124\nScope: Manufacturing'),
  ];
  const result = analyzeDossier({
    sources,
    missingDocuments: [{ documentId: 'missing', title: 'Missing' }],
  });
  const expected = [
    'legalName:Acme',
    'taxId:123',
    'scope:Manufacture',
    'legalName:Acme',
    'taxId:124',
    'scope:Manufacturing',
  ];
  const observed = result.candidates.map((c) => `${c.field}:${c.value}`);
  const matched = expected.filter(
    (v, i) =>
      observed.filter((x) => x === v).length >=
      expected.slice(0, i + 1).filter((x) => x === v).length,
  ).length;
  const expectedCitations = [
    'a:p1:12:16',
    'a:p1:25:28',
    'a:p1:36:47',
    'b:p1:12:16',
    'b:p1:25:28',
    'b:p1:36:49',
  ];
  const citationKeys = result.candidates.map(
    ({ citation }) =>
      `${citation.sourceId}:${citation.locator}:${citation.start}:${citation.end}`,
  );
  const citationMetrics = compareItems(expectedCitations, citationKeys);
  const accentA = source('accent-a', 'Legal name: Société');
  const accentB = source('accent-b', 'Legal name: Societe');
  const accent = analyzeDossier({
    sources: [accentA, accentB],
    missingDocuments: [],
  });
  const partial = source('partial', 'Legal name: Partial');
  partial.extraction.state = 'partial';
  const unreadable = source('unreadable', '');
  unreadable.extraction.state = 'unreadable';
  unreadable.extraction.passages = [];
  const coverage = analyzeDossier({
    sources: [partial, unreadable],
    missingDocuments: [{ documentId: 'missing', title: 'Missing' }],
  }).coverage;
  const expectedComparisons = [
    'a:b:legalName:match:literal',
    'a:b:taxId:conflict:normalized',
    'a:b:scope:clarify:prose',
    'accent-a:accent-b:legalName:match:normalized',
  ];
  const observedComparisons = [
    ...result.comparisons,
    ...accent.comparisons,
  ].map(
    (c) =>
      `${c.left.citation.sourceId}:${c.right.citation.sourceId}:${c.field}:${c.outcome}:${c.basis}`,
  );
  const expectedCoverage = [
    'partial:partial',
    'unreadable:unreadable',
    'missing:missing',
    'field:legalName:not_evaluable',
    'field:taxId:not_evaluable',
  ];
  const observedCoverage = [
    ...coverage.sources.map((s) => `${s.sourceId}:${s.state}`),
    ...coverage.missingDocuments.map((d) => `${d.documentId}:missing`),
    ...coverage.fields
      .filter((f) => f.field === 'legalName' || f.field === 'taxId')
      .map((f) => `field:${f.field}:${f.state}`),
  ];
  const search = searchDossier({
    sources,
    query: 'acme',
    mode: 'lexical',
    filters: {},
  });
  return {
    version: 'dossier-engine-evaluation/v1' as const,
    kind: 'synthetic_deterministic_rules' as const,
    pipelineVersion: result.pipelineVersion,
    snapshotHash: result.snapshotHash,
    extraction: {
      matched,
      expected: expected.length,
      observed: observed.length,
      precision: ratio(matched, observed.length),
      recall: ratio(matched, expected.length),
    },
    citations: citationMetrics,
    search: compareItems(
      ['a:p1', 'b:p1'],
      search.hits.map((hit) => `${hit.source.id}:${hit.passage.locator}`),
    ),
    comparisonAccuracy: qualityCounts(expectedComparisons, observedComparisons),
    coverageAccuracy: qualityCounts(expectedCoverage, observedCoverage),
    comparisons: {
      conflicts: result.comparisons.filter((c) => c.outcome === 'conflict')
        .length,
      clarifications: result.comparisons.filter((c) => c.outcome === 'clarify')
        .length,
    },
    missingDocuments: result.coverage.missingDocuments.length,
  };
}
export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** Multiset metrics count each observation at most once. */
export function compareItems(
  expected: readonly string[],
  observed: readonly string[],
) {
  const remaining = [...expected];
  let matched = 0;
  for (const item of observed) {
    const index = remaining.indexOf(item);
    if (index !== -1) {
      matched++;
      remaining.splice(index, 1);
    }
  }
  return {
    matched,
    expected: expected.length,
    observed: observed.length,
    precision: ratio(matched, observed.length),
    recall: ratio(matched, expected.length),
  };
}

/** Explicit false positive and false negative denominators for local fixture results. */
export function qualityCounts(
  expected: readonly string[],
  observed: readonly string[],
) {
  const metrics = compareItems(expected, observed);
  return {
    ...metrics,
    falsePositive: metrics.observed - metrics.matched,
    falseNegative: metrics.expected - metrics.matched,
  };
}

/** Independent synthetic scenarios expose individual failures, never model quality. */
export function evaluateScenarios() {
  const cases: { name: string; run: () => boolean }[] = [];
  const extractionCases: [string, string, string, string | null][] = [
    ['english legal name', 'Legal name: Alpha', 'legalName', 'alpha'],
    ['romanian tax id', 'Cod fiscal: 00123', 'taxId', '00123'],
    ['french address', 'Adresse: Rue  École', 'address', 'rue ecole'],
    ['russian standard', 'Стандарт: ISO 9001', 'standard', 'ISO 9001'],
    ['audit type', 'Audit type: initial', 'auditType', 'initial'],
    ['audit date ISO', 'Audit date: 2025-12-31', 'auditDate', '2025-12-31'],
    [
      'decision date',
      'Decision date: 31.12.2025',
      'decisionDate',
      '2025-12-31',
    ],
    ['valid from', 'Valid from: 2025-01-01', 'validFrom', '2025-01-01'],
    ['valid until', 'Valid until: 2026-12-31', 'validUntil', '2026-12-31'],
    ['auditor days', 'Auditor days: 2,5', 'auditorDays', '2.5'],
    ['reference', 'Reference: 001-A', 'reference', '001-A'],
    ['scope prose', 'Scope: Manufacturing', 'scope', null],
    ['indented Romanian tax id', '\u00a0Cod fiscal:\t00042', 'taxId', '00042'],
    [
      'indented Russian legal name',
      '\tНаименование организации: ООО Пример',
      'legalName',
      'ооо пример',
    ],
    ['Romanian IDNO', 'IDNO: 0012345678901', 'taxId', '0012345678901'],
    [
      'Russian fiscal code',
      'Фискальный код: 0012345678901',
      'taxId',
      '0012345678901',
    ],
    [
      'legacy Romanian diacritics',
      'Denumirea organizaţiei: Atelier Ştiinţă',
      'legalName',
      'atelier stiinta',
    ],
    [
      'decomposed Romanian label',
      'Adresa\u0306: Strada Unirii',
      'address',
      'strada unirii',
    ],
  ];
  for (const [name, text, field, normalized] of extractionCases)
    cases.push({
      name,
      run: () => {
        const result = analyzeDossier({
          sources: [source('fixture', text)],
          missingDocuments: [],
        });
        const c = result.candidates[0];
        return (
          result.candidates.length === 1 &&
          c.field === field &&
          c.normalized === normalized &&
          c.citation.quote === text.slice(c.citation.start, c.citation.end)
        );
      },
    });
  function comparison(
    textA: string,
    textB: string,
    field: string,
    sameVersion = false,
  ) {
    const a = source('a', textA),
      b = source('b', textB);
    if (sameVersion) {
      b.documentId = a.documentId;
      b.documentVersionId = a.documentVersionId;
    }
    return analyzeDossier({
      sources: [a, b],
      missingDocuments: [],
    }).comparisons.filter((c) => c.field === field);
  }
  cases.push(
    {
      name: 'same version audit type difference',
      run: () =>
        comparison(
          'Audit type: initial',
          'Audit type: renewal',
          'auditType',
          true,
        )[0]?.outcome === 'conflict',
    },
    {
      name: 'same named event date difference',
      run: () =>
        comparison(
          'Reference: X\nEvent: audit-2025\nAudit date: 2025-01-01',
          'Reference: X\nEvent: audit-2025\nAudit date: 2025-01-02',
          'auditDate',
        )[0]?.outcome === 'conflict',
    },
    {
      name: 'different references are separate',
      run: () =>
        comparison(
          'Reference: X\nAudit date: 2025-01-01',
          'Reference: Y\nAudit date: 2025-01-02',
          'auditDate',
        ).length === 0,
    },
    {
      name: 'stage identity prevents false match',
      run: () =>
        comparison(
          'Reference: X\nStage 1 Audit date: 2025-01-01',
          'Reference: X\nStage 2 Audit date: 2025-01-02',
          'auditDate',
        ).length === 0,
    },
    {
      name: 'same stage same reference',
      run: () =>
        comparison(
          'Reference: X\nStage 1 Auditor days: 2,5',
          'Reference: X\nStage 1 Auditor days: 2.5',
          'auditorDays',
        )[0]?.outcome === 'match',
    },
    {
      name: 'incompatible units are not evaluated',
      run: () =>
        comparison(
          'Reference: X\nAuditor days: 8 hours',
          'Reference: X\nAuditor days: 1',
          'auditorDays',
        ).length === 0,
    },
    {
      name: 'identifiers retain zeros',
      run: () =>
        comparison('Tax ID: 001', 'Tax ID: 1', 'taxId')[0]?.outcome ===
        'conflict',
    },
    {
      name: 'legal name normalization is visible',
      run: () =>
        comparison(
          'Legal name: Société  Exemple',
          'Legal name: Societe Exemple',
          'legalName',
        )[0]?.basis === 'normalized',
    },
    {
      name: 'ambiguous date flagged',
      run: () =>
        analyzeDossier({
          sources: [source('a', 'Audit date: 01/02/2025')],
          missingDocuments: [],
        }).candidates[0]?.normalizationState === 'ambiguous',
    },
    {
      name: 'invalid date flagged',
      run: () =>
        analyzeDossier({
          sources: [source('a', 'Audit date: 31/02/2025')],
          missingDocuments: [],
        }).candidates[0]?.normalizationState === 'invalid',
    },
    {
      name: 'unlabelled number ignored',
      run: () =>
        analyzeDossier({
          sources: [source('a', 'ISO 9001')],
          missingDocuments: [],
        }).candidates.length === 0,
    },
    {
      name: 'lexical accent folding',
      run: () =>
        searchDossier({
          sources: [source('a', 'Știință')],
          query: 'stiinta',
          mode: 'lexical',
          filters: {},
        }).hits.length === 1,
    },
    {
      name: 'literal case sensitivity',
      run: () =>
        searchDossier({
          sources: [source('a', 'Audit')],
          query: 'audit',
          mode: 'literal',
          filters: {},
        }).hits.length === 0,
    },
    {
      name: 'fuzzy one edit',
      run: () =>
        searchDossier({
          sources: [source('a', 'audit')],
          query: 'audot',
          mode: 'fuzzy',
          filters: {},
        }).hits.length === 1,
    },
    {
      name: 'cyrillic characters remain distinct',
      run: () =>
        searchDossier({
          sources: [source('a', 'й')],
          query: 'и',
          mode: 'lexical',
          filters: {},
        }).hits.length === 0,
    },
    {
      name: 'unreadable source coverage',
      run: () => {
        const s = source('a', '');
        s.extraction.state = 'unreadable';
        s.extraction.passages = [];
        return (
          analyzeDossier({
            sources: [s],
            missingDocuments: [{ documentId: 'x', title: 'X' }],
          }).coverage.sources[0].state === 'unreadable'
        );
      },
    },
    {
      name: 'partial source remains visible',
      run: () => {
        const s = source('a', 'Legal name: A');
        s.extraction.state = 'partial';
        return (
          analyzeDossier({ sources: [s], missingDocuments: [] }).coverage
            .sources[0].state === 'partial'
        );
      },
    },
  );
  cases.push(
    {
      name: 'typed contract reference match in one stage',
      run: () =>
        comparison(
          'Stage 1 Contract reference: A',
          'Stage 1 Contract reference: A',
          'reference',
        )[0]?.outcome === 'match',
    },
    {
      name: 'typed contract reference difference in one stage',
      run: () =>
        comparison(
          'Stage 1 Contract reference: A',
          'Stage 1 Contract reference: B',
          'reference',
        )[0]?.outcome === 'conflict',
    },
    {
      name: 'invoice and contract references are unrelated',
      run: () =>
        comparison(
          'Stage 1 Invoice reference: A',
          'Stage 1 Contract reference: B',
          'reference',
        ).length === 0,
    },
    {
      name: 'generic references lack comparable role',
      run: () =>
        comparison('Stage 1 Reference: A', 'Stage 1 Reference: B', 'reference')
          .length === 0,
    },
  );
  cases.push(
    {
      name: 'empty proposal batch rejected',
      run: () => {
        const sources = [source('a', 'Legal name: A')];
        const snapshotHash = analyzeDossier({
          sources,
          missingDocuments: [],
        }).snapshotHash;
        try {
          validateSuggestions({ sources, snapshotHash, value: [] });
          return false;
        } catch {
          return true;
        }
      },
    },
    {
      name: 'forged citation rejected',
      run: () => {
        const sources = [source('a', 'Legal name: A')];
        const result = analyzeDossier({ sources, missingDocuments: [] });
        try {
          validateSuggestions({
            sources,
            snapshotHash: result.snapshotHash,
            value: [
              {
                field: 'legalName',
                value: 'A',
                rationale: 'review',
                citations: [{ ...result.candidates[0].citation, quote: 'B' }],
              },
            ],
          });
          return false;
        } catch {
          return true;
        }
      },
    },
    {
      name: 'changed source rejects old snapshot',
      run: () => {
        const sources = [source('a', 'Legal name: A')];
        const snapshotHash = analyzeDossier({
          sources,
          missingDocuments: [],
        }).snapshotHash;
        sources[0].documentTitle = 'new';
        try {
          validateSuggestions({ sources, snapshotHash, value: [{}] });
          return false;
        } catch {
          return true;
        }
      },
    },
    {
      name: 'search pagination yields distinct hits',
      run: () => {
        const sources = [source('a', 'Audit'), source('b', 'Audit')];
        const input = {
          sources,
          query: 'Audit',
          mode: 'literal' as const,
          filters: {},
          limit: 1,
        };
        const first = searchDossier(input);
        return (
          first.nextCursor !== null &&
          searchDossier({ ...input, cursor: first.nextCursor }).hits[0]?.source
            .id === 'b'
        );
      },
    },
    {
      name: 'context includes empty unreadable source',
      run: () => {
        const s = source('a', '');
        s.extraction.state = 'unreadable';
        s.extraction.passages = [];
        return (
          createContextBundle({ sources: [s], maxBytes: 10000 }).sources[0]
            ?.extraction.state === 'unreadable'
        );
      },
    },
  );
  cases.push(
    {
      name: 'indented prose does not establish a labelled fact',
      run: () =>
        analyzeDossier({
          sources: [source('a', '  Consultez la ligne Tax ID: 001')],
          missingDocuments: [],
        }).candidates.length === 0,
    },
    {
      name: 'canonical Cyrillic spelling preserves distinct letters',
      run: () =>
        searchDossier({
          sources: [source('a', 'и'), source('b', 'й')],
          query: 'и\u0306',
          mode: 'lexical',
          filters: {},
        })
          .hits.map((hit) => hit.source.id)
          .join('|') === 'b',
    },
    {
      name: 'canonical Romanian spelling retains exact evidence',
      run: () =>
        searchDossier({
          sources: [source('a', 'Știință')],
          query: 'S\u0326tiint\u0326a\u0306',
          mode: 'lexical',
          filters: {},
        }).hits[0]?.passage.text === 'Știință',
    },
    {
      name: 'one adjacent-letter typo is fuzzy only',
      run: () => {
        const input = {
          sources: [source('a', 'contract valabil')],
          query: 'contrcat',
          filters: {},
        };
        return (
          searchDossier({ ...input, mode: 'fuzzy' }).hits.length === 1 &&
          searchDossier({ ...input, mode: 'lexical' }).hits.length === 0
        );
      },
    },
    {
      name: 'Russian exact phrase precedes scattered and alternative terms',
      run: () =>
        searchDossier({
          sources: [
            source('a-loose', 'Аудит включает проверку сертификации'),
            source('b-alternative', 'аудита сертификации'),
            source('z-exact', 'АУДИТ сертификации'),
          ],
          query: 'аудит сертификации',
          mode: 'lexical',
          filters: {},
        })
          .hits.map((hit) => hit.source.id)
          .join('|') === 'z-exact|a-loose|b-alternative',
    },
  );
  for (const [name, query, text] of [
    ['Romanian document inflection', 'document', 'Lista documentelor'],
    ['Russian certificate inflection', 'сертификат', 'Реестр сертификатов'],
    ['Russian certification inflection', 'сертификация', 'Схема сертификации'],
  ])
    cases.push({
      name,
      run: () =>
        searchDossier({
          sources: [source('a', text)],
          query,
          mode: 'lexical',
          filters: {},
        }).hits.length === 1,
    });
  cases.push({
    name: 'multiline table identifier stays ambiguous',
    run: () => {
      const a = source('a', 'IDNO\t001234\n005678');
      a.extraction.passages[0].locator = 'word/document.xml#table:1/row:1';
      const result = analyzeDossier({ sources: [a], missingDocuments: [] });
      return (
        result.candidates.length === 1 &&
        result.candidates[0].value === '001234\n005678' &&
        result.candidates[0].normalizationState === 'ambiguous'
      );
    },
  });
  return cases.map(({ name, run }) => {
    try {
      const passed = run();
      return { name, passed, failure: passed ? null : 'Unexpected result' };
    } catch (error: unknown) {
      return {
        name,
        passed: false,
        failure: error instanceof Error ? error.message : 'Unexpected error',
      };
    }
  });
}
