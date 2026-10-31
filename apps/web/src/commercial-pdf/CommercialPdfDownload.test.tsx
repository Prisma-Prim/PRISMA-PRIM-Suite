import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  useCommercialPdfDownload,
  CommercialPdfSelection,
} from './CommercialPdfDownload';
import {
  pdfReply,
  pdfTarget,
  illustrativePdfTarget,
} from './commercial-pdf.test-fixture';
import type { CommercialPdfTarget } from './commercial-pdf-response';
import { modelOfferActor } from '../offer/model-offer.fixture';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from '../localization/interface-locale';
const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'pdf-reader-965',
});
function Languages() {
  const locale = useInterfaceLocale();
  return (
    <>
      {(
        ['ro', 'ru', 'fr', 'en'] satisfies Parameters<
          typeof locale.changeLocale
        >[0][]
      ).map((language) => (
        <button key={language} onClick={() => locale.changeLocale(language)}>
          {language}
        </button>
      ))}
    </>
  );
}
function Host({
  actor = modelOfferActor,
  versionId = pdfTarget.versionId,
  target = pdfTarget,
}: {
  actor?: typeof modelOfferActor;
  versionId?: string;
  target?: CommercialPdfTarget;
}) {
  const pdf = useCommercialPdfDownload({
    actor,
    identity,
    opportunityId: pdfTarget.opportunityId,
    kind: 'offer',
    navigation: undefined,
    onCompanyContextRejected: () => undefined,
  });
  return (
    <>
      {pdf.controls}
      {pdf.callbacks.action}
      <button onClick={pdf.callbacks.navigate}>Navigate exact Version</button>
      <CommercialPdfSelection
        onSelection={pdf.callbacks.select}
        selection={
          target.kind === 'contract'
            ? { ...target, versionId, requiresClientRead: false }
            : { ...target, versionId }
        }
      />
      <fieldset disabled>
        <input
          aria-label="Independent uncertain command draft"
          defaultValue="literal draft retained"
        />
        <p>Independent mutation uncertain — same body and retry key</p>
      </fieldset>
    </>
  );
}
function panel(
  actor = modelOfferActor,
  versionId = pdfTarget.versionId,
  target = pdfTarget,
) {
  return (
    <InterfaceLocaleProvider>
      <Languages />
      <Host actor={actor} versionId={versionId} target={target} />
    </InterfaceLocaleProvider>
  );
}
beforeEach(() => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe('Independent exact PDF read lifetime', () => {
  it.each(['model', 'illustrative'])(
    'preserves independent uncertain/draft state, prevents duplicates, keeps one %s target across all locales and permits explicit same-target retry',
    async (kind) => {
      let release: ((response: Response) => void) | undefined;
      const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      render(
        panel(
          modelOfferActor,
          pdfTarget.versionId,
          kind === 'illustrative' ? illustrativePdfTarget : pdfTarget,
        ),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Download non-official PDF' }),
      );
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      expect(
        screen.getByRole('button', { name: 'Download non-official PDF' }),
      ).toBeDisabled();
      for (const language of ['ro', 'ru', 'fr', 'en'])
        fireEvent.click(screen.getByRole('button', { name: language }));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(
        screen.getByLabelText('Independent uncertain command draft'),
      ).toHaveValue('literal draft retained');
      await act(async () => {
        release?.(new Response('{}', { status: 503 }));
      });
      fireEvent.click(
        await screen.findByRole('button', { name: 'Retry non-official PDF' }),
      );
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      expect(fetch.mock.calls[1][0]).toBe(fetch.mock.calls[0][0]);
    },
  );
  it.each(['target', 'scope', 'read'])(
    'suppresses a held old binary response after %s retirement and cleans owned Blob URLs',
    async (change) => {
      let release: ((response: Response) => void) | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      const mounted = render(panel());
      fireEvent.click(
        screen.getByRole('button', { name: 'Download non-official PDF' }),
      );
      await waitFor(() => expect(release).toBeDefined());
      const company = modelOfferActor.activeCompany;
      if (!company) throw new Error('Expected synthetic Company.');
      if (change === 'target')
        fireEvent.click(
          screen.getByRole('button', { name: 'Navigate exact Version' }),
        );
      mounted.rerender(
        change === 'target'
          ? panel(modelOfferActor, 'next-version')
          : panel({
              ...modelOfferActor,
              activeCompany: {
                ...company,
                ...(change === 'scope'
                  ? { id: 'other-company' }
                  : { offerPermissions: [] }),
              },
            }),
      );
      await act(async () => {
        release?.(
          await pdfReply({
            ...pdfTarget,
            companyId: modelOfferActor.activeCompany?.id ?? '',
            workspaceId: modelOfferActor.workspaceId,
          }),
        );
      });
      expect(click).not.toHaveBeenCalled();
    },
  );
  it('keeps the held exact target when an unrelated owner remount displays another head', async () => {
    let release: ((response: Response) => void) | undefined;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:held-965');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const mounted = render(panel());
    fireEvent.click(
      screen.getByRole('button', { name: 'Download non-official PDF' }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    mounted.rerender(
      panel(modelOfferActor, 'new-head-after-unrelated-remount'),
    );
    await act(async () => {
      release?.(
        await pdfReply({
          ...pdfTarget,
          companyId: modelOfferActor.activeCompany?.id ?? '',
          workspaceId: modelOfferActor.workspaceId,
        }),
      );
    });
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not retire an independently authorized pending read on unrelated model/economic grant loss', async () => {
    let release: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const urls = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:965'),
      revoke = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => undefined);
    const mounted = render(panel());
    fireEvent.click(
      screen.getByRole('button', { name: 'Download non-official PDF' }),
    );
    await waitFor(() => expect(release).toBeDefined());
    const company = modelOfferActor.activeCompany;
    if (!company) throw new Error('Expected synthetic Company.');
    mounted.rerender(
      panel({
        ...modelOfferActor,
        activeCompany: {
          ...company,
          profitabilityContributorPermissionAssignmentId: undefined,
          profitabilityContributorPermissions: [],
        },
      }),
    );
    await act(async () => {
      release?.(
        await pdfReply({
          ...pdfTarget,
          companyId: company.id,
          workspaceId: modelOfferActor.workspaceId,
        }),
      );
    });
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(urls).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:965');
  });
});
