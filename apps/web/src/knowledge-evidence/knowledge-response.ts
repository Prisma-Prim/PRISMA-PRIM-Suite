/** Consumed web representation only. Additive fields confer no authority. */
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed evidence.');
  return Object.fromEntries(Object.entries(value));
}
export function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}
export function literal(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    !!value.trim() &&
    ![...value].some((character) => {
      const point = character.codePointAt(0);
      return (
        point !== undefined &&
        ((point >= 0xd800 && point <= 0xdfff) ||
          point === 0 ||
          (point < 32 && point !== 9 && point !== 10 && point !== 13))
      );
    })
  );
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value))
    throw new Error('Malformed evidence.');
  return value;
}
export async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
export interface Source {
  sourceId: string;
  documentId: string;
  documentVersionId: string;
  representationId: string;
  title: string;
  language: 'ro' | 'ru' | 'en';
  versionStatus: 'official' | 'superseded';
  sourceSha256: string;
  projectionSha256: string;
}
export function readSource(value: unknown, historical = false): Source {
  const row = record(value);
  const {
    sourceId,
    documentId,
    documentVersionId,
    representationId,
    title,
    language,
    versionStatus,
  } = row;
  if (
    !uuid(sourceId) ||
    !uuid(documentId) ||
    !uuid(documentVersionId) ||
    !uuid(representationId) ||
    !literal(title, 200) ||
    (language !== 'ro' && language !== 'ru' && language !== 'en') ||
    (versionStatus !== 'official' &&
      !(historical && versionStatus === 'superseded'))
  )
    throw new Error('Malformed evidence.');
  return {
    sourceId,
    documentId,
    documentVersionId,
    representationId,
    title,
    language,
    versionStatus,
    sourceSha256: hash(row.sourceSha256),
    projectionSha256: hash(row.projectionSha256),
  };
}
export interface Citation {
  source: Source;
  locator: string;
  text: string;
  retrievedAt: string;
  passageSha256: string;
}
function sameSource(left: Source, right: Source) {
  return (
    left.sourceId === right.sourceId &&
    left.documentId === right.documentId &&
    left.documentVersionId === right.documentVersionId &&
    left.representationId === right.representationId &&
    left.sourceSha256 === right.sourceSha256 &&
    left.projectionSha256 === right.projectionSha256 &&
    left.title === right.title &&
    left.language === right.language
  );
}
export async function readPassage(
  value: unknown,
  mode: 'current' | 'historical',
  target?: Citation,
): Promise<Citation> {
  const row = record(value),
    source = readSource(row.source, mode === 'historical');
  const { locator, text, retrievedAt } = row;
  if (
    !literal(locator, 120) ||
    locator === '.' ||
    locator === '..' ||
    !literal(text, 16384) ||
    typeof retrievedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(retrievedAt) ||
    !Number.isFinite(Date.parse(retrievedAt)) ||
    new Date(retrievedAt).getUTCFullYear() < 1 ||
    new Date(retrievedAt).toISOString() !== retrievedAt
  )
    throw new Error('Malformed evidence.');
  const passageSha256 = hash(row.passageSha256);
  if ((await digest(new TextEncoder().encode(text))) !== passageSha256)
    throw new Error('Malformed evidence.');
  if (
    target &&
    (!sameSource(source, target.source) ||
      locator !== target.locator ||
      passageSha256 !== target.passageSha256 ||
      text !== target.text)
  )
    throw new Error('Malformed evidence.');
  return { source, locator, text, retrievedAt, passageSha256 };
}
function cursor(value: unknown): string | null {
  if (value === null) return null;
  if (!literal(value, 2048)) throw new Error('Malformed evidence.');
  return value;
}
export function readInventory(value: unknown) {
  const row = record(value);
  if (!Array.isArray(row.items) || row.items.length > 20)
    throw new Error('Malformed evidence.');
  const items = row.items.map((value) => readSource(value));
  if (new Set(items.map((item) => item.sourceId)).size !== items.length)
    throw new Error('Malformed evidence.');
  return { items, nextCursor: cursor(row.nextCursor) };
}
export async function readSearch(value: unknown, query: string) {
  const row = record(value);
  if (
    !Array.isArray(row.items) ||
    row.items.length > 20 ||
    !literal(query, 200)
  )
    throw new Error('Malformed evidence.');
  const items = await Promise.all(
    row.items.map((value) => readPassage(value, 'current')),
  );
  if (
    items.some((item) => !item.text.includes(query)) ||
    new Set(
      items.map((item) => JSON.stringify([item.source.sourceId, item.locator])),
    ).size !== items.length
  )
    throw new Error('Malformed evidence.');
  return { items, nextCursor: cursor(row.nextCursor) };
}
