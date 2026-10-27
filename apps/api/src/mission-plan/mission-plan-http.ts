import type { IncomingMessage } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** Admit the bounded50-row Unicode source without enlarging unrelated HTTP commands. */
export function configureMissionPlanTransport(app: NestExpressApplication) {
  app.useBodyParser('json', {
    limit: '1mb',
    type(request: IncomingMessage) {
      return (
        request.method === 'POST' &&
        /^\/api\/mission-plans(?:\/[a-zA-Z0-9-]+\/versions)?\/?$/.test(
          (request.url ?? '').split('?')[0] ?? '',
        ) &&
        request.headers['content-type']?.split(';')[0]?.trim() ===
          'application/json'
      );
    },
  });
  // The first parser consumes matching streams; every other route retains Nest's100kb default.
  app.useBodyParser('json', { limit: '100kb' });
}
