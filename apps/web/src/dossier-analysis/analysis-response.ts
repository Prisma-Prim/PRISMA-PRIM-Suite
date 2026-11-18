import { uuid } from '../knowledge-evidence/knowledge-response';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid analysis response');
  return Object.fromEntries(Object.entries(value));
}
function str(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Invalid analysis response');
  return value;
}
function id(value: unknown): string {
  const result = str(value);
  if (!uuid(result)) throw new Error('Invalid identifier');
  return result;
}
function hash(value: unknown): string {
  const result = str(value);
  if (!/^[a-f0-9]{64}$/u.test(result)) throw new Error('Invalid hash');
  return result;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid analysis response');
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 10000)
    throw new Error('Invalid analysis response');
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid analysis response');
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  const found = choices.find((x) => x === value);
  if (!found) throw new Error('Invalid analysis response');
  return found;
}
export function citation(value: unknown) {
  const x = object(value);
  const start = integer(x.start),
    end = integer(x.end);
  if (
    end <= start ||
    typeof x.quote !== 'string' ||
    x.quote.length !== end - start
  )
    throw new Error('Invalid citation');
  return {
    sourceId: id(x.sourceId),
    documentVersionId: id(x.documentVersionId),
    locator: str(x.locator),
    start,
    end,
    quote: str(x.quote),
    passageSha256: hash(x.passageSha256),
  };
}
export function source(value: unknown) {
  const x = object(value),
    e = x.extraction === null ? null : object(x.extraction);
  if (
    typeof x.fileName !== 'string' ||
    !x.fileName.trim() ||
    x.fileName.length > 255 ||
    /[\\/\p{Cc}]/u.test(x.fileName) ||
    typeof x.sizeBytes !== 'number' ||
    x.sizeBytes <= 0 ||
    x.sizeBytes > 10 * 1024 * 1024
  )
    throw new Error('Invalid source');
  if (
    (x.kind === 'pdf' &&
      (x.mediaType !== 'application/pdf' || !uuid(x.representationId))) ||
    (x.kind === 'docx' &&
      (x.mediaType !==
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        x.representationId !== null))
  )
    throw new Error('Invalid source');
  return {
    id: id(x.id),
    kind: choice(x.kind, ['pdf', 'docx']),
    sourceSha256: hash(x.sourceSha256),
    sizeBytes: integer(x.sizeBytes),
    mediaType: str(x.mediaType),
    representationId:
      x.representationId === null ? null : id(x.representationId),
    documentId: id(x.documentId),
    documentVersionId: id(x.documentVersionId),
    documentTitle: str(x.documentTitle),
    documentType: str(x.documentType),
    versionNumber: integer(x.versionNumber),
    versionStatus: choice(x.versionStatus, ['draft', 'official', 'superseded']),
    fileName: str(x.fileName),
    language: choice(x.language, ['ro', 'ru', 'fr', 'en']),
    extraction:
      e === null
        ? null
        : {
            state: choice(e.state, [
              'complete',
              'partial',
              'unreadable',
              'failed',
            ]),
            unitsTotal: integer(e.unitsTotal),
            unitsReadable: integer(e.unitsReadable),
            passages: array(e.passages).map((p) => {
              const v = object(p);
              return {
                locator: str(v.locator),
                text: str(v.text),
                sha256: hash(v.sha256),
              };
            }),
            issues: array(e.issues).map((i) => {
              const v = object(i);
              return {
                code: str(v.code),
                locator: typeof v.locator === 'string' ? v.locator : null,
              };
            }),
          },
  };
}
function extractedSource(value: unknown) {
  const result = source(value);
  if (!result.extraction) throw new Error('Missing run extraction');
  return { ...result, extraction: result.extraction };
}
function run(value: unknown) {
  const x = object(value);
  return {
    id: id(x.id),
    snapshotHash: hash(x.snapshotHash),
    createdAt: str(x.createdAt),
    stale: bool(x.stale),
  };
}
function historyCursor(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096)
    throw new Error('Invalid history cursor');
  return value;
}
export function historyPage(value: unknown) {
  const x = object(value);
  const runs = array(x.runs).map(run);
  if (runs.length > 5) throw new Error('Invalid history page');
  if (new Set(runs.map((r) => r.id)).size !== runs.length)
    throw new Error('Duplicate run');
  return { runs, runsNextCursor: historyCursor(x.runsNextCursor) };
}
export function inventory(value: unknown) {
  const x = object(value);
  if (x.format !== 'DOSSIER_ANALYSIS/1') throw new Error('Invalid format');
  return {
    sources: array(x.sources).map(source),
    ...historyPage(x),
  };
}
function candidate(value: unknown) {
  const x = object(value);
  return {
    field: str(x.field),
    value: str(x.value),
    normalizationState: choice(x.normalizationState, [
      'normalized',
      'ambiguous',
      'invalid',
      'unsupported',
    ]),
    event: x.event === null ? null : str(x.event),
    citation: citation(x.citation),
  };
}
export function detail(value: unknown) {
  const x = object(value),
    base = run(x),
    coverage = object(x.coverage);
  const result = {
    ...base,
    sources: array(x.sources).map(extractedSource),
    candidates: array(x.candidates).map(candidate),
    comparisons: array(x.comparisons).map((v) => {
      const c = object(v);
      return {
        field: str(c.field),
        left: candidate(c.left),
        right: candidate(c.right),
        outcome: choice(c.outcome, ['match', 'conflict', 'clarify']),
        basis: choice(c.basis, ['literal', 'normalized', 'prose']),
      };
    }),
    coverage: {
      truncatedCandidates: bool(coverage.truncatedCandidates),
      truncatedComparisons: bool(coverage.truncatedComparisons),
      missingDocuments: array(coverage.missingDocuments).map((v) => {
        const d = object(v);
        return { title: str(d.title) };
      }),
      fields: array(coverage.fields).map((v) => {
        const f = object(v);
        return {
          field: str(f.field),
          state: str(f.state),
          candidates: integer(f.candidates),
        };
      }),
    },
    suggestions: array(x.suggestions).map((v) => {
      const s = object(v),
        p = object(s.proposal);
      return {
        id: id(s.id),
        revision: integer(s.revision),
        createdAt: str(s.createdAt),
        proposal: {
          field: str(p.field),
          value: str(p.value),
          rationale: str(p.rationale),
          citations: array(p.citations).map(citation),
        },
        reviews: array(s.reviews).map((v) => {
          const r = object(v);
          return {
            revision: integer(r.revision),
            decision: choice(r.decision, ['confirm', 'reject', 'correct']),
            replacementValue:
              typeof r.replacementValue === 'string'
                ? r.replacementValue
                : null,
            actorDisplayName: str(r.actorDisplayName),
            recordedAt: str(r.recordedAt),
          };
        }),
      };
    }),
  };
  function check(c: ReturnType<typeof citation>) {
    const source = result.sources.find(
      (s) => s.id === c.sourceId && s.documentVersionId === c.documentVersionId,
    );
    const passage = source?.extraction.passages.find(
      (p) => p.locator === c.locator && p.sha256 === c.passageSha256,
    );
    if (!passage || passage.text.slice(c.start, c.end) !== c.quote)
      throw new Error('Invalid citation');
  }
  for (const item of result.candidates) check(item.citation);
  for (const item of result.comparisons) {
    check(item.left.citation);
    check(item.right.citation);
  }
  for (const item of result.suggestions)
    for (const cit of item.proposal.citations) check(cit);
  return result;
}
export function search(value: unknown) {
  const x = object(value);
  return {
    snapshotHash: hash(x.snapshotHash),
    truncated: bool(x.truncated),
    nextCursor: x.nextCursor === null ? null : str(x.nextCursor),
    hits: array(x.hits).map((v) => {
      const h = object(v),
        p = object(h.passage);
      return {
        source: extractedSource(h.source),
        passage: {
          locator: str(p.locator),
          text: str(p.text),
          sha256: hash(p.sha256),
        },
        reason: str(h.reason),
      };
    }),
  };
}
