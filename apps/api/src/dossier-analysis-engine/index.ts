import { createHash } from 'node:crypto';

export const DOSSIER_ANALYSIS_PIPELINE_VERSION = 'dossier-analysis-rules/v2';

export interface EvidenceSource {
  id: string;
  documentId: string;
  documentVersionId: string;
  representationId: string | null;
  sourceSha256: string;
  fileName: string;
  documentTitle: string;
  documentType: string;
  versionNumber: number;
  versionStatus: 'draft' | 'official' | 'superseded';
  language: 'ro' | 'ru' | 'fr' | 'en';
  extraction: {
    state: 'complete' | 'partial' | 'unreadable' | 'failed';
    parserVersion: string;
    passages: {
      locator: string;
      text: string;
      sha256: string;
      page: number | null;
    }[];
    issues: { code: string; locator: string | null }[];
    unitsTotal: number;
    unitsReadable: number;
  };
}
export const FIELDS = [
  'legalName',
  'taxId',
  'address',
  'standard',
  'auditType',
  'auditDate',
  'decisionDate',
  'validFrom',
  'validUntil',
  'auditorDays',
  'reference',
  'scope',
] as const;
export type FieldName = (typeof FIELDS)[number];
export interface Citation {
  sourceId: string;
  documentVersionId: string;
  locator: string;
  start: number;
  end: number;
  quote: string;
  passageSha256: string;
}
export interface Candidate {
  field: FieldName;
  value: string;
  normalized: string | null;
  normalizationState: 'normalized' | 'ambiguous' | 'invalid' | 'unsupported';
  event: string | null;
  citation: Citation;
}
export interface Comparison {
  field: FieldName;
  left: Candidate;
  right: Candidate;
  outcome: 'match' | 'conflict' | 'clarify';
  basis: 'literal' | 'normalized' | 'prose';
}
export type FieldCoverage = {
  field: FieldName;
  state: 'evaluated' | 'not_evaluable';
  candidates: number;
  comparisons: number;
};
const hash = (s: string) =>
  createHash('sha256').update(s, 'utf8').digest('hex');
/** Stable snapshot of all input facts, including extraction state and exact text. */
export function dossierSnapshotHash(
  sources: readonly EvidenceSource[],
): string {
  return hash(
    JSON.stringify(
      [...sources].sort((a, b) => a.id.localeCompare(b.id)),
      (_key, value: unknown) =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
            )
          : value,
    ),
  );
}
const labels: Record<FieldName, readonly string[]> = {
  legalName: [
    'legal name',
    'company name',
    'denumire juridică',
    'denumire juridica',
    'denumirea organizației',
    'denumirea organizatiei',
    'raison sociale',
    'наименование организации',
    'юридическое название',
  ],
  taxId: [
    'tax id',
    'tax identification number',
    'cod fiscal',
    'cui',
    'idno',
    'идно',
    'фискальный код',
    'identifiant fiscal',
    'numéro fiscal',
    'инн',
    'налоговый номер',
  ],
  address: ['address', 'adresă', 'adresa', 'adresse', 'адрес'],
  standard: ['standard', 'standardul', 'norme', 'стандарт'],
  auditType: [
    'audit type',
    'tip audit',
    'tipul auditului',
    'type d’audit',
    "type d'audit",
    'вид аудита',
  ],
  auditDate: [
    'audit date',
    'data auditului',
    'date d’audit',
    "date d'audit",
    'дата аудита',
  ],
  decisionDate: [
    'decision date',
    'data deciziei',
    'date de décision',
    'дата решения',
  ],
  validFrom: [
    'valid from',
    'valabil de la',
    'valable à partir du',
    'действителен с',
  ],
  validUntil: [
    'valid until',
    'valabil până la',
    'valabil pana la',
    'valable jusqu’au',
    "valable jusqu'au",
    'действителен до',
  ],
  auditorDays: [
    'auditor days',
    'auditor-days',
    'zile auditor',
    'zile-auditor',
    'jours auditeur',
    'аудиторские дни',
  ],
  reference: [
    'contract reference',
    'invoice reference',
    'referință contract',
    'referinta contract',
    'referință factură',
    'referinta factura',
    'référence contrat',
    'référence facture',
    'номер договора',
    'номер счета',
    'номер счёта',
    'reference',
    'referință',
    'referinta',
    'référence',
    'ссылка',
    'номер дела',
  ],
  scope: [
    'scope',
    'domeniu',
    'domeniul certificării',
    'domeniul certificarii',
    'périmètre',
    'область сертификации',
  ],
};
const fieldsByLabel = new Map<string, FieldName>();
for (const field of FIELDS)
  for (const label of labels[field]) fieldsByLabel.set(fold(label), field);
