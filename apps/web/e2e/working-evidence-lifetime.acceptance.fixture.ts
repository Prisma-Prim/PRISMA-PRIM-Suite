import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, request, type Page, type TestInfo } from '@playwright/test';
import { selectOption } from './select-option';
const origin = 'http://127.0.0.1:4174';
const person = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected public response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public identity');
  return value;
}
async function proof(page: Page, operation: string, stage?: string) {
  return page.evaluate(
    async ({ operation, stage }) => {
      const controller: unknown = Reflect.get(window, '__workingEvidenceProof');
      if (!controller || typeof controller !== 'object')
        throw new Error('Missing browser observation');
      const callback: unknown = Reflect.get(controller, operation);
      if (typeof callback !== 'function')
        throw new Error('Missing observation operation');
      return callback(stage);
    },
    { operation, stage },
  );
}
/** Real App with native HTTP authorities; only asynchronous scheduling is controlled. */
export async function workingEvidenceLifetimes(page: Page, info: TestInfo) {
  const narrow = info.project.name.endsWith('narrow'),
    suffix = narrow ? 'narrow' : 'desktop',
    companyId = text(process.env.ACCEPTANCE_PRIMARY_COMPANY_ID),
    otherCompanyId = text(process.env.ACCEPTANCE_OTHER_COMPANY_ID),
    membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID),
    headers = { ...person, 'x-company-context-id': companyId };
  const grants: string[] = [];
  const authorityRequest = await request.newContext();
  const heldRoutes = new Set<() => void>();
  let cleanupFailure: AggregateError | undefined;
  async function assignment(
    bundle: string,
    active: boolean,
    selectedCompany = companyId,
  ) {
    const path = `${origin}/api/company-${bundle}-assignments`;
    const response = active
      ? await authorityRequest.post(path, {
          headers: { ...owner, 'idempotency-key': randomUUID() },
          data: {
            companyId: selectedCompany,
            workspaceMembershipId: membershipId,
          },
        })
      : await authorityRequest.delete(
          `${path}/${membershipId}/${selectedCompany}`,
          { headers: { ...owner, 'idempotency-key': randomUUID() } },
        );
    expect(response.status()).toBe(active ? 201 : 200);
  }
  async function post(path: string, data: unknown, expectedStatus = 201) {
    const response = await page.request.post(`${origin}/api${path}`, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data,
    });
    expect(response.status()).toBe(expectedStatus);
    return object(await response.json());
  }
  let projectRestored = true,
    observerStarted = false,
    contextGranted = false;
  try {
    for (const bundle of [
      'working-evidence-case-reader',
      'working-evidence-case-recorder',
      'received-audit-source-access',
      'document-content-reader',
      'document-content-uploader',
      'document-approver',
    ]) {
      await assignment(bundle, true);
      grants.push(bundle);
    }
    await assignment('context', true, otherCompanyId);
    contextGranted = true;
    const client = await post('/clients', {
        displayName: `Fictional lifetime Client ${suffix}`,
      }),
      clientId = text(client.id),
      projectTitle = `Fictional lifetime Project ${suffix}`,
      project = await post('/projects', {
        title: projectTitle,
        clientAccountId: clientId,
      }),
      projectId = text(project.id);
    const source = await post('/documents', {
        type: 'received-audit-source',
        clientId,
        title: `Fictional lifetime original ${suffix}`,
        purpose: 'Fictional lifetime proof only',
      }),
      documentId = text(source.id),
      versionId = text(object(source.version).id);
    const original = await readFile(
      new URL(
        '../../api/test-support/fixtures/questionnaire-demo.pdf',
        import.meta.url,
      ),
    );
    const upload = await page.request.post(
      `${origin}/api/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=fictional-lifetime.pdf`,
      {
        headers: {
          ...headers,
          'idempotency-key': randomUUID(),
          'content-type': 'application/pdf',
        },
        data: original,
      },
    );
    expect(upload.status()).toBe(201);
    await post(
      `/documents/${documentId}/versions/${versionId}/official-designation`,
      { expectedRevision: 2 },
      200,
    );
    const sourcesResponse = await page.request.get(
      `${origin}/api/projects/${projectId}/working-evidence-sources`,
      { headers },
    );
    expect(sourcesResponse.status()).toBe(200);
    const sourcePage = object(await sourcesResponse.json());
    if (!Array.isArray(sourcePage.items) || !sourcePage.items[0])
      throw new Error('Missing exact source');
    const exact = object(sourcePage.items[0]);
    const caseTitle = `Fictional lifetime Case ${suffix}`,
      receipt = await post(`/projects/${projectId}/working-evidence-cases`, {
        format: 'WORKING_EVIDENCE_CASE_COMMAND/1',
        commandId: randomUUID(),
        expectedRevision: 0,
        values: {
          title: caseTitle,
          declaredContext: null,
          process: 'Fictional process',
          statement: 'Fictional old human statement',
          observationNote: null,
          supports: [
            {
              documentId,
              versionId,
              representationId: text(exact.representationId),
              locator: null,
              supportNote: 'Fictional support',
            },
          ],
        },
      }),
      caseId = text(receipt.caseId),
      revisionId = text(receipt.revisionId);
    await page.addInitScript(() => {
      const originalJSON = Response.prototype.json,
        originalArrayBuffer = Blob.prototype.arrayBuffer,
        originalText = Blob.prototype.text,
        originalDigest = crypto.subtle.digest.bind(crypto.subtle),
        create = URL.createObjectURL.bind(URL),
        revoke = URL.revokeObjectURL.bind(URL),
        click = HTMLAnchorElement.prototype.click;
      let stage = '',
        held = false,
        urls = 0,
        clicks = 0,
        revokes = 0,
        release: (() => void) | undefined,
        completion: Promise<unknown> | undefined;
      function pause<T>(value: T) {
        held = true;
        completion = new Promise<void>((resolve) => {
          release = resolve;
        }).then(() => value);
        return completion.then(() => value);
      }
      Object.defineProperty(window, '__prismaLocalDemoTokenGate', {
        configurable: true,
        value: () => {
          if (stage !== 'token') return;
          stage = '';
          return pause(undefined);
        },
      });
      Response.prototype.json = async function () {
        const value: unknown = await originalJSON.call(this);
        if (
          stage === 'parser' &&
          this.url.includes('/working-evidence-cases/')
        ) {
          stage = '';
          return pause(value);
        }
        return value;
      };
      Blob.prototype.arrayBuffer = async function () {
        const bytes = await originalArrayBuffer.call(this);
        if (stage === 'Blob' && this.type === 'application/pdf') {
          stage = '';
          return pause(bytes);
        }
        return bytes;
      };
      Blob.prototype.text = async function () {
        const value = await originalText.call(this);
        if (stage === 'HTML' && this.type.startsWith('text/html')) {
          stage = '';
          return pause(value);
        }
        return value;
      };
      crypto.subtle.digest = (algorithm, data) => {
        if (stage === 'hash') {
          stage = '';
          return originalDigest(algorithm, data).then(pause);
        }
        return originalDigest(algorithm, data);
      };
      URL.createObjectURL = (blob) => {
        urls++;
        return create(blob);
      };
      URL.revokeObjectURL = (url) => {
        revokes++;
        revoke(url);
      };
      HTMLAnchorElement.prototype.click = function () {
        clicks++;
        click.call(this);
      };
      Object.defineProperty(window, '__workingEvidenceProof', {
        configurable: true,
        value: {
          arm: (value: string) => {
            stage = value;
            held = false;
            urls = clicks = revokes = 0;
            release = undefined;
            completion = undefined;
          },
          read: () => ({ held, urls, clicks, revokes }),
          release: async () => {
            release?.();
            await completion;
          },
          restore: () => {
            release?.();
            Response.prototype.json = originalJSON;
            Blob.prototype.arrayBuffer = originalArrayBuffer;
            Blob.prototype.text = originalText;
            crypto.subtle.digest = originalDigest;
            URL.createObjectURL = create;
            URL.revokeObjectURL = revoke;
            HTMLAnchorElement.prototype.click = click;
            Reflect.deleteProperty(window, '__prismaLocalDemoTokenGate');
          },
        },
      });
    });
    await page.route('**/api/**', (route) =>
      route.fallback({ headers: { ...route.request().headers(), ...person } }),
    );
    await page.goto('/');
    observerStarted = true;
    async function choose(company: string) {
      if (narrow)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await selectOption(page.getByLabel('Active Company', { exact: true }), {
        value: company,
      });
      if (narrow)
        await page.getByRole('button', { name: 'Close navigation' }).click();
    }
    async function navigate() {
      if (narrow)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: 'Projects', exact: true })
        .click();
    }
    async function openCase() {
      await navigate();
      const projects = page.locator('.project-workspace');
      await projects
        .getByLabel('Find Projects', { exact: true })
        .fill(projectTitle);
      await projects
        .getByRole('button', {
          name: `${projectTitle} Client: Fictional lifetime Client ${suffix}`,
          exact: true,
        })
        .click();
      await projects
        .getByRole('tab', { name: 'Working Evidence Cases' })
        .click();
      const cases = projects.locator('section.working-evidence');
      await cases.getByRole('button', { name: caseTitle, exact: true }).click();
      await expect(
        cases.getByRole('button', {
          name: 'Open exact original PDF',
          exact: true,
        }),
      ).toBeEnabled();
      return cases;
    }
    await choose(companyId);
    let cases = await openCase();
    let downloads = 0;
    const onDownload = () => {
      downloads++;
    };
    page.on('download', onDownload);
    for (const stage of [
      'token',
      'response',
      'late401',
      'parser',
      'hash',
      'Blob',
      'HTML',
    ] as const) {
      downloads = 0;
      await proof(page, 'arm', stage);
      let releaseResponse: (() => void) | undefined,
        routeFinished: Promise<void> | undefined,
        holdingResponse = true;
      const responsePath = `**/api/working-evidence-cases/${caseId}/revisions/${revisionId}/evidence/*`;
      if (stage === 'response' || stage === 'late401')
        await page.route(responsePath, async (route) => {
          const response = await route.fetch({
            headers: { ...route.request().headers(), ...person },
          });
          expect(response.status()).toBe(200);
          expect(await response.body()).toEqual(original);
          if (!holdingResponse) return route.fulfill({ response });
          holdingResponse = false;
          routeFinished = (async () => {
            await new Promise<void>((resolve) => {
              releaseResponse = resolve;
              heldRoutes.add(resolve);
            });
            try {
              await route.fulfill(
                stage === 'late401'
                  ? { status: 401, contentType: 'application/json', body: '{}' }
                  : { response },
              );
            } catch (error: unknown) {
              if (!route.request().failure()?.errorText.includes('ERR_ABORTED'))
                throw error;
            }
          })();
          await routeFinished;
        });
      if (stage === 'parser')
        await cases
          .getByRole('button', { name: 'Open current revision' })
          .click();
      else
        await cases
          .getByRole('button', {
            name:
              stage === 'HTML'
                ? 'Open frozen statement'
                : 'Open exact original PDF',
            exact: true,
          })
          .click();
      if (stage === 'response' || stage === 'late401')
        await expect.poll(() => typeof releaseResponse).toBe('function');
      else
        await expect
          .poll(() => proof(page, 'read'))
          .toMatchObject({ held: true });
      await choose(otherCompanyId);
      await choose(companyId);
      cases = await openCase();
      releaseResponse?.();
      if (releaseResponse) heldRoutes.delete(releaseResponse);
      await routeFinished;
      await proof(page, 'release');
      expect(await proof(page, 'read')).toMatchObject({ urls: 0, clicks: 0 });
      expect(downloads).toBe(0);
      expect(
        await page.evaluate(() =>
          sessionStorage.getItem('deterministic-auth-state'),
        ),
      ).not.toBe('signed-out');
      await expect(cases.locator('iframe')).toHaveCount(0);
      await expect(
        cases.getByText('Fictional old human statement', { exact: true }),
      ).toBeVisible();
      const downloading = page.waitForEvent('download');
      await cases
        .getByRole('button', { name: 'Open exact original PDF', exact: true })
        .click();
      const downloaded = await downloading,
        path = await downloaded.path();
      if (!path) throw new Error('Missing fresh exact original');
      expect(await readFile(path)).toEqual(original);
      expect(downloads).toBe(1);
      await choose(otherCompanyId);
      expect(await proof(page, 'read')).toMatchObject({
        urls: 1,
        clicks: 1,
        revokes: 1,
      });
      await choose(companyId);
      cases = await openCase();
      if (stage === 'response' || stage === 'late401')
        await page.unroute(responsePath);
      await page.screenshot({
        path: info.outputPath(
          `working-evidence-${suffix}-${stage}-retired.png`,
        ),
        fullPage: true,
      });
    }
    // Protocol401 is injected at the HTTP boundary after native setup. These
    // current owners must settle locally before independent session recovery;
    // the same rejection cannot be delayed into parsing/hash/Blob success stages.
    for (const control of [
      'Open exact original PDF',
      'Open frozen statement',
    ]) {
      const path =
        control === 'Open frozen statement'
          ? `**/api/working-evidence-cases/${caseId}/revisions/${revisionId}/statement`
          : `**/api/working-evidence-cases/${caseId}/revisions/${revisionId}/evidence/*`;
      await page.route(path, (route) =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{}',
        }),
      );
      const button = cases.getByRole('button', { name: control, exact: true });
      await button.click();
      await expect(button).toBeEnabled();
      await expect(cases.getByRole('alert')).toBeVisible();
      await expect(cases.getByText('Revision confirmed saved.')).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() =>
            sessionStorage.getItem('deterministic-auth-state'),
          ),
        )
        .toBe('signed-out');
      await page.evaluate(() =>
        sessionStorage.removeItem('deterministic-auth-state'),
      );
      await page.unroute(path);
    }
    await page.route(
      `**/api/working-evidence-cases/${caseId}/corrections`,
      (route) =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{}',
        }),
    );
    await cases
      .getByRole('button', { name: 'Correct complete revision' })
      .click();
    await cases
      .getByLabel('Correction reason')
      .fill('Fictional rejected session');
    await cases.getByRole('button', { name: 'Save complete revision' }).click();
    await expect(
      cases.getByRole('button', { name: 'Save complete revision' }),
    ).toBeEnabled();
    await expect(cases.getByText('Revision confirmed saved.')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => sessionStorage.getItem('deterministic-auth-state')),
      )
      .toBe('signed-out');
    await page.evaluate(() =>
      sessionStorage.removeItem('deterministic-auth-state'),
    );
    await page.unroute(`**/api/working-evidence-cases/${caseId}/corrections`);
    await cases.getByRole('button', { name: 'Cancel', exact: true }).click();
    // Equal source-capture replacement reaches the current App through a genuine
    // Recorder403 recovery, without switching Company while the hash is held.
    downloads = 0;
    await proof(page, 'arm', 'hash');
    await cases
      .getByRole('button', { name: 'Open exact original PDF', exact: true })
      .click();
    await expect.poll(() => proof(page, 'read')).toMatchObject({ held: true });
    await assignment('received-audit-source-access', false);
    await assignment('received-audit-source-access', true);
    await assignment('working-evidence-case-recorder', false);
    await cases
      .getByRole('button', { name: 'Correct complete revision' })
      .click();
    await cases
      .getByLabel('Correction reason')
      .fill('Fictional refused correction');
    await cases.getByRole('button', { name: 'Save complete revision' }).click();
    await expect(
      cases.getByRole('button', { name: 'Correct complete revision' }),
    ).toHaveCount(0);
    await expect(
      cases.getByText('Fictional old human statement', { exact: true }),
    ).toBeVisible();
    await proof(page, 'release');
    expect(await proof(page, 'read')).toMatchObject({ urls: 0, clicks: 0 });
    expect(downloads).toBe(0);
    await expect(cases.getByText('Revision confirmed saved.')).toHaveCount(0);
    await assignment('working-evidence-case-recorder', true);
    await choose(otherCompanyId);
    await choose(companyId);
    cases = await openCase();
    // Hold a real recovery Actor with a revoked native Project capture. A later
    // valid selection must survive the retired response, including restored rights.
    let releaseRecovery: (() => void) | undefined,
      recoveryFinished: Promise<void> | undefined,
      holding = true;
    await page.route('**/api/access/current-actor', async (route) => {
      const response = await route.fetch({
        headers: { ...route.request().headers(), ...person },
      });
      if (!holding) return route.fulfill({ response });
      holding = false;
      expect(response.status()).toBe(200);
      recoveryFinished = (async () => {
        await new Promise<void>((resolve) => {
          releaseRecovery = resolve;
          heldRoutes.add(resolve);
        });
        try {
          await route.fulfill({ response });
        } catch (error: unknown) {
          if (!route.request().failure()?.errorText.includes('ERR_ABORTED'))
            throw error;
        }
      })();
      await recoveryFinished;
    });
    await assignment('project', false);
    projectRestored = false;
    await cases
      .getByRole('button', { name: 'Open exact original PDF', exact: true })
      .click();
    await expect.poll(() => typeof releaseRecovery).toBe('function');
    await assignment('project', true);
    projectRestored = true;
    await choose(otherCompanyId);
    await choose(companyId);
    cases = await openCase();
    releaseRecovery?.();
    if (releaseRecovery) heldRoutes.delete(releaseRecovery);
    await recoveryFinished;
    await expect(
      cases.getByRole('button', { name: 'Record working statement' }),
    ).toBeVisible();
    await page.unroute('**/api/access/current-actor');
    await page.screenshot({
      path: info.outputPath(`working-evidence-${suffix}-retired-recovery.png`),
      fullPage: true,
    });
    page.off('download', onDownload);
    await proof(page, 'restore');
  } finally {
    const failures: unknown[] = [];
    async function clean(action: () => Promise<unknown>) {
      try {
        await action();
      } catch (error: unknown) {
        failures.push(error);
      }
    }
    for (const release of heldRoutes) release();
    if (!page.isClosed()) {
      if (observerStarted) {
        await clean(() => proof(page, 'release'));
        await clean(() => proof(page, 'restore'));
      }
      await clean(() => page.unroute('**/api/access/current-actor'));
      await clean(() => page.unroute('**/api/**'));
    }
    if (!projectRestored) await clean(() => assignment('project', true));
    for (const bundle of grants.reverse())
      await clean(() => assignment(bundle, false));
    if (contextGranted)
      await clean(() => assignment('context', false, otherCompanyId));
    await clean(() => authorityRequest.dispose());
    if (failures.length) {
      await clean(() =>
        info.attach('working-evidence-owned-cleanup-errors', {
          contentType: 'text/plain',
          body: Buffer.from(failures.map((error) => String(error)).join('\n')),
        }),
      );
      cleanupFailure = new AggregateError(
        failures,
        'Owned fixture cleanup failed',
      );
    }
  }
  if (cleanupFailure) throw cleanupFailure;
}
