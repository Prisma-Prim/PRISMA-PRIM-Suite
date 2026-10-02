import { writeFile } from 'node:fs/promises';
import { test as base, type Request, type Response } from '@playwright/test';

type RegistrationEvent =
  | ({ delivery: 'deliver' | 'lose' } & (
      | {
          phase: 'committed';
          status: number;
          clientId: string;
        }
      | {
          phase:
            | 'held'
            | 'released'
            | 'handler-failed'
            | 'unroute-start'
            | 'unroute-finished';
        }
    ))
  | { delivery: 'deliver'; phase: 'delivered' }
  | { delivery: 'lose'; phase: 'lost' };

type EvidenceEvent =
  | {
      kind: 'request';
      requestId: number;
      method: 'GET' | 'POST';
      companyContextId: string | null;
    }
  | { kind: 'response'; requestId: number; status: number }
  | { kind: 'finished' | 'failed' | 'list-unreadable'; requestId: number }
  | { kind: 'list'; requestId: number; clientIds: string[] }
  | ({ kind: 'registration' } & RegistrationEvent);

export type ClientRegistrationDiagnostics = {
  record: (event: RegistrationEvent) => void;
};

// This fixture is used only by the synthetic acceptance harness. Never record
// whole URLs, headers, bodies or error messages: they may contain private data.
export const test = base.extend<{
  clientDiagnostics: ClientRegistrationDiagnostics;
}>({
  clientDiagnostics: [
    async ({ page }, use, testInfo) => {
      const started = performance.now();
      const timeline: (EvidenceEvent & { elapsedMs: number })[] = [];
      const requests = new Map<Request, number>();
      const pendingBodies: Promise<void>[] = [];
      function record(event: EvidenceEvent) {
        timeline.push({ ...event, elapsedMs: performance.now() - started });
      }
      function onRequest(request: Request) {
        const method = request.method();
        if (
          new URL(request.url()).pathname !== '/api/clients' ||
          (method !== 'GET' && method !== 'POST')
        )
          return;
        const requestId = requests.size + 1;
        requests.set(request, requestId);
        record({
          kind: 'request',
          requestId,
          method,
          companyContextId: request.headers()['x-company-context-id'] ?? null,
        });
      }
      function onResponse(response: Response) {
        const requestId = requests.get(response.request());
        if (requestId !== undefined)
          record({ kind: 'response', requestId, status: response.status() });
      }
      async function recordList(request: Request, requestId: number) {
        try {
          const response = await request.response();
          if (request.method() !== 'GET' || response?.status() !== 200) return;
          const value: unknown = await response.json();
          const clientIds: string[] = [];
          if (!Array.isArray(value)) {
            record({ kind: 'list-unreadable', requestId });
            return;
          }
          const clients: unknown[] = value;
          for (const client of clients) {
            if (
              typeof client !== 'object' ||
              client === null ||
              !('id' in client) ||
              typeof client.id !== 'string'
            ) {
              record({ kind: 'list-unreadable', requestId });
              return;
            }
            clientIds.push(client.id);
          }
          record({ kind: 'list', requestId, clientIds });
        } catch {
          record({ kind: 'list-unreadable', requestId });
        }
      }
      function onFinished(request: Request) {
        const requestId = requests.get(request);
        if (requestId === undefined) return;
        record({ kind: 'finished', requestId });
        // The body has finished; observing it does not gate the journey itself.
        pendingBodies.push(recordList(request, requestId));
      }
      function onFailed(request: Request) {
        const requestId = requests.get(request);
        if (requestId !== undefined) record({ kind: 'failed', requestId });
      }
      page.on('request', onRequest);
      page.on('response', onResponse);
      page.on('requestfinished', onFinished);
      page.on('requestfailed', onFailed);
      try {
        await use({
          record: (event) => record({ kind: 'registration', ...event }),
        });
      } finally {
        page.off('request', onRequest);
        page.off('response', onResponse);
        page.off('requestfinished', onFinished);
        page.off('requestfailed', onFailed);
        await Promise.all(pendingBodies);
        if (testInfo.status !== testInfo.expectedStatus) {
          const path = testInfo.outputPath('client-registration-timeline.json');
          await writeFile(path, JSON.stringify(timeline, null, 2));
          await testInfo.attach('Client registration timeline', {
            path,
            contentType: 'application/json',
          });
        }
      }
    },
    { auto: true },
  ],
});
