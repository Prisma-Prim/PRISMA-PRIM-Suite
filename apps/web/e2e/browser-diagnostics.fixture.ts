import { test as base, type Page } from '@playwright/test';
import process from 'node:process';
import { writeFile } from 'node:fs/promises';

const affectedCases =
  /pauses the fiber|recovers from context loss|stops frames while hidden|keeps modifier/;
const tag = '[DEBUG-228]';

// Temporary #228 observation: remove after the hosted Windows cause is established.
// No request bodies, authentication headers, storage, or user content are collected.
export const test = base.extend<{ browserDiagnostics: undefined }>({
  browserDiagnostics: [
    async ({ context, browser }, use, testInfo) => {
      if (
        process.env.PRISMA_BROWSER_DIAGNOSTICS !== '1' ||
        !affectedCases.test(testInfo.title)
      ) {
        await use(undefined);
        return;
      }
      const started = Date.now();
      const observations: unknown[] = [];
      let nextPageId = 0;
      const record = (event: string, details: unknown) => {
        if (observations.length >= 300) return;
        const entry = { elapsedMs: Date.now() - started, event, details };
        observations.push(entry);
        console.log(tag, JSON.stringify(entry));
      };
      const technicalUrl = (value: string) => {
        const url = new URL(value);
        return url.origin + url.pathname + url.hash;
      };
      const observe = (page: Page) => {
        const pageId = ++nextPageId;
        record('page-created', { pageId, url: technicalUrl(page.url()) });
        page.on('pageerror', (error) =>
          record('page-error', { pageId, message: error.message }),
        );
        page.on('crash', () => record('page-crash', { pageId }));
        page.on('close', () => record('page-closed', { pageId }));
        page.on('console', (message) => {
          if (message.type() === 'error' || message.text().startsWith(tag)) {
            record('console', {
              pageId,
              type: message.type(),
              message: message.text(),
            });
          }
        });
        page.on('requestfailed', (request) =>
          record('request-failed', {
            pageId,
            url: technicalUrl(request.url()),
            failure: request.failure(),
          }),
        );
        page.on('request', (request) => {
          if (new URL(request.url()).pathname.startsWith('/api/')) {
            record('api-request', { pageId, url: technicalUrl(request.url()) });
          }
        });
        page.on('response', (response) => {
          if (new URL(response.url()).pathname.startsWith('/api/')) {
            record('api-response', {
              pageId,
              url: technicalUrl(response.url()),
              status: response.status(),
            });
          }
        });
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame())
            record('navigation', { pageId, url: technicalUrl(frame.url()) });
        });
      };
      context.on('page', observe);
      context.pages().forEach(observe);
      const cdp = await browser.newBrowserCDPSession();
      const info = await cdp.send('SystemInfo.getInfo');
      record('browser', {
        version: browser.version(),
        gpu: info.gpu,
        project: testInfo.project.name,
      });
      let sampling = false;
      const sampleProcesses = async () => {
        if (sampling) return;
        sampling = true;
        try {
          const info = await cdp.send('SystemInfo.getProcessInfo');
          record('browser-process-cpu', info.processInfo);
        } catch (error) {
          record(
            'process-sample-error',
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          sampling = false;
        }
      };
      await sampleProcesses();
      const processTimer = setInterval(() => void sampleProcesses(), 2000);
      await context.addInitScript(() => {
        const tag = '[DEBUG-228]';
        let samples = 0;
        let previousTime = performance.now();
        let observedHost: Element | null = null;
        let intersecting: boolean | null = null;
        const intersection = new IntersectionObserver((entries) => {
          intersecting = entries.some((entry) => entry.isIntersecting);
        });
        const snapshot = (event: string) => {
          if (samples++ >= 48) return;
          const now = performance.now();
          const host = document.querySelector('.fiber-canvas-host');
          if (host !== observedHost) {
            intersection.disconnect();
            observedHost = host;
            intersecting = null;
            if (host) intersection.observe(host);
          }
          const canvas = host?.querySelector('canvas');
          console.log(
            tag,
            JSON.stringify({
              event,
              timeMs: now,
              gapMs: now - previousTime,
              path: location.pathname,
              hash: location.hash,
              ready: document.readyState,
              visibility: document.visibilityState,
              hidden: document.hidden,
              focused: document.hasFocus(),
              rootChildren: document.querySelector('#root')?.childElementCount,
              pageHeadingPresent: Boolean(
                document.querySelector('#prisme-page-title'),
              ),
              companyFormPresent: Boolean(
                document.querySelector('input[id="company-display-name"]'),
              ),
              motion: document
                .querySelector('.fiber-motion')
                ?.getAttribute('data-motion-state'),
              control: document
                .querySelector('.fiber-motion-control')
                ?.getAttribute('aria-label'),
              intersecting,
              phase: canvas?.dataset.phase,
              frames: canvas?.dataset.frames,
              raster: canvas ? [canvas.width, canvas.height] : null,
            }),
          );
          previousTime = now;
        };
        for (const event of [
          'DOMContentLoaded',
          'visibilitychange',
          'webglcontextlost',
          'webglcontextrestored',
        ]) {
          document.addEventListener(event, () => snapshot(event), true);
        }
        window.addEventListener('hashchange', () => snapshot('hashchange'));
        const timer = setInterval(() => {
          snapshot('heartbeat');
          if (samples >= 48) {
            clearInterval(timer);
            intersection.disconnect();
          }
        }, 1000);
        snapshot('init');
      });
      try {
        await use(undefined);
      } finally {
        clearInterval(processTimer);
        context.off('page', observe);
        await cdp
          .detach()
          .catch((error) => record('detach-error', String(error)));
        const path = testInfo.outputPath('browser-diagnostics.json');
        await writeFile(
          path,
          JSON.stringify(
            {
              test: testInfo.title,
              project: testInfo.project.name,
              status: testInfo.status,
              observations,
            },
            null,
            2,
          ),
        );
        await testInfo.attach('browser-diagnostics', {
          path,
          contentType: 'application/json',
        });
      }
    },
    { auto: true },
  ],
});
