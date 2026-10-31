import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { useCommercialPdfDownload } from '../commercial-pdf/CommercialPdfDownload';
import { pdfReply } from '../commercial-pdf/commercial-pdf.test-fixture';
import { pendingOffer } from '../test/offer-quality-decision-fixture';
import { OfferPanel } from './OfferPanel';
import { modelOfferActor } from './model-offer.fixture';

const identity = deterministicBrowserIdentity();
const ignore = () => undefined;
const company = modelOfferActor.activeCompany;
if (!company) throw new Error('Expected synthetic Company.');
const actor = {
  ...modelOfferActor,
  activeCompany: {
    ...company,
    offerPermissions: ['commercial.offer.read', 'commercial.offer.prepare'],
  },
} satisfies ActorContext;
function Host({ versionId = 'version-one' }: { versionId?: string }) {
  const pdf = useCommercialPdfDownload({
    actor,
    identity,
    opportunityId: 'opportunity-one',
    kind: 'offer',
    navigation: versionId === 'version-one' ? 1 : 2,
    onCompanyContextRejected: ignore,
  });
  return (
    <>
      {pdf.controls}
      <OfferPanel
        actor={actor}
        identity={identity}
        opportunityId="opportunity-one"
        requestedVersionId={versionId}
        onCompanyContextRejected={ignore}
        pdf={pdf.callbacks}
      />
    </>
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
it.each([1, 2] satisfies (1 | 2)[])(
  'offers only the actually selected illustrative Template v%s PDF and preserves exact HTML consultation',
  async (bindingVersion) => {
    const offer = pendingOffer({ bindingVersion, latestRun: false });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify({ offer })));
    render(
      <InterfaceLocaleProvider>
        <Host />
      </InterfaceLocaleProvider>,
    );
    expect(
      await screen.findByTitle('Illustrative Offer representation'),
    ).toHaveAttribute('srcdoc', offer.version.representation.html);
    if (bindingVersion === 1) {
      expect(
        screen.getByRole('button', { name: 'Download exact English HTML' }),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Download non-official PDF' }),
      ).toBeVisible();
    } else
      expect(
        screen.queryByRole('button', { name: 'Download non-official PDF' }),
      ).not.toBeInTheDocument();
    expect(
      fetch.mock.calls.every(([path]) => !String(path).includes('/pdf?')),
    ).toBe(true);
  },
);
it('offers the selected immutable English PDF and suppresses a held reply after exact-Version retirement', async () => {
  const offer = pendingOffer({ latestRun: false });
  let release: ((response: Response) => void) | undefined;
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url) => {
      if (String(url).includes('/pdf?'))
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return new Response(JSON.stringify({ offer }));
    });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  const mounted = render(
    <InterfaceLocaleProvider>
      <Host />
    </InterfaceLocaleProvider>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Download non-official PDF' }),
  );
  await waitFor(() => expect(release).toBeDefined());
  expect(String(fetch.mock.calls.at(-1)?.[0])).toContain(
    '/versions/version-one/pdf?sourceHtmlSha256=' +
      offer.version.representation.sha256,
  );
  mounted.rerender(
    <InterfaceLocaleProvider>
      <Host versionId="another-version" />
    </InterfaceLocaleProvider>,
  );
  const company = modelOfferActor.activeCompany;
  if (!company) throw new Error('Expected synthetic Company.');
  await act(async () => {
    release?.(
      await pdfReply({
        kind: 'offer',
        workspaceId: modelOfferActor.workspaceId,
        companyId: company.id,
        opportunityId: 'opportunity-one',
        rootId: offer.id,
        reference: offer.illustrativeReference,
        versionId: offer.version.id,
        versionNumber: 1,
        provenance: 'ILLUSTRATIVE',
        language: 'en',
        createdAt: '2026-09-27T09:00:00.000Z',
        sourceRendererCode: 'OFFER_ILLUSTRATIVE',
        sourceRendererVersion: 1,
        sourceHtmlSha256: offer.version.representation.sha256,
      }),
    );
  });
  expect(click).not.toHaveBeenCalled();
});
it('downloads while an independent illustrative Quality Check is pending/uncertain and preserves its exact retry body/key', async () => {
  const offer = pendingOffer({ latestRun: false });
  const commands: RequestInit[] = [];
  let releaseQuality: ((response: Response) => void) | undefined;
  let releasePdf: ((response: Response) => void) | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).includes('/quality-checks')) {
      if (!init) throw new Error('Expected a Quality Check command.');
      commands.push(init);
      return new Promise<Response>((resolve) => {
        releaseQuality = resolve;
      });
    }
    if (String(url).includes('/pdf?'))
      return new Promise<Response>((resolve) => {
        releasePdf = resolve;
      });
    return new Response(JSON.stringify({ offer }));
  });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:illustrative-1005');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  render(
    <InterfaceLocaleProvider>
      <Host />
    </InterfaceLocaleProvider>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Run Quality Checks' }),
  );
  await waitFor(() => expect(commands).toHaveLength(1));
  fireEvent.click(
    screen.getByRole('button', { name: 'Download non-official PDF' }),
  );
  await waitFor(() => expect(releasePdf).toBeDefined());
  await act(async () => {
    releaseQuality?.(new Response(null, { status: 503 }));
  });
  const retry = await screen.findByRole('button', {
    name: 'Retry the same Quality Checks',
  });
  await act(async () => {
    releasePdf?.(
      await pdfReply({
        kind: 'offer',
        workspaceId: actor.workspaceId,
        companyId: company.id,
        opportunityId: 'opportunity-one',
        rootId: offer.id,
        reference: offer.illustrativeReference,
        versionId: offer.version.id,
        versionNumber: 1,
        provenance: 'ILLUSTRATIVE',
        language: 'en',
        createdAt: '2026-09-27T09:00:00.000Z',
        sourceRendererCode: 'OFFER_ILLUSTRATIVE',
        sourceRendererVersion: 1,
        sourceHtmlSha256: offer.version.representation.sha256,
      }),
    );
  });
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(retry).toBeEnabled();
  fireEvent.click(retry);
  await waitFor(() => expect(commands).toHaveLength(2));
  expect(commands[1].body).toBe(commands[0].body);
  expect(new Headers(commands[1].headers).get('idempotency-key')).toBe(
    new Headers(commands[0].headers).get('idempotency-key'),
  );
});
