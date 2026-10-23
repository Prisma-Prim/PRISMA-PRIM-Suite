import type { Page, Response, Route } from '@playwright/test';
import type { ClientRegistrationDiagnostics } from './client-registration-diagnostics';

export type ClientReceipt = { status: number; id: string };

type HeldRegistration = {
  readonly committed: Promise<ClientReceipt>;
  readonly release: () => void;
};

/**
 * Lets the next Client registration reach the real API and PostgreSQL, then
 * holds its response until released so an Access refresh can land first.
 */
export async function holdNextClientRegistration(
  page: Page,
  delivery: 'deliver' | 'lose',
  diagnostics: ClientRegistrationDiagnostics,
): Promise<HeldRegistration> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let recordCommit: (receipt: ClientReceipt) => void = () => undefined;
  let failCommit: (error: unknown) => void = () => undefined;
  const committed = new Promise<ClientReceipt>((resolve, reject) => {
    recordCommit = resolve;
    failCommit = reject;
  });
  // A route can fail while the caller is still awaiting its click. Preserve
  // that rejection for the consumer without creating an unhandled rejection.
  void committed.catch(() => undefined);
  const clientCollection = (url: URL) => url.pathname === '/api/clients';
  let held = false;
  const handler = async (route: Route) => {
    if (held || route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    held = true;
    diagnostics.record({ delivery, phase: 'held' });
    try {
      const response = await route.fetch();
      const committedReceipt = await receipt(response);
      diagnostics.record({
        delivery,
        phase: 'committed',
        status: committedReceipt.status,
        clientId: committedReceipt.id,
      });
      recordCommit(committedReceipt);
      await released;
      if (delivery === 'lose') {
        await route.abort('connectionfailed');
        diagnostics.record({ delivery, phase: 'lost' });
      } else {
        await route.fulfill({ response });
        diagnostics.record({ delivery, phase: 'delivered' });
      }
    } catch (error: unknown) {
      diagnostics.record({ delivery, phase: 'handler-failed' });
      failCommit(error);
      throw error;
    }
  };
  // Keep this one-use route for the isolated page's lifetime so releasing the
  // reply does not change interception while success-triggered reads begin.
  await page.route(clientCollection, handler);
  async function waitForCommit(): Promise<ClientReceipt> {
    const closedMessage = `Page closed while waiting for held POST /api/clients (${delivery}).`;
    if (page.isClosed()) throw new Error(closedMessage);
    let rejectWait: (error: Error) => void = () => undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      rejectWait = reject;
    });
    const onClose = () => {
      diagnostics.record({ delivery, phase: 'page-closed' });
      rejectWait(new Error(closedMessage));
    };
    const timer = setTimeout(() => {
      diagnostics.record({
        delivery,
        phase: held ? 'receipt-not-confirmed' : 'request-not-held',
      });
      rejectWait(
        new Error(
          `Timed out after 30000ms waiting for ${held ? 'receipt from ' : ''}held POST /api/clients (${delivery}).`,
        ),
      );
    }, 30_000);
    page.once('close', onClose);
    try {
      return await Promise.race([committed, stopped]);
    } finally {
      clearTimeout(timer);
      page.off('close', onClose);
    }
  }
  return {
    get committed() {
      return waitForCommit();
    },
    release: () => {
      diagnostics.record({ delivery, phase: 'released' });
      release();
    },
  };
}

export async function receipt(
  response: Pick<Response, 'status' | 'json'>,
): Promise<ClientReceipt> {
  const value: unknown = await response.json();
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string'
  )
    throw new Error('Expected a Client registration receipt with an id.');
  return { status: response.status(), id: value.id };
}
