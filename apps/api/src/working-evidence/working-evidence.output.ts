import { createHash } from 'node:crypto';
import { zipSync, type Zippable } from 'fflate';
import { refuse, type SupportView } from './working-evidence.contract.js';

export const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
function escaped(value: string | number | null): string {
  return String(value ?? '—').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
}
function applicationOrigin(): string {
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return refuse('content_unavailable');
  }
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol))
    return refuse('content_unavailable');
  return origin;
}
export function buildWorkingEvidenceOutput(input: {
  caseId: string;
  projectId: string;
  originalClientId: string;
  revisionId: string;
  revisionNumber: number;
  recordedAt: string;
  displayName: string;
  title: string;
  declaredContext: string | null;
  process: string;
  statement: string;
  observationNote: string | null;
  reason: string | null;
  supports: readonly (SupportView & { bytes: Buffer })[];
}) {
  const label = 'Working · human-declared · unclassified · non-official';
  // Freeze the configured App destination with new output; never derive it from
  // request headers or rewrite a previously committed statement on delivery.
  const origin = applicationOrigin();
  const html = (offline: boolean) => {
    const entries = input.supports
      .map(
        (s) =>
          `<li><a href="${offline ? `evidence/${s.evidenceId}.pdf` : `${escaped(origin)}/#working-evidence/${input.caseId}/${input.revisionId}/${s.evidenceId}`}">${escaped(s.sourceTitle)}</a><dl><dt>Purpose</dt><dd>${escaped(s.sourcePurpose)}</dd><dt>Version</dt><dd>${s.versionNumber}</dd><dt>Document</dt><dd>${s.documentId}</dd><dt>Version identity</dt><dd>${s.versionId}</dd><dt>Representation</dt><dd>${s.representationId}</dd><dt>Filename</dt><dd>${escaped(s.filename)}</dd><dt>Media type</dt><dd>application/pdf</dd><dt>Bytes</dt><dd>${s.sizeBytes}</dd><dt>SHA-256</dt><dd>${s.sha256}</dd><dt>Human locator</dt><dd>${escaped(s.locator)}</dd><dt>Support note</dt><dd>${escaped(s.supportNote)}</dd></dl></li>`,
      )
      .join('');
    const text = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Working evidence statement</title></head><body><header><p>${label}</p><h1>${escaped(input.title)}</h1></header><main><dl><dt>Project</dt><dd>${input.projectId}</dd><dt>Original Client</dt><dd>${input.originalClientId}</dd><dt>Case</dt><dd>${input.caseId}</dd><dt>Revision</dt><dd>${input.revisionNumber}</dd><dt>Recorded by</dt><dd>${escaped(input.displayName)}</dd><dt>Recorded at</dt><dd>${input.recordedAt}</dd><dt>Declared context</dt><dd>${escaped(input.declaredContext)}</dd><dt>Process</dt><dd>${escaped(input.process)}</dd><dt>Working statement</dt><dd>${escaped(input.statement)}</dd><dt>Observation note</dt><dd>${escaped(input.observationNote)}</dd><dt>Correction reason</dt><dd>${escaped(input.reason)}</dd></dl><h2>Exact preserved supports</h2><ol>${entries}</ol></main></body></html>`;
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length > 262144) return refuse('content_unavailable');
    return bytes;
  };
  const statement = html(false),
    offline = html(true);
  const files: Zippable = {};
  const options = {
    level: 0,
    mtime: new Date('1980-01-01T00:00:00.000Z'),
  } satisfies Parameters<typeof zipSync>[1];
  files['statement.html'] = [offline, options];
  files['index.html'] = [offline, options];
  for (const s of input.supports) {
    if (s.bytes.length !== s.sizeBytes || digest(s.bytes) !== s.sha256)
      return refuse('content_unavailable');
    files[`evidence/${s.evidenceId}.pdf`] = [s.bytes, options];
  }
  const annex = Buffer.from(zipSync(files, { level: 0 }));
  if (annex.length > 16777216) return refuse('content_unavailable');
  return {
    statement,
    statementSha256: digest(statement),
    annex,
    annexSha256: digest(annex),
  };
}
