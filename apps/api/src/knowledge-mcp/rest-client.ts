import type { KnowledgeMcpConfiguration } from './configuration.js';
import {
  InvalidKnowledgeProtocol,
  readKnowledgeResult,
  type KnowledgeReadRequest,
  type KnowledgeReadResult,
} from './protocol.js';

const MAXIMUM_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

/** This adapter transports reads; NestJS remains the live authority for each call. */
export async function readKnowledgeRest({
  configuration,
  request,
  signal,
}: {
  configuration: KnowledgeMcpConfiguration;
  request: KnowledgeReadRequest;
  signal: AbortSignal;
}): Promise<KnowledgeReadResult> {
  const path =
    request.kind === 'passage'
      ? `/api/knowledge/sources/${encodeURIComponent(request.sourceId)}/passages/${encodeURIComponent(request.locator)}`
      : `/api/knowledge/${request.kind === 'sources' ? 'sources' : 'search'}`;
  const url = new URL(path, configuration.apiOrigin);
  // WHATWG URL normalizes dot segments. A locator must never select another API.
  if (url.origin !== configuration.apiOrigin || url.pathname !== path)
    throw new InvalidKnowledgeProtocol();
  url.searchParams.set('mode', request.mode);
  if (request.mode === 'historical')
    url.searchParams.set('documentVersionId', request.documentVersionId);
  if (request.kind !== 'passage') {
    url.searchParams.set('limit', String(request.limit));
    if (request.cursor !== undefined)
      url.searchParams.set('cursor', request.cursor);
  }
  if (request.kind === 'search') url.searchParams.set('query', request.query);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${configuration.bearerToken}`,
      'x-workspace-context-id': configuration.workspaceId,
      'x-company-context-id': configuration.companyId,
      accept: 'application/json',
    },
    redirect: 'error',
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  });
  if (
    !response.ok ||
    !response.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    await response.body?.cancel();
    throw new InvalidKnowledgeProtocol();
  }
  const reader = response.body?.getReader();
  if (!reader) throw new InvalidKnowledgeProtocol();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAXIMUM_RESPONSE_BYTES) {
        await reader.cancel();
        throw new InvalidKnowledgeProtocol();
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks, size);
  const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(content);
  return readKnowledgeResult(value, request);
}
