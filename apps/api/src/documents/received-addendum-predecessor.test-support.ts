import { expect } from 'vitest';
import type { PostgresRestTestHarness } from '../database/postgres-rest-test-harness.js';
import {
  fixtureHash,
  fixtureHeaders,
  fixtureObject,
  fixtureObjects,
  fixtureString,
} from './external-invoice-migration.test-support.js';
/** Replays only genuinely captured old-runtime identities, receipts, source reads and PDF bytes. */
export async function replayReceivedAddendumPredecessorSources(
  context: Record<string, unknown>,
  app: PostgresRestTestHarness,
) {
  async function call(
    path: string,
    captured: Record<string, unknown>,
    method = 'GET',
  ) {
    const payload =
      captured.payload === undefined
        ? undefined
        : fixtureObject(captured.payload);
    return fetch(app.origin + '/api' + path, {
      method,
      headers: {
        ...fixtureHeaders(captured.identity ?? context.identity),
        'x-workspace-context-id': fixtureString(context.workspaceId),
        ...(captured.companyId === null
          ? {}
          : {
              'x-company-context-id': fixtureString(
                captured.companyId ?? context.companyId,
              ),
            }),
        'idempotency-key':
          captured.key === undefined
            ? 'actual-a917-read'
            : fixtureString(captured.key),
        ...(captured.requestHeaders === undefined
          ? {}
          : fixtureHeaders(captured.requestHeaders)),
      },
      ...(payload
        ? {
            body:
              payload.kind === 'bytes'
                ? new Uint8Array(
                    Buffer.from(fixtureString(payload.base64), 'base64'),
                  )
                : JSON.stringify(payload.value),
          }
        : {}),
    });
  }
  for (const captured of fixtureObjects(context.sourceCommands)) {
    const path = fixtureString(captured.path),
      response = await call(path, captured, fixtureString(captured.method));
    expect(response.status, path).toBe(captured.initialStatus);
    expect(await response.json(), path).toEqual(captured.replayResponse);
  }
  for (const captured of fixtureObjects(context.sourceReads)) {
    const path = fixtureString(captured.path),
      response = await call(path, captured);
    expect(response.status, path).toBe(200);
    expect(await response.json(), path).toEqual(captured.response);
  }
  for (const captured of fixtureObjects(context.sourceBinaries)) {
    const response = await call(fixtureString(captured.path), captured);
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBe(captured.byteLength);
    expect(fixtureHash(bytes)).toBe(captured.sha256);
    for (const header of fixtureObjects(captured.headers))
      expect(response.headers.get(fixtureString(header.name))).toBe(
        header.value,
      );
  }
}
