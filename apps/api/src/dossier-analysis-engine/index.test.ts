import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  analyzeDossier,
  createContextBundle,
  dossierSnapshotHash,
  searchDossier,
  validateSuggestions,
  type EvidenceSource,
} from './index.js';
import {
  compareItems,
  evaluateEngine,
  evaluateScenarios,
  ratio,
  qualityCounts,
} from './evaluation.js';

function source(id: string, text: string): EvidenceSource {
  return {
    id,
    documentId: id,
    documentVersionId: `${id}-v1`,
    representationId: null,
    sourceSha256: 'a'.repeat(64),
    fileName: 'test.pdf',
    documentTitle: 'Test',
    documentType: 'certificate',
    versionNumber: 1,
    versionStatus: 'official',
    language: 'ro',
    extraction: {
      state: 'complete',
      parserVersion: '1',
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
describe('dossier analysis', () => {
  it('extracts literal labelled values with exact source offsets and conservative comparisons', () => {
    const a = source(
      'a',
      'Tax ID: 123\nValid from: 31.12.2025\nScope: Commerce\nReference: A',
    );
    const b = source(
      'b',
      'Tax ID: 124\nValid from: 01.01.2026\nScope: Commercial\nReference: A',
    );
    const result = analyzeDossier({ sources: [a, b], missingDocuments: [] });
    expect(
      result.candidates.find((c) => c.field === 'validFrom')?.normalized,
    ).toBe('2025-12-31');
    expect(result.comparisons.map((c) => [c.field, c.outcome])).toEqual([
      ['taxId', 'conflict'],
      ['scope', 'clarify'],
    ]);
    for (const candidate of result.candidates)
      expect(candidate.citation.quote).toBe(candidate.value);
    expect(
      result.coverage.fields.find((f) => f.field === 'decisionDate')?.state,
    ).toBe('not_evaluable');
    b.extraction.passages[0].text = 'altered';
    expect(
      analyzeDossier({ sources: [a, b], missingDocuments: [] }).coverage
        .sources[1].integrityFailures,
    ).toBe(1);
  });
  it('does not compare different references or unrelated event dates', () => {
    const a = source('a', 'Reference: A\nTax ID: 1\nAudit date: 01.01.2025');
    const b = source('b', 'Reference: B\nTax ID: 2\nAudit date: 01.01.2026');
    expect(
      analyzeDossier({ sources: [a, b], missingDocuments: [] }).comparisons,
    ).toEqual([]);
  });
  it('searches exact, lexical and bounded typo, preserving Cyrillic й', () => {
    const sources = [
      source('a', 'Certificare: Știință й'),
      source('b', 'Certificarii: stiinta и'),
    ];
    expect(
      searchDossier({ sources, query: 'stiinta', mode: 'lexical', filters: {} })
        .hits,
    ).toHaveLength(2);
    expect(
      searchDossier({
        sources,
        query: 'certificare',
        mode: 'lexical',
        filters: {},
      }).hits,
    ).toHaveLength(2);
    expect(
      searchDossier({
        sources,
        query: 'certificare',
        mode: 'literal',
        filters: {},
      }).hits,
    ).toHaveLength(0);
    expect(
      searchDossier({ sources, query: 'й', mode: 'lexical', filters: {} }).hits,
    ).toHaveLength(1);
    expect(
      searchDossier({ sources, query: 'stiintz', mode: 'fuzzy', filters: {} })
        .hits,
    ).toHaveLength(2);
  });
  it('matches canonical Unicode spellings without conflating Cyrillic letters or changing literal search', () => {
    const sources = [
      source('a', 'и'),
      source('b', 'й'),
      source('c', 'François certifié'),
    ];
    expect(
      searchDossier({
        sources,
        query: 'и\u0306',
        mode: 'lexical',
        filters: {},
      }).hits.map((hit) => hit.source.id),
    ).toEqual(['b']);
    expect(
      searchDossier({
        sources,
        query: 'franc\u0327ois',
        mode: 'lexical',
        filters: {},
      }).hits.map((hit) => hit.source.id),
    ).toEqual(['c']);
    expect(
      searchDossier({ sources, query: 'и\u0306', mode: 'literal', filters: {} })
        .hits,
    ).toEqual([]);
    expect(sources[1].extraction.passages[0].text).toBe('й');
  });
  it('recovers one adjacent-letter typo in fuzzy search while keeping short and multiple typos strict', () => {
    const sources = [source('a', 'certification аудит')];
    for (const query of ['certifciation', 'аудти']) {
      expect(
        searchDossier({ sources, query, mode: 'fuzzy', filters: {} }).hits.map(
          (hit) => [hit.source.id, hit.reason],
        ),
      ).toEqual([['a', 'fuzzy']]);
      expect(
        searchDossier({ sources, query, mode: 'lexical', filters: {} }).hits,
      ).toEqual([]);
    }
    for (const query of ['certifciatoin', 'аи', 'аидот'])
      expect(
        searchDossier({ sources, query, mode: 'fuzzy', filters: {} }).hits,
      ).toEqual([]);
  });
  it('ranks an exact token phrase before scattered terms, alternatives and typos across pages', () => {
    const input = {
      sources: [
        source(
          'a-loose',
          'Audit with unrelated review sections before certification',
        ),
        source('b-alternative', 'Auditing certification'),
        source('c-typo', 'Audti certification'),
        source('z-phrase', 'Before AUDIT certification after'),
      ],
      query: 'audit certification',
      mode: 'fuzzy' as const,
      filters: {},
      limit: 2,
    };
    const first = searchDossier(input);
    expect(first.hits.map((hit) => hit.source.id)).toEqual([
      'z-phrase',
      'a-loose',
    ]);
    expect(first.nextCursor).not.toBeNull();
    const second = searchDossier({ ...input, cursor: first.nextCursor ?? '' });
    expect(second.hits.map((hit) => hit.source.id)).toEqual([
      'b-alternative',
      'c-typo',
    ]);
    expect(second.nextCursor).toBeNull();
    const scores = [...first.hits, ...second.hits].map((hit) => hit.score);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
    expect(scores[2]).toBeGreaterThan(scores[3]);
  });
  it.each([
    ['certificat', 'Datele certificatelor emise', 'ro', 1],
    ['document', 'Lista documentelor necesare', 'ro', 1],
    ['contract', 'Înregistrarea contractelor', 'ro', 1],
    ['certificare', 'Etapele certificării', 'ro', 0],
    ['сертификат', 'Реестр сертификатов', 'ru', 1],
    ['документ', 'Проверка документов', 'ru', 1],
    ['договор', 'Приложение к договору', 'ru', 1],
    ['аудит', 'Подготовка к аудиту', 'ru', 1],
    ['сертификация', 'Схема сертификации', 'ru', 0],
  ] satisfies [string, string, EvidenceSource['language'], number][])(
    'retrieves ordinary Romanian/Russian inflections for %s',
    (query, text, language, literalHits) => {
      const a = source('a', text);
      a.language = language;
      const sources = [a, source('unrelated', 'Дата решения / data deciziei')];
      const result = searchDossier({
        sources,
        query,
        mode: 'lexical',
        filters: {},
      });
      expect(result.hits.map((hit) => hit.source.id)).toEqual(['a']);
      expect(result.hits[0].passage.text).toBe(text);
      expect(
        searchDossier({ sources, query, mode: 'literal', filters: {} }).hits,
      ).toHaveLength(literalHits);
    },
  );
  it('binds page cursors to the snapshot and all search inputs', () => {
    const sources = [source('a', 'Audit'), source('b', 'Audit')];
    const input = {
      sources,
      query: 'Audit',
      mode: 'literal' as const,
      filters: {},
      limit: 1,
    };
    const page = searchDossier(input);
    expect(page.nextCursor).not.toBeNull();
    expect(
      searchDossier({ ...input, cursor: page.nextCursor ?? '' }).hits[0].source
        .id,
    ).toBe('b');
    expect(() =>
      searchDossier({
        ...input,
        query: 'audit',
        cursor: page.nextCursor ?? '',
      }),
    ).toThrow();
    sources[0].documentTitle = 'changed';
    expect(() =>
      searchDossier({ ...input, cursor: page.nextCursor ?? '' }),
    ).toThrow();
  });
  it('checks exact citations without asserting semantic support', () => {
    const sources = [source('a', 'Legal name: Acme')];
    const result = analyzeDossier({ sources, missingDocuments: [] });
    const suggestion = {
      field: 'legalName',
      value: 'A different inference',
      rationale: 'Proposed for review',
      citations: [result.candidates[0].citation],
    };
    expect(
      validateSuggestions({
        sources,
        snapshotHash: result.snapshotHash,
        value: [suggestion],
      }),
    ).toHaveLength(1);
    expect(() =>
      validateSuggestions({
        sources,
        snapshotHash: result.snapshotHash,
        value: [
          {
            ...suggestion,
            citations: [{ ...suggestion.citations[0], quote: 'forged' }],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateSuggestions({
        sources,
        snapshotHash: 'stale',
        value: [suggestion],
      }),
    ).toThrow();
  });
  it('bounds the serialized bundle and reports omissions', () => {
    const sources = [source('a', 'x'.repeat(1000))];
    const bundle = createContextBundle({ sources, maxBytes: 900 });
    expect(Buffer.byteLength(JSON.stringify(bundle))).toBeLessThanOrEqual(900);
    expect(bundle.entries).toHaveLength(0);
    expect(bundle.omissions[0].reason).toBe('byte_limit');
    expect(() => createContextBundle({ sources, maxBytes: 1 })).toThrow();
  });
  it('requires explicit history and supports source and field filters', () => {
    const a = source('a', 'Legal name: Alpha\nTax ID: 001');
    const b = source('b', 'Legal name: Alpha');
    b.versionStatus = 'superseded';
    const draft = source('draft', 'Legal name: Alpha');
    draft.versionStatus = 'draft';
    const inputs = {
      sources: [a, b, draft],
      query: 'Alpha',
      mode: 'literal' as const,
    };
    expect(
      searchDossier({ ...inputs, filters: {} }).hits.map((h) => h.source.id),
    ).toEqual(['a', 'draft']);
    expect(
      searchDossier({
        ...inputs,
        filters: { versionStatus: 'superseded' },
      }).hits.map((h) => h.source.id),
    ).toEqual(['b']);
    expect(
      searchDossier({ ...inputs, filters: { sourceId: 'a', field: 'taxId' } })
        .hits,
    ).toHaveLength(1);
    expect(
      searchDossier({
        ...inputs,
        filters: { sourceId: 'a', field: 'auditDate' },
      }).hits,
    ).toHaveLength(0);
    expect(() =>
      searchDossier({ ...inputs, filters: {}, cursor: 'a'.repeat(2049) }),
    ).toThrow();
  });
  it('binds source snapshots to content independently of JSON object key order', () => {
    const a = source('a', 'Legal name: Alpha');
    const reordered: EvidenceSource = {
      extraction: {
        unitsReadable: a.extraction.unitsReadable,
        unitsTotal: a.extraction.unitsTotal,
        issues: a.extraction.issues,
        passages: a.extraction.passages.map((p) => ({
          page: p.page,
          sha256: p.sha256,
          text: p.text,
          locator: p.locator,
        })),
        parserVersion: a.extraction.parserVersion,
        state: a.extraction.state,
      },
      language: a.language,
      versionStatus: a.versionStatus,
      versionNumber: a.versionNumber,
      documentType: a.documentType,
      documentTitle: a.documentTitle,
      fileName: a.fileName,
      sourceSha256: a.sourceSha256,
      representationId: a.representationId,
      documentVersionId: a.documentVersionId,
      documentId: a.documentId,
      id: a.id,
    };
    expect(dossierSnapshotHash([a])).toBe(dossierSnapshotHash([reordered]));
    reordered.extraction.passages[0].text = 'Changed';
    expect(dossierSnapshotHash([a])).not.toBe(dossierSnapshotHash([reordered]));
  });
  it('reads multilingual table rows with exact cited values', () => {
    const a = source(
      'a',
      'Cod fiscal\t 00123  \nAdresse :\tRue École\nСтандарт\tISO 9001\nAudit type\t',
    );
    const b = source(
      'b',
      'Cod fiscal:\t00124\nAdresse\tRue Ecole\nСтандарт\tISO 9001',
    );
    const result = analyzeDossier({ sources: [a, b], missingDocuments: [] });
    expect(result.candidates.map((c) => [c.field, c.value])).toEqual([
      ['taxId', '00123'],
      ['address', 'Rue École'],
      ['standard', 'ISO 9001'],
      ['taxId', '00124'],
      ['address', 'Rue Ecole'],
      ['standard', 'ISO 9001'],
    ]);
    expect(result.comparisons.map((c) => [c.field, c.outcome])).toEqual([
      ['taxId', 'conflict'],
      ['address', 'match'],
      ['standard', 'match'],
    ]);
    for (const c of result.candidates) {
      const text =
        c.citation.sourceId === 'a'
          ? a.extraction.passages[0].text
          : b.extraction.passages[0].text;
      expect(text.slice(c.citation.start, c.citation.end)).toBe(c.value);
      expect(c.citation.quote).toBe(c.value);
    }
  });
  it('recognizes indented labels and event references without moving original citations', () => {
    const a = source(
      'a',
      '  Cod fiscal: 00123\n\tAdresse:\tRue École\n  Event: annual\n\tStage 1 Contract reference: C-001',
    );
    const b = source(
      'b',
      'Cod fiscal: 00124\nEvent: annual\nStage 1 Contract reference: C-001',
    );
    const result = analyzeDossier({ sources: [a, b], missingDocuments: [] });
    expect(result.candidates.map((c) => [c.field, c.value, c.event])).toEqual([
      ['taxId', '00123', null],
      ['address', 'Rue École', null],
      ['reference', 'C-001', 'event:annual|stage1'],
      ['taxId', '00124', null],
      ['reference', 'C-001', 'event:annual|stage1'],
    ]);
    expect(result.candidates[0].citation).toMatchObject({
      start: 14,
      end: 19,
      quote: '00123',
    });
    expect(result.comparisons.map((c) => [c.field, c.outcome])).toEqual([
      ['taxId', 'conflict'],
      ['reference', 'match'],
    ]);
    for (const c of result.candidates) {
      const text =
        c.citation.sourceId === 'a'
          ? a.extraction.passages[0].text
          : b.extraction.passages[0].text;
      expect(text.slice(c.citation.start, c.citation.end)).toBe(c.value);
    }
  });
  it.each([
    ['  IDNO: 0012345678901', 'taxId', '0012345678901'],
    ['\tФискальный код: 0012345678901', 'taxId', '0012345678901'],
    ['Denumirea organizaţiei: Atelier Ştiinţă', 'legalName', 'Atelier Ştiinţă'],
    ['Adresa\u0306:\tStrada Unirii', 'address', 'Strada Unirii'],
  ])(
    'recognizes Romanian and Russian document labels with exact evidence: %s',
    (text, field, value) => {
      const input = source('a', text);
      const result = analyzeDossier({ sources: [input], missingDocuments: [] });
      expect(result.candidates.map((c) => [c.field, c.value])).toEqual([
        [field, value],
      ]);
      const c = result.candidates[0];
      expect(c.citation.quote).toBe(value);
      expect(text.slice(c.citation.start, c.citation.end)).toBe(value);
    },
  );
  it('keeps complete multiline Word cell values and refuses ambiguous column associations', () => {
    const address = source('address', 'Адрес\tулица Мира 1\nКишинёв');
    const tax = source('tax', 'Фискальный\nкод\t001234\n005678');
    const columns = source('columns', '\tIDNO\t000999');
    for (const s of [address, tax, columns])
      s.extraction.passages[0].locator = 'word/document.xml#table:1/row:1';
    const result = analyzeDossier({
      sources: [address, tax, columns, source('plain', 'IDNO: 001234')],
      missingDocuments: [],
    });
    expect(
      result.candidates.map((c) => [c.field, c.value, c.normalizationState]),
    ).toEqual([
      ['address', 'улица Мира 1\nКишинёв', 'normalized'],
      ['taxId', '001234\n005678', 'ambiguous'],
      ['taxId', '001234', 'normalized'],
    ]);
    expect(result.candidates[0].normalized).toBe('улица мира 1 кишинёв');
    expect(result.candidates[1].citation.quote).toBe('001234\n005678');
    expect(result.comparisons).toEqual([]);
  });
  it.each([
    {
      left: 'Etapa 1 Referinţă contract: C-001',
      right: 'Etapa 1 Referință contract: C-001',
      locator: 'p1',
    },
    {
      left: 'Etapa 1 Referinţă\ncontract\tC-001',
      right: 'Etapa 1 Referință contract\tC-001',
      locator: 'word/document.xml#table:1/row:1',
    },
    {
      left: 'Этап 1 Номер договора: C-001',
      right: 'Этап 1 Номер договора: C-001',
      locator: 'p1',
    },
  ])(
    'preserves explicit Romanian/Russian reference roles: $left',
    ({ left, right, locator }) => {
      const a = source('a', left),
        b = source('b', right);
      a.extraction.passages[0].locator = locator;
      b.extraction.passages[0].locator = locator;
      expect(
        analyzeDossier({
          sources: [a, b],
          missingDocuments: [],
        }).comparisons.map((c) => [c.field, c.outcome]),
      ).toEqual([['reference', 'match']]);
    },
  );
  it('does not infer facts from structurally ambiguous table rows', () => {
    const a = source('a', 'Cod fiscal\t00123');
    a.extraction.state = 'partial';
    a.extraction.issues = [{ code: 'merged_table_cell', locator: 'p1' }];
    const result = analyzeDossier({ sources: [a], missingDocuments: [] });
    expect(result.candidates).toEqual([]);
    expect(result.coverage.sources[0].issues[0].code).toBe('merged_table_cell');
  });
  it('records source coverage even without any readable passage', () => {
    const a = source('a', '');
    a.extraction.passages = [];
    a.extraction.state = 'unreadable';
    a.extraction.issues = [{ code: 'image_only', locator: null }];
    const result = createContextBundle({ sources: [a], maxBytes: 10000 });
    expect(result.sources[0].extraction.state).toBe('unreadable');
    expect(result.sources[0].extraction.issues[0].code).toBe('image_only');
    expect(result.rules.sourceContent).toBe('untrusted_data');
  });
  it('rejects empty and extra-key imports and bounds candidates', () => {
    const a = source('a', 'Legal name: Alpha');
    const snapshotHash = dossierSnapshotHash([a]);
    expect(() =>
      validateSuggestions({ sources: [a], snapshotHash, value: [] }),
    ).toThrow();
    const candidate = analyzeDossier({ sources: [a], missingDocuments: [] })
      .candidates[0];
    expect(() =>
      validateSuggestions({
        sources: [a],
        snapshotHash,
        value: [
          {
            field: 'legalName',
            value: 'Alpha',
            rationale: 'review',
            citations: [candidate.citation],
            approved: true,
          },
        ],
      }),
    ).toThrow();
    const many = source(
      'many',
      Array.from({ length: 501 }, () => 'Legal name: Alpha').join('\n'),
    );
    const result = analyzeDossier({ sources: [many], missingDocuments: [] });
    expect(result.candidates).toHaveLength(500);
    expect(result.coverage.truncatedCandidates).toBe(true);
  });
  it('bounds long extracted values and the serialized comparison budget', () => {
    const long = source('long', `Legal name: ${'x'.repeat(2 * 1024 * 1024)}`);
    const many = Array.from({ length: 80 }, (_, i) =>
      source(
        `n${String(i).padStart(3, '0')}`,
        `Legal name: ${'é'.repeat(700)}${i}`,
      ),
    );
    const sources = [long, ...many];
    const first = analyzeDossier({ sources, missingDocuments: [] });
    expect(first.coverage.truncatedCandidates).toBe(true);
    expect(first.coverage.truncatedComparisons).toBe(true);
    expect(
      first.candidates.find((c) => c.citation.sourceId === 'long'),
    ).toBeUndefined();
    expect(Buffer.byteLength(JSON.stringify(first), 'utf8')).toBeLessThan(
      2200000,
    );
    const second = analyzeDossier({ sources, missingDocuments: [] });
    expect(
      second.comparisons.map((c) => [
        c.left.citation.sourceId,
        c.right.citation.sourceId,
      ]),
    ).toEqual(
      first.comparisons.map((c) => [
        c.left.citation.sourceId,
        c.right.citation.sourceId,
      ]),
    );
    expect(
      searchDossier({
        sources: [long],
        query: 'x'.repeat(20),
        mode: 'literal',
        filters: {},
      }).hits,
    ).toHaveLength(1);
  });
  it('reports reproducible synthetic denominators and null undefined ratios', () => {
    const scenarios = evaluateScenarios();
    expect(scenarios.filter((scenario) => !scenario.passed)).toEqual([]);
    const result = evaluateEngine();
    expect(result.comparisonAccuracy).toEqual({
      matched: 4,
      expected: 4,
      observed: 4,
      precision: 1,
      recall: 1,
      falsePositive: 0,
      falseNegative: 0,
    });
    expect(result.coverageAccuracy).toEqual({
      matched: 5,
      expected: 5,
      observed: 5,
      precision: 1,
      recall: 1,
      falsePositive: 0,
      falseNegative: 0,
    });
    expect(qualityCounts(['expected'], ['wrong'])).toEqual({
      matched: 0,
      expected: 1,
      observed: 1,
      precision: 0,
      recall: 0,
      falsePositive: 1,
      falseNegative: 1,
    });
    expect(qualityCounts([], [])).toEqual({
      matched: 0,
      expected: 0,
      observed: 0,
      precision: null,
      recall: null,
      falsePositive: 0,
      falseNegative: 0,
    });
    expect(result.extraction.recall).toBe(1);
    expect(result.citations.precision).toBe(1);
    expect(result.comparisons).toEqual({ conflicts: 1, clarifications: 1 });
    expect(result.missingDocuments).toBe(1);
    expect(compareItems(['a', 'b'], ['a', 'a', 'wrong'])).toEqual({
      matched: 1,
      expected: 2,
      observed: 3,
      precision: 1 / 3,
      recall: 1 / 2,
    });
    expect(compareItems([], [])).toEqual({
      matched: 0,
      expected: 0,
      observed: 0,
      precision: null,
      recall: null,
    });
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(0, 1)).toBe(0);
    expect(dossierSnapshotHash([source('a', 'x')])).not.toBe(
      dossierSnapshotHash([source('a', 'y')]),
    );
  });
});
