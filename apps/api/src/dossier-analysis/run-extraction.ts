import { performance } from 'node:perf_hooks';
import {
  DOCUMENT_TEXT_PARSER_VERSION,
  extractDocumentText,
  type TextExtraction,
} from '../document-text-extraction/index.js';

type Input = { bytes: Uint8Array; kind: 'pdf' | 'docx' };
type Extract = (
  input: Input & { timeoutMs: number },
) => Promise<TextExtraction>;
const failed = (): TextExtraction => ({
  state: 'failed',
  parserVersion: DOCUMENT_TEXT_PARSER_VERSION,
  passages: [],
  issues: [{ code: 'time_limit', locator: null }],
  unitsTotal: 0,
  unitsReadable: 0,
});
/** A single monotonic deadline covers the entire synchronous run, including queued sources. */
export async function extractRunSources(
  inputs: readonly Input[],
  options: { now?: () => number; extract?: Extract } = {},
): Promise<TextExtraction[]> {
  const now = options.now ?? (() => performance.now()),
    extract = options.extract ?? extractDocumentText;
  const deadline = now() + 40_000,
    results: TextExtraction[] = [];
  for (const input of inputs) {
    const timeoutMs = Math.min(20_000, Math.floor(deadline - now()));
    results.push(
      timeoutMs < 1 ? failed() : await extract({ ...input, timeoutMs }),
    );
  }
  return results;
}
