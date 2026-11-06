import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';

function isCaseRoute(request: IncomingMessage): boolean {
  return /^\/api\/(?:projects\/[^/]+\/working-evidence-(?:cases|sources)|working-evidence-cases(?:\/|$))/.test(
    (request.url ?? '').split('?')[0] ?? '',
  );
}
/** A bounded parser only for this closed protocol; other commands retain their native bounds. */
export function configureWorkingEvidenceTransport(
  app: NestExpressApplication,
): void {
  app.useBodyParser('json', {
    limit: 262144,
    type: (request: IncomingMessage) =>
      isCaseRoute(request) &&
      request.headers['content-type']?.split(';')[0]?.trim() ===
        'application/json',
    verify: (
      _request: IncomingMessage,
      _response: ServerResponse,
      bytes: Buffer,
    ) => {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    },
  });
  app.use(
    (
      error: unknown,
      request: IncomingMessage,
      response: ServerResponse,
      next: (error?: unknown) => void,
    ) => {
      if (!isCaseRoute(request)) return next(error);
      response.statusCode = 400;
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'private, no-store');
      response.end(JSON.stringify({ code: 'invalid_request' }));
    },
  );
}