function normalize(
  field: FieldName,
  value: string,
): Pick<Candidate, 'normalized' | 'normalizationState'> {
  if (
    !['legalName', 'address', 'scope'].includes(field) &&
    /[\r\n]/u.test(value)
  )
    return { normalized: null, normalizationState: 'ambiguous' };
  if (
    ['auditDate', 'decisionDate', 'validFrom', 'validUntil'].includes(field)
  ) {
    const trimmed = value.trim();
    const match =
      /^(\d{4})-(\d{2})-(\d{2})$|^(\d{2})[./](\d{2})[./](\d{4})$/u.exec(
        trimmed,
      );
    if (!match) return { normalized: null, normalizationState: 'invalid' };
    if (
      !match[1] &&
      Number(match[4]) <= 12 &&
      Number(match[5]) <= 12 &&
      Number(match[4]) > 0 &&
      Number(match[5]) > 0
    )
      return { normalized: null, normalizationState: 'ambiguous' };
    const iso = match[1]
      ? `${match[1]}-${match[2]}-${match[3]}`
      : `${match[6]}-${match[5]}-${match[4]}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) &&
      date.toISOString().slice(0, 10) === iso
      ? { normalized: iso, normalizationState: 'normalized' }
      : { normalized: null, normalizationState: 'invalid' };
  }
  if (field === 'auditorDays') {
    const m =
      /^(\d+(?:[.,]\d+)?)\s*(?:auditor[ -]?days?|days?\s+auditor|zile(?:[ -]auditor)?|jours?\s+auditeur|аудиторских?\s+дн(?:я|ей))?$/iu.exec(
        value.trim(),
      );
    return m
      ? {
          normalized: String(Number(m[1].replace(',', '.'))),
          normalizationState: 'normalized',
        }
      : { normalized: null, normalizationState: 'unsupported' };
  }
  if (field === 'scope')
    return { normalized: null, normalizationState: 'unsupported' };
  if (field === 'legalName' || field === 'address')
    return {
      normalized: fold(value.trim()).replace(/\s+/gu, ' '),
      normalizationState: 'normalized',
    };
  return { normalized: value.trim(), normalizationState: 'normalized' };
}

function validPassage(p: EvidenceSource['extraction']['passages'][number]) {
  return hash(p.text) === p.sha256;
}
function citation(
  source: EvidenceSource,
  p: EvidenceSource['extraction']['passages'][number],
  start: number,
  end: number,
): Citation {
  return {
    sourceId: source.id,
    documentVersionId: source.documentVersionId,
    locator: p.locator,
    start,
    end,
    quote: p.text.slice(start, end),
    passageSha256: p.sha256,
  };
}
/** Only explicit reference labels establish a comparable business role. */
function referenceKind(
  candidate: Candidate,
  source: EvidenceSource,
): 'contract' | 'invoice' | null {
  const passage = source.extraction.passages.find(
    (p) => p.locator === candidate.citation.locator,
  );
  if (!passage) return null;
  const before = passage.text.slice(0, candidate.citation.start);
  const line = fold(
    (passage.locator.includes('#table:')
      ? before
      : before.slice(before.lastIndexOf('\n') + 1)
    )
      .trimStart()
      .normalize('NFC')
      .toLocaleLowerCase()
      .replace(/^(?:stage|etapa|étape|этап)\s*[12]\s*[-–:]?\s+/iu, '')
      .replace(/[\s:：]+$/u, ''),
  ).replace(/\s+/gu, ' ');
  if (
    [
      'contract reference',
      'referinta contract',
      'reference contrat',
      'номер договора',
    ].includes(line)
  )
    return 'contract';
  if (
    [
      'invoice reference',
      'referinta factura',
      'reference facture',
      'номер счета',
      'номер счёта',
    ].includes(line)
  )
    return 'invoice';
  return null;
}
export function analyzeDossier({
  sources,
  missingDocuments,
}: {
  sources: readonly EvidenceSource[];
  missingDocuments: readonly { documentId: string; title: string }[];
}) {
  const candidates: Candidate[] = [];
  let truncatedCandidates = false;
  let candidateBytes = 0;
  for (const source of sources)
    for (const p of source.extraction.passages) {
      if (
        !validPassage(p) ||
        source.extraction.state === 'failed' ||
        source.extraction.state === 'unreadable' ||
        source.extraction.issues.some(
          (issue) =>
            (issue.locator === p.locator &&
              [
                'table_cell_tab',
                'merged_table_cell',
                'embedded_text_container',
                'complex_layout',
                'overlapping_text',
                'table_continuation',
              ].includes(issue.code)) ||
            (issue.code === 'nested_table' && p.locator.includes('#table:')),
        )
      )
        continue;
      const tableRow = p.locator.includes('#table:');
      if (tableRow && p.text.split('\t').length !== 2) continue;
      let offset = 0;
      let namedEvent: string | null = null;
      let invalidEvent = false;
      for (const line of tableRow ? [p.text] : p.text.split('\n')) {
        const lineOffset = offset;
        offset += line.length + 1;
        const content = line.trimStart();
        const indentation = line.length - content.length;
        const eventLine =
          /^(?:event|eveniment|événement|событие)\s*:\s*(\S(?:.*\S)?)\s*$/iu.exec(
            content,
          );
        if (eventLine) {
          invalidEvent = Buffer.byteLength(eventLine[1], 'utf8') > 200;
          if (invalidEvent) {
            truncatedCandidates = true;
            namedEvent = null;
          } else namedEvent = eventLine[1];
        }
        const stage = /^(?:stage|etapa|étape|этап)\s*([12])\s*[-–:]?\s+/iu.exec(
          content,
        );
        const stageKey = stage ? `stage${stage[1]}` : null;
        const event = namedEvent
          ? `event:${namedEvent}${stageKey ? `|${stageKey}` : ''}`
          : stageKey;
        const prefixLength = indentation + (stage?.[0].length ?? 0);
        const body = line.slice(prefixLength);
        const separator = body.search(/[:：\t]/u);
        const field =
          separator < 0 || separator > 100
            ? undefined
            : fieldsByLabel.get(
                fold(body.slice(0, separator)).replace(/\s+/gu, ' ').trim(),
              );
        if (!field) continue;
        const suffix = body.slice(separator);
        const m =
          /^(?:[ \r]*[:：][ \r]*(?:\t[ \r]*)?|[ \r]*\t[ \r]*)([^\s\t](?:[^\t]*?[^\s\t])?)[ \r]*$/u.exec(
            suffix,
          );
        if (!m) continue;
        if (
          invalidEvent ||
          Buffer.byteLength(m[1], 'utf8') > 4096 ||
          candidates.length >= 500
        ) {
          truncatedCandidates = true;
          continue;
        }
        const start =
          lineOffset + prefixLength + separator + suffix.indexOf(m[1]);
        const candidate: Candidate = {
          field,
          value: m[1],
          ...normalize(field, m[1]),
          event,
          citation: citation(source, p, start, start + m[1].length),
        };
        const size = Buffer.byteLength(JSON.stringify(candidate), 'utf8') + 1;
        if (candidateBytes + size > 1048576) {
          truncatedCandidates = true;
          continue;
        }
        candidates.push(candidate);
        candidateBytes += size;
      }
    }
  const byId = new Map(sources.map((s) => [s.id, s]));
  const refs = new Map<string, Set<string>>();
  for (const c of candidates.filter((c) => c.field === 'reference')) {
    const set = refs.get(c.citation.sourceId) ?? new Set<string>();
    set.add(c.value);
    refs.set(c.citation.sourceId, set);
  }
  const occurrences = new Map<string, number>();
  for (const c of candidates) {
    const key = JSON.stringify([c.citation.sourceId, c.field, c.event]);
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }
  const comparisons: Comparison[] = [];
  let truncatedComparisons = false;
  let comparisonBytes = 0;
  comparisonLoop: for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      const left = candidates[i],
        right = candidates[j];
      if (
        left.field !== right.field ||
        left.citation.sourceId === right.citation.sourceId
      )
        continue;
      if (
        (occurrences.get(
          JSON.stringify([left.citation.sourceId, left.field, left.event]),
        ) ?? 0) !== 1 ||
        (occurrences.get(
          JSON.stringify([right.citation.sourceId, right.field, right.event]),
        ) ?? 0) !== 1
      )
        continue;
      const a = byId.get(left.citation.sourceId),
        b = byId.get(right.citation.sourceId);
      if (
        !a ||
        !b ||
        (a.documentId === b.documentId &&
          a.documentVersionId !== b.documentVersionId)
      )
        continue;
      const sameVersion =
        a.documentId === b.documentId &&
        a.documentVersionId === b.documentVersionId;
      const ar = refs.get(a.id),
        br = refs.get(b.id);
      const sameRef =
        !!ar &&
        !!br &&
        ar.size === 1 &&
        br.size === 1 &&
        [...ar][0] === [...br][0];
      const leftReferenceKind =
        left.field === 'reference' ? referenceKind(left, a) : null;
      const rightReferenceKind =
        right.field === 'reference' ? referenceKind(right, b) : null;
      if (
        leftReferenceKind &&
        rightReferenceKind &&
        leftReferenceKind !== rightReferenceKind
      )
        continue;
      const typedReference =
        left.field === 'reference' &&
        left.event !== null &&
        left.event === right.event &&
        leftReferenceKind !== null &&
        leftReferenceKind === rightReferenceKind;
      if (!sameVersion && ar && br && !sameRef && !typedReference) continue;
      if ((left.event || right.event) && left.event !== right.event) continue;
      const eventField = [
        'auditType',
        'auditDate',
        'decisionDate',
        'validFrom',
        'validUntil',
        'auditorDays',
        'reference',
      ].includes(left.field);
      if (left.field === 'reference' && !sameVersion && !typedReference)
        continue;
      const sameExplicitEvent =
        left.event !== null &&
        left.event === right.event &&
        (left.event.startsWith('event:') || sameRef);
      if (eventField && !sameVersion && !sameExplicitEvent && !typedReference)
        continue;
      let outcome: Comparison['outcome'];
      let basis: Comparison['basis'];
      if (left.field === 'scope') {
        if (left.value === right.value) {
          outcome = 'match';
          basis = 'literal';
        } else {
          outcome = 'clarify';
          basis = 'prose';
        }
      } else {
        if (left.normalized === null || right.normalized === null) continue;
        outcome = left.normalized === right.normalized ? 'match' : 'conflict';
        basis = left.value === right.value ? 'literal' : 'normalized';
      }
      if (comparisons.length >= 5000) {
        truncatedComparisons = true;
        break comparisonLoop;
      }
      const comparison: Comparison = {
        field: left.field,
        left,
        right,
        outcome,
        basis,
      };
      const size = Buffer.byteLength(JSON.stringify(comparison), 'utf8') + 1;
      if (comparisonBytes + size > 1048576) {
        truncatedComparisons = true;
        break comparisonLoop;
      }
      comparisons.push(comparison);
      comparisonBytes += size;
    }
  const fields: FieldCoverage[] = FIELDS.map((field) => ({
    field,
    state: comparisons.some((c) => c.field === field)
      ? 'evaluated'
      : 'not_evaluable',
    candidates: candidates.filter((c) => c.field === field).length,
    comparisons: comparisons.filter((c) => c.field === field).length,
  }));
  return {
    snapshotHash: dossierSnapshotHash(sources),
    pipelineVersion: DOSSIER_ANALYSIS_PIPELINE_VERSION,
    candidates,
    comparisons,
    coverage: {
      fields,
      truncatedCandidates,
      truncatedComparisons,
      missingDocuments: [...missingDocuments],
      sources: sources.map((s) => ({
        sourceId: s.id,
        state: s.extraction.state,
        unitsTotal: s.extraction.unitsTotal,
        unitsReadable: s.extraction.unitsReadable,
        issues: s.extraction.issues,
        integrityFailures: s.extraction.passages.filter((p) => !validPassage(p))
          .length,
      })),
    },
  };
}

export type SearchMode = 'literal' | 'lexical' | 'fuzzy';
export interface SearchFilters {
  language?: EvidenceSource['language'];
  kind?: string;
  documentId?: string;
  sourceId?: string;
  field?: FieldName;
  versionStatus?: EvidenceSource['versionStatus'];
}
export interface SearchHit {
  source: EvidenceSource;
  passage: EvidenceSource['extraction']['passages'][number];
  score: number;
  reason: string;
}
function fold(value: string): string {
  return value
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/\p{Script=Latin}\p{M}*/gu, (character) =>
      character.normalize('NFD').replace(/\p{M}/gu, ''),
    );
}
const tokens = (value: string) => fold(value).match(/[\p{L}\p{N}]+/gu) ?? [];
// Explicit language-local alternatives only; no automatic translation.
const synonyms: readonly (readonly string[])[] = [
  ['audit', 'auditing', 'auditul', 'auditului', 'audituri', 'auditurilor'],
  [
    'certificare',
    'certificarea',
    'certificari',
    'certificarii',
    'certificarilor',
  ],
  [
    'certificat',
    'certificatul',
    'certificatului',
    'certificate',
    'certificatelor',
  ],
  ['document', 'documentul', 'documentului', 'documente', 'documentelor'],
  ['contract', 'contractul', 'contractului', 'contracte', 'contractelor'],
  ['certification', 'certifie'],
  ['аудит', 'аудита', 'аудиту', 'аудитом', 'аудитов'],
  [
    'сертификат',
    'сертификата',
    'сертификату',
    'сертификатом',
    'сертификаты',
    'сертификатов',
  ],
  [
    'документ',
    'документа',
    'документу',
    'документом',
    'документы',
    'документов',
  ],
  ['договор', 'договора', 'договору', 'договором', 'договоры', 'договоров'],
  ['сертификация', 'сертификации', 'сертификацию', 'сертификацией'],
];
function equivalent(a: string, b: string) {
  return (
    a === b || synonyms.some((group) => group.includes(a) && group.includes(b))
  );
}
function withinOneTypo(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++edits > 1) return false;
      if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) {
        i += 2;
        j += 2;
        continue;
      }
      if (a.length >= b.length) i++;
      if (b.length >= a.length) j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
function searchScore(
  text: string,
  query: string,
  mode: SearchMode,
): { score: number; reason: string } | null {
  if (mode === 'literal')
    return text.includes(query) ? { score: 100, reason: 'literal' } : null;
  const wanted = tokens(query),
    available = tokens(text);
  if (!wanted.length) return null;
  let approximate = false;
  let alternative = false;
  for (const word of wanted) {
    if (available.some((other) => other === word)) continue;
    if (available.some((other) => equivalent(word, other))) {
      alternative = true;
      continue;
    }
    if (
      mode === 'fuzzy' &&
      word.length >= 4 &&
      available.some((other) => withinOneTypo(word, other))
    ) {
      approximate = true;
      continue;
    }
    return null;
  }
  if (approximate) return { score: 50, reason: 'fuzzy' };
  if (alternative) return { score: 70, reason: 'lexical' };
  const phrase = available.some((_, start) =>
    wanted.every((word, index) => available[start + index] === word),
  );
  return { score: phrase ? 90 : 80, reason: 'lexical' };
}
export function searchDossier({
  sources,
  query,
  mode,
  filters,
  cursor,
  limit = 20,
}: {
  sources: readonly EvidenceSource[];
  query: string;
  mode: SearchMode;
  filters: SearchFilters;
  cursor?: string;
  limit?: number;
}): {
  snapshotHash: string;
  hits: SearchHit[];
  nextCursor: string | null;
  truncated: boolean;
} {
  if (
    !query.trim() ||
    query.length > 200 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !['literal', 'lexical', 'fuzzy'].includes(mode)
  )
    throw new Error('Invalid search');
  const snapshotHash = dossierSnapshotHash(sources);
  const binding = hash(
    JSON.stringify([
      snapshotHash,
      query,
      mode,
      filters.language ?? null,
      filters.kind ?? null,
      filters.documentId ?? null,
      filters.sourceId ?? null,
      filters.field ?? null,
      filters.versionStatus ?? null,
      limit,
    ]),
  );
  let offset = 0;
  if (cursor !== undefined) {
    if (cursor.length > 2048) throw new Error('Invalid cursor');
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Invalid cursor');
    }
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      parsed[0] !== binding ||
      !Number.isSafeInteger(parsed[1]) ||
      parsed[1] < 0
    )
      throw new Error('Invalid cursor');
    offset = parsed[1];
  }
  const hits: SearchHit[] = [];
  const fieldResult = filters.field
    ? analyzeDossier({ sources, missingDocuments: [] })
    : null;
  const matchingPassages = new Set(
    fieldResult?.candidates
      .filter((c) => c.field === filters.field)
      .map((c) => JSON.stringify([c.citation.sourceId, c.citation.locator])) ??
      [],
  );
  let inspected = 0;
  let truncated = fieldResult?.coverage.truncatedCandidates ?? false;
  for (const source of [...sources].sort((a, b) => a.id.localeCompare(b.id))) {
    if (
      (filters.language && source.language !== filters.language) ||
      (filters.kind && source.documentType !== filters.kind) ||
      (filters.documentId && source.documentId !== filters.documentId) ||
      (filters.sourceId && source.id !== filters.sourceId) ||
      (filters.versionStatus
        ? source.versionStatus !== filters.versionStatus
        : source.versionStatus === 'superseded') ||
      source.extraction.state === 'failed' ||
      source.extraction.state === 'unreadable'
    )
      continue;
    for (const passage of [...source.extraction.passages].sort((a, b) =>
      a.locator.localeCompare(b.locator),
    )) {
      if (++inspected > 10000) {
        truncated = true;
        break;
      }
      if (
        filters.field &&
        !matchingPassages.has(JSON.stringify([source.id, passage.locator]))
      )
        continue;
      if (!validPassage(passage)) continue;
      const result = searchScore(passage.text, query, mode);
      if (result) hits.push({ source, passage, ...result });
    }
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.source.id.localeCompare(b.source.id) ||
      a.passage.locator.localeCompare(b.passage.locator),
  );
  const page = hits.slice(offset, offset + limit);
  return {
    snapshotHash,
    hits: page,
    truncated,
    nextCursor:
      offset + limit < hits.length
        ? Buffer.from(JSON.stringify([binding, offset + limit])).toString(
            'base64url',
          )
        : null,
  };
}

/** Untrusted evidence only: the recipient must never treat document content as instructions. */
export function createContextBundle({
  sources,
  maxBytes,
  missingDocuments = [],
}: {
  sources: readonly EvidenceSource[];
  maxBytes: number;
  missingDocuments?: readonly { documentId: string; title: string }[];
}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
    throw new Error('Invalid byte limit');
  const entries: {
    sourceId: string;
    documentVersionId: string;
    locator: string;
    text: string;
    sha256: string;
  }[] = [];
  const omissions: {
    sourceId: string;
    locator: string;
    reason: 'byte_limit' | 'integrity' | 'unreadable';
  }[] = [];
  const pending: typeof entries = [];
  for (const source of [...sources].sort((a, b) => a.id.localeCompare(b.id)))
    for (const p of source.extraction.passages) {
      if (
        source.extraction.state === 'unreadable' ||
        source.extraction.state === 'failed'
      ) {
        omissions.push({
          sourceId: source.id,
          locator: p.locator,
          reason: 'unreadable',
        });
        continue;
      }
      if (!validPassage(p)) {
        omissions.push({
          sourceId: source.id,
          locator: p.locator,
          reason: 'integrity',
        });
        continue;
      }
      pending.push({
        sourceId: source.id,
        documentVersionId: source.documentVersionId,
        locator: p.locator,
        text: p.text,
        sha256: p.sha256,
      });
      omissions.push({
        sourceId: source.id,
        locator: p.locator,
        reason: 'byte_limit',
      });
    }
  const bundle = {
    version: 'dossier-context/v1' as const,
    snapshotHash: dossierSnapshotHash(sources),
    pipelineVersion: DOSSIER_ANALYSIS_PIPELINE_VERSION,
    missingDocuments: [...missingDocuments],
    rules: {
      sourceContent: 'untrusted_data' as const,
      proposals: 'human_review_required' as const,
    },
    sources: [...sources]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((source) => ({
        sourceId: source.id,
        documentId: source.documentId,
        documentVersionId: source.documentVersionId,
        representationId: source.representationId,
        sourceSha256: source.sourceSha256,
        fileName: source.fileName,
        documentTitle: source.documentTitle,
        documentType: source.documentType,
        versionNumber: source.versionNumber,
        versionStatus: source.versionStatus,
        language: source.language,
        extraction: {
          state: source.extraction.state,
          parserVersion: source.extraction.parserVersion,
          issues: source.extraction.issues,
          unitsTotal: source.extraction.unitsTotal,
          unitsReadable: source.extraction.unitsReadable,
        },
      })),
    entries,
    omissions,
  };
  if (Buffer.byteLength(JSON.stringify(bundle), 'utf8') > maxBytes)
    throw new Error('Byte limit cannot hold omission manifest');
  for (const entry of pending) {
    const index = omissions.findIndex(
      (o) =>
        o.sourceId === entry.sourceId &&
        o.locator === entry.locator &&
        o.reason === 'byte_limit',
    );
    const removed = omissions.splice(index, 1)[0];
    entries.push(entry);
    if (Buffer.byteLength(JSON.stringify(bundle), 'utf8') > maxBytes) {
      entries.pop();
      omissions.splice(index, 0, removed);
    }
  }
  return bundle;
}

export interface ProposedSuggestion {
  field: FieldName;
  value: string;
  rationale: string;
  citations: Citation[];
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Validates provenance and literal substrings, not semantic support or acceptance. */
export function validateSuggestions({
  sources,
  snapshotHash,
  value,
}: {
  sources: readonly EvidenceSource[];
  snapshotHash: string;
  value: unknown;
}): ProposedSuggestion[] {
  if (
    snapshotHash !== dossierSnapshotHash(sources) ||
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 100
  )
    throw new Error('Invalid suggestions');
  return value.map((item: unknown) => {
    if (
      !isObject(item) ||
      Object.keys(item).some(
        (key) => !['field', 'value', 'rationale', 'citations'].includes(key),
      ) ||
      typeof item.value !== 'string' ||
      !item.value.trim() ||
      item.value.length > 2000 ||
      typeof item.rationale !== 'string' ||
      !item.rationale.trim() ||
      item.rationale.length > 4000 ||
      !Array.isArray(item.citations) ||
      item.citations.length < 1 ||
      item.citations.length > 20
    )
      throw new Error('Invalid suggestion');
    const field = FIELDS.find((f) => f === item.field);
    if (!field) throw new Error('Invalid suggestion');
    const citations = item.citations.map((c: unknown): Citation => {
      if (
        !isObject(c) ||
        Object.keys(c).some(
          (key) =>
            ![
              'sourceId',
              'documentVersionId',
              'locator',
              'start',
              'end',
              'quote',
              'passageSha256',
            ].includes(key),
        ) ||
        typeof c.sourceId !== 'string' ||
        typeof c.documentVersionId !== 'string' ||
        typeof c.locator !== 'string' ||
        typeof c.start !== 'number' ||
        typeof c.end !== 'number' ||
        !Number.isSafeInteger(c.start) ||
        !Number.isSafeInteger(c.end) ||
        c.start < 0 ||
        c.end <= c.start ||
        typeof c.quote !== 'string' ||
        typeof c.passageSha256 !== 'string'
      )
        throw new Error('Invalid citation');
      const source = sources.find(
        (s) =>
          s.id === c.sourceId && s.documentVersionId === c.documentVersionId,
      );
      const passage = source?.extraction.passages.find(
        (p) => p.locator === c.locator,
      );
      if (
        !source ||
        source.extraction.state === 'unreadable' ||
        source.extraction.state === 'failed' ||
        !passage ||
        !validPassage(passage) ||
        passage.sha256 !== c.passageSha256 ||
        passage.text.slice(c.start, c.end) !== c.quote ||
        c.end > passage.text.length
      )
        throw new Error('Invalid citation');
      return {
        sourceId: c.sourceId,
        documentVersionId: c.documentVersionId,
        locator: c.locator,
        start: c.start,
        end: c.end,
        quote: c.quote,
        passageSha256: c.passageSha256,
      };
    });
    return { field, value: item.value, rationale: item.rationale, citations };
  });
}
