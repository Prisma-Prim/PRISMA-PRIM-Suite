import { createHash } from 'node:crypto';
import { isKnowledgeUuid } from './configuration.js';

type Mode =
  | { readonly mode: 'current' }
  | { readonly mode: 'historical'; readonly documentVersionId: string };

export type KnowledgeReadRequest = Mode &
  (
    | {
        readonly kind: 'sources';
        readonly limit: number;
        readonly cursor?: string;
      }
    | {
        readonly kind: 'search';
        readonly query: string;
        readonly limit: number;
        readonly cursor?: string;
      }
    | {
        readonly kind: 'passage';
        readonly sourceId: string;
        readonly locator: string;
      }
  );

interface SourceSummary {
  readonly sourceId: string;
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly sourceSha256: string;
  readonly projectionSha256: string;
  readonly title: string;
  readonly language: 'ro' | 'ru' | 'en';
  readonly versionStatus: 'official' | 'superseded';
}
interface Passage {
  readonly source: SourceSummary;
  readonly locator: string;
  readonly text: string;
  readonly passageSha256: string;
  readonly retrievedAt: string;
}
export type KnowledgeReadResult =
  | { readonly items: SourceSummary[]; readonly nextCursor: string | null }
  | { readonly items: Passage[]; readonly nextCursor: string | null }
  | Passage;

export class InvalidKnowledgeProtocol extends Error {
  constructor() {
    super('The knowledge protocol value is invalid.');
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InvalidKnowledgeProtocol();
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    Buffer.from(value, 'utf8').toString('utf8') !== value
  )
    throw new InvalidKnowledgeProtocol();
  return value;
}

function uuid(value: unknown): string {
  if (!isKnowledgeUuid(value)) throw new InvalidKnowledgeProtocol();
  return value.toLowerCase();
}

function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f\d]{64}$/u.test(value))
    throw new InvalidKnowledgeProtocol();
  return value;
}

function locator(value: unknown): string {
  const result = text(value, 120);
  if (result === '.' || result === '..') throw new InvalidKnowledgeProtocol();
  return result;
}

function cursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const result = text(value, 2048);
  if (
    [...result].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    throw new InvalidKnowledgeProtocol();
  return result;
}

/** Enforce the closed argument contract even for clients that skip discovery. */
export function readKnowledgeToolRequest(
  name: string,
  value: unknown,
): KnowledgeReadRequest {
  const input = value === undefined ? {} : object(value);
  const mode = readMode(input);
  const keys = ['mode', 'documentVersionId'];
  let request: KnowledgeReadRequest;
  switch (name) {
    case 'list_knowledge_sources':
      keys.push('limit', 'cursor');
      request = { ...mode, kind: 'sources', ...pagination(input) };
      break;
    case 'search_knowledge': {
      keys.push('query', 'limit', 'cursor');
      const query = text(input.query, 200);
      if (!query.trim()) throw new InvalidKnowledgeProtocol();
      request = { ...mode, kind: 'search', query, ...pagination(input) };
      break;
    }
    case 'get_knowledge_passage':
      keys.push('sourceId', 'locator');
      request = {
        ...mode,
        kind: 'passage',
        sourceId: uuid(input.sourceId),
        locator: locator(input.locator),
      };
      break;
    default:
      throw new InvalidKnowledgeProtocol();
  }
  if (Object.keys(input).some((key) => !keys.includes(key)))
    throw new InvalidKnowledgeProtocol();
  return request;
}

function readMode(input: Record<string, unknown>): Mode {
  if (input.mode === 'historical')
    return {
      mode: 'historical',
      documentVersionId: uuid(input.documentVersionId),
    };
  if (
    (input.mode !== undefined && input.mode !== 'current') ||
    input.documentVersionId !== undefined
  )
    throw new InvalidKnowledgeProtocol();
  return { mode: 'current' };
}

function pagination(input: Record<string, unknown>) {
  const limit = input.limit === undefined ? 20 : input.limit;
  if (
    typeof limit !== 'number' ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 20
  )
    throw new InvalidKnowledgeProtocol();
  const next = cursor(input.cursor);
  return { limit, ...(next === undefined ? {} : { cursor: next }) };
}

function source(value: unknown, request: Mode): SourceSummary {
  const row = object(value);
  if (
    (row.language !== 'ro' && row.language !== 'ru' && row.language !== 'en') ||
    (row.versionStatus !== 'official' && row.versionStatus !== 'superseded')
  )
    throw new InvalidKnowledgeProtocol();
  const result: SourceSummary = {
    sourceId: uuid(row.sourceId),
    documentId: uuid(row.documentId),
    documentVersionId: uuid(row.documentVersionId),
    sourceSha256: hash(row.sourceSha256),
    projectionSha256: hash(row.projectionSha256),
    title: text(row.title, 200),
    language: row.language,
    versionStatus: row.versionStatus,
  };
  if (
    (request.mode === 'current' && result.versionStatus !== 'official') ||
    (request.mode === 'historical' &&
      result.documentVersionId !== request.documentVersionId)
  )
    throw new InvalidKnowledgeProtocol();
  return result;
}

function passage(value: unknown, request: KnowledgeReadRequest): Passage {
  const row = object(value);
  const result: Passage = {
    source: source(row.source, request),
    locator: locator(row.locator),
    text: text(row.text, 16_384),
    passageSha256: hash(row.passageSha256),
    retrievedAt: text(row.retrievedAt, 40),
  };
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
      result.retrievedAt,
    ) ||
    Number.isNaN(Date.parse(result.retrievedAt)) ||
    new Date(result.retrievedAt).toISOString() !== result.retrievedAt ||
    createHash('sha256').update(result.text, 'utf8').digest('hex') !==
      result.passageSha256 ||
    (request.kind === 'passage' &&
      (result.source.sourceId !== request.sourceId ||
        result.locator !== request.locator))
  )
    throw new InvalidKnowledgeProtocol();
  return result;
}

/** Validate consumed wire fields and reconstruct output without upstream extras. */
export function readKnowledgeResult(
  value: unknown,
  request: KnowledgeReadRequest,
): KnowledgeReadResult {
  if (request.kind === 'passage') return passage(value, request);
  const row = object(value);
  if (!Array.isArray(row.items) || row.items.length > request.limit)
    throw new InvalidKnowledgeProtocol();
  const nextCursor = row.nextCursor === null ? null : cursor(row.nextCursor);
  if (nextCursor === undefined) throw new InvalidKnowledgeProtocol();
  if (request.kind === 'sources') {
    const items = row.items.map((item) => source(item, request));
    if (new Set(items.map((item) => item.sourceId)).size !== items.length)
      throw new InvalidKnowledgeProtocol();
    return { items, nextCursor };
  }
  const items = row.items.map((item) => passage(item, request));
  const identities = items.map((item) =>
    JSON.stringify([item.source.sourceId, item.locator]),
  );
  if (new Set(identities).size !== identities.length)
    throw new InvalidKnowledgeProtocol();
  return { items, nextCursor };
}
