import { createHash } from 'node:crypto';
import {
  arch,
  availableParallelism,
  cpus,
  platform,
  release,
  totalmem,
} from 'node:os';
import { performance } from 'node:perf_hooks';
import {
  extractDocumentText,
  DOCUMENT_TEXT_PARSER_VERSION,
  type TextExtraction,
} from '../document-text-extraction/index.js';
import {
  analyzeDossier,
  DOSSIER_ANALYSIS_PIPELINE_VERSION,
} from '../dossier-analysis-engine/index.js';
import { qualityCounts } from '../dossier-analysis-engine/evaluation.js';

export const scoreLiterals = qualityCounts;
export interface QualificationInput {
  id: string;
  kind: 'pdf' | 'docx';
  language: 'ro' | 'ru';
  bytes: Uint8Array;
  pdfPages: number | null;
  expected?: {
    state: TextExtraction['state'];
    passages: string[];
    candidates: string[];
  };
}
const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
const issueCodes = new Set([
  'no_native_text',
  'image_content',
  'complex_layout',
  'overlapping_text',
  'table_continuation',
  'nested_table',
  'merged_table_cell',
  'comments_present',
  'embedded_content',
  'external_relationship',
  'page_limit',
  'page_unreadable',
  'table_cell_tab',
  'tracked_changes',
  'unreferenced_part',
  'unsupported_content',
  'unsupported_relationship',
  'vector_content',
  'ambiguous_table',
  'text_limit',
  'source_size_limit',
  'time_limit',
  'parser_error',
  'embedded_text_container',
]);

