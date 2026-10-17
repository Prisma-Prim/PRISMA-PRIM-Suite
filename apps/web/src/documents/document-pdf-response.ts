/** Preserved bytes are addressed by immutable Representation identity. */
export interface PreservedDocumentPdf {
  representationId: string;
  revision: number;
  fileName: string;
  mediaType: 'application/pdf';
  size: number;
  sha256: string;
  storedAt: string;
  storedBy: { displayName: string };
  scan: { outcome: 'clean'; engine: string; scannedAt: string };
}
export type DocumentPdfContent =
  | { state: 'absent' }
  | { state: 'stored'; access: 'denied' }
  | (PreservedDocumentPdf & { state: 'stored'; access: 'granted' });
export interface DocumentPdfHistory {
  uploads: Array<PreservedDocumentPdf & { current: boolean }>;
  nextBeforeRevision: number | null;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid PDF response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('Invalid PDF response');
  return value;
}
function integer(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new Error('Invalid PDF response');
  return value;
}
function instant(value: unknown): string {
  const result = text(value);
  const date = new Date(result);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== result)
    throw new Error('Invalid PDF response');
  return result;
}
function preserved(value: unknown): PreservedDocumentPdf {
  const row = record(value);
  const scan = record(row.scan);
  const fileName = text(row.fileName);
  const sha256 = text(row.sha256);
  const engine = text(scan.engine);
  if (
    row.mediaType !== 'application/pdf' ||
    scan.outcome !== 'clean' ||
    !/^[a-f0-9]{64}$/u.test(sha256) ||
    fileName.length < 5 ||
    fileName.length > 120 ||
    fileName !== fileName.trim() ||
    !/\.pdf$/iu.test(fileName) ||
    engine.length > 200 ||
    /[\p{Cc}\p{Cf}/\\]/u.test(fileName)
  )
    throw new Error('Invalid PDF response');
  return {
    representationId: text(row.representationId),
    revision: integer(row.revision, 2, 2147483647),
    fileName,
    mediaType: row.mediaType,
    size: integer(row.size, 1, 5242880),
    sha256,
    storedAt: instant(row.storedAt),
    storedBy: { displayName: text(record(row.storedBy).displayName) },
    scan: { outcome: scan.outcome, engine, scannedAt: instant(scan.scannedAt) },
  };
}
export function readDocumentPdfContent(value: unknown): DocumentPdfContent {
  const row = record(value);
  if (row.state === 'absent') return { state: 'absent' };
  if (row.state !== 'stored') throw new Error('Unknown PDF state');
  if (row.access === 'denied') return { state: 'stored', access: 'denied' };
  if (row.access !== 'granted') throw new Error('Unknown PDF access');
  return { ...preserved(row), state: 'stored', access: 'granted' };
}
export function readDocumentPdfHistory(value: unknown): DocumentPdfHistory {
  const row = record(value);
  if (!Array.isArray(row.uploads) || row.uploads.length > 20)
    throw new Error('Invalid PDF history');
  const uploads = row.uploads.map((value: unknown) => {
    const entry = record(value);
    if (typeof entry.current !== 'boolean')
      throw new Error('Invalid PDF history');
    return { ...preserved(entry), current: entry.current };
  });
  let previous = Number.POSITIVE_INFINITY;
  const identities = new Set<string>();
  for (const [index, upload] of uploads.entries()) {
    if (
      upload.revision >= previous ||
      identities.has(upload.representationId) ||
      (upload.current && index !== 0)
    )
      throw new Error('Invalid PDF history');
    previous = upload.revision;
    identities.add(upload.representationId);
  }
  const nextBeforeRevision =
    row.nextBeforeRevision === null
      ? null
      : integer(row.nextBeforeRevision, 2, 2147483647);
  if (
    nextBeforeRevision !== null &&
    (uploads.length !== 20 || uploads.at(-1)?.revision !== nextBeforeRevision)
  )
    throw new Error('Invalid PDF history');
  return { uploads, nextBeforeRevision };
}
