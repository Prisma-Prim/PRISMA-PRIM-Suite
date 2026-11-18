import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { createServer } from 'vite';
import { request } from '@playwright/test';
import { startPilotPreview } from './audit-pilot-preview.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));

/** Native seed and preview; callers own the already-isolated native API lifecycle. */
export async function createAuditPilotSession({ port = 4173 } = {}) {
  const native = await request.newContext({ timeout: 30_000 });
  let loader;
  let preview;
  try {
    loader = await createServer({
      root: webRoot,
      configFile: false,
      logLevel: 'error',
      server: { middlewareMode: true },
      appType: 'custom',
    });
    const fixture = await loader.ssrLoadModule('/e2e/audit-pilot.fixture.ts');
    const specimen = await fixture.preparePilotDossier(
      native,
      `Pilot-${randomUUID().slice(0, 8)}`,
    );
    const inputs = JSON.parse(
      await readFile(
        new URL(
          '../../../docs/qualification/local-audit-pilot/source-manifest.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    preview = await startPilotPreview({
      port,
      apiOrigin: 'http://127.0.0.1:4174',
      webRoot,
      specimen,
      inputs,
      certificate: (role) => fixture.pilotCertificate(native, specimen, role),
    });
    await loader.close();
    loader = undefined;
    let closing;
    return {
      ...preview,
      specimen,
      close() {
        closing ??= (async () => {
          try {
            await preview.close();
          } finally {
            await native.dispose();
          }
        })();
        return closing;
      },
    };
  } catch (error) {
    await Promise.allSettled([
      preview?.close(),
      loader?.close(),
      native.dispose(),
    ]);
    throw error;
  }
}