/** Offline qualification only: no business writes, model calls or automatic approvals. */
export async function qualifyBatch({
  inputs,
  concurrency,
  mode,
  signal,
  stopAfter,
}: {
  inputs: readonly QualificationInput[];
  concurrency: 1 | 2;
  mode: 'prepared' | 'private';
  signal?: AbortSignal;
  stopAfter?: number;
}) {
  if (
    inputs.length < 1 ||
    inputs.length > 200 ||
    (concurrency !== 1 && concurrency !== 2) ||
    (stopAfter !== undefined &&
      (!Number.isSafeInteger(stopAfter) ||
        stopAfter < 1 ||
        stopAfter > inputs.length))
  )
    throw new Error('invalid_batch');
  const start = performance.now();
  const startedAt = new Date().toISOString();
  const baselineRssBytes = process.memoryUsage().rss;
  let rssPeakObservedBytes = baselineRssBytes;
  const sample = () => {
    rssPeakObservedBytes = Math.max(
      rssPeakObservedBytes,
      process.memoryUsage().rss,
    );
  };
  const timer = setInterval(sample, 10);
  let next = 0;
  let completed = 0;
  let stopped = signal?.aborted ?? false;
  const abort = () => {
    stopped = true;
  };
  signal?.addEventListener('abort', abort, { once: true });
  const observations: {
    ordinal: number;
    kind: QualificationInput['kind'];
    language: QualificationInput['language'];
    bytes: number;
    state: TextExtraction['state'];
    unitsTotal: number;
    unitsReadable: number;
    issues: string[];
    elapsedMs: number;
    extractionMs: number;
    analysisMs: number;
    quality: {
      passages: ReturnType<typeof scoreLiterals>;
      candidates: ReturnType<typeof scoreLiterals>;
      stateMatched: boolean;
    } | null;
    prepared: {
      fixtureId: string;
      sourceSha256: string;
      resultSha256: string;
      pdfPages: number | null;
    } | null;
  }[] = [];
  try {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (!stopped && next < inputs.length) {
          const ordinal = next++;
          const input = inputs[ordinal];
          const sourceHash = sha256(input.bytes);
          const before = performance.now();
          const extraction = await extractDocumentText({
            bytes: input.bytes,
            kind: input.kind,
          });
          const extractedAt = performance.now();
          const analysis = analyzeDossier({
            sources: [
              {
                id: 'source',
                documentId: 'document',
                documentVersionId: 'version',
                representationId: null,
                sourceSha256: sourceHash,
                fileName: `original.${input.kind}`,
                documentTitle: 'Offline input',
                documentType: 'certificate',
                versionNumber: 1,
                versionStatus: 'official',
                language: input.language,
                extraction,
              },
            ],
            missingDocuments: [],
          });
          if (sha256(input.bytes) !== sourceHash)
            throw new Error('source_changed');
          const candidates = analysis.candidates.map(
            (c) => `${c.field}:${c.value}`,
          );
          const analyzedAt = performance.now();
          observations.push({
            ordinal,
            kind: input.kind,
            language: input.language,
            bytes: input.bytes.byteLength,
            state: extraction.state,
            unitsTotal: extraction.unitsTotal,
            unitsReadable: extraction.unitsReadable,
            issues: [
              ...new Set(
                extraction.issues.map((i) =>
                  issueCodes.has(i.code) ? i.code : 'parser_issue',
                ),
              ),
            ],
            elapsedMs: performance.now() - before,
            extractionMs: extractedAt - before,
            analysisMs: analyzedAt - extractedAt,
            quality: input.expected
              ? {
                  passages: scoreLiterals(
                    input.expected.passages,
                    extraction.passages.map((p) => p.text),
                  ),
                  candidates: scoreLiterals(
                    input.expected.candidates,
                    candidates,
                  ),
                  stateMatched: extraction.state === input.expected.state,
                }
              : null,
            prepared:
              mode === 'prepared'
                ? {
                    fixtureId: input.id,
                    sourceSha256: sourceHash,
                    resultSha256: sha256(
                      JSON.stringify({ extraction, candidates }),
                    ),
                    pdfPages: input.pdfPages,
                  }
                : null,
          });
          completed++;
          if (stopAfter !== undefined && completed >= stopAfter) stopped = true;
          sample();
        }
      }),
    );
  } finally {
    clearInterval(timer);
    signal?.removeEventListener('abort', abort);
    sample();
  }
  observations.sort((a, b) => a.ordinal - b.ordinal);
  const wallMs = performance.now() - start;
  return {
    schema: 'dossier-volume-result/v1' as const,
    mode,
    status: stopped ? ('interrupted' as const) : ('completed' as const),
    stopReason: stopped
      ? signal?.aborted
        ? ('signal' as const)
        : ('completion_threshold' as const)
      : null,
    startedAt,
    finishedAt: new Date().toISOString(),
    versions: {
      parser: DOCUMENT_TEXT_PARSER_VERSION,
      engine: DOSSIER_ANALYSIS_PIPELINE_VERSION,
      node: process.version,
    },
    machine: {
      platform: platform(),
      release: release(),
      arch: arch(),
      logicalCpus: cpus().length,
      cpuModel: cpus()[0]?.model ?? 'unavailable',
      availableParallelism: availableParallelism(),
      totalMemoryBytes: totalmem(),
    },
    concurrency,
    accounting: {
      planned: inputs.length,
      admitted: next,
      completed,
      notAdmitted: inputs.length - next,
      failed: observations.filter((o) => o.state === 'failed').length,
      partial: observations.filter((o) => o.state === 'partial').length,
      unreadable: observations.filter((o) => o.state === 'unreadable').length,
      sourceBytesPlanned: inputs.reduce((n, i) => n + i.bytes.byteLength, 0),
      sourceBytesCompleted: observations.reduce((n, o) => n + o.bytes, 0),
    },
    measurements: {
      wallMs,
      completedSourcesPerSecond: completed / (wallMs / 1000),
      baselineRssBytes,
      rssPeakObservedBytes,
      processHighWaterRssBytes: process.resourceUsage().maxRSS * 1024,
      rssSamplingIntervalMs: 10,
      summedExtractionMs: observations.reduce((n, o) => n + o.extractionMs, 0),
      summedAnalysisMs: observations.reduce((n, o) => n + o.analysisMs, 0),
    },
    reviewBoundary: 'human_review_required' as const,
    observations,
  };
}
