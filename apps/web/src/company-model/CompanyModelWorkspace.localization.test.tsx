import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  interfaceLocales,
} from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { modelKinds } from './company-model-kinds.test-fixture';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem(interfaceLocaleStorageKey);
});

for (const kind of modelKinds)
  describe(`${kind.name} model workspace localization`, () => {
    const { Workspace, root, model, attribution, content } = kind;
    const approved = {
      ...model.head,
      decision: {
        id: '70000000-0000-4000-8000-000000000901',
        outcome: 'APPROVE',
        basis: 'Reviewed original content',
        ...attribution,
      },
    };
    const current = {
      ...model,
      revision: 2,
      head: approved,
      activeVersion: {
        id: approved.id,
        versionNumber: 1,
        sourceKind: 'ILLUSTRATIVE',
        serviceTitle: content.serviceTitle,
      },
    };

    it.each(interfaceLocales)(
      'renders the workspace, history, exact version and form in %s',
      async (locale) => {
        vi.stubGlobal(
          'fetch',
          vi.fn(async (input: RequestInfo | URL) => {
            const path = new URL(input.toString(), window.location.origin)
              .pathname;
            if (path === root) return Response.json({ model: current });
            if (path === `${root}/versions`)
              return Response.json({
                versions: [
                  {
                    id: approved.id,
                    versionNumber: 1,
                    predecessorVersionId: null,
                    sourceKind: 'ILLUSTRATIVE',
                    serviceTitle: content.serviceTitle,
                    ...attribution,
                    decision: {
                      outcome: 'APPROVE',
                      recordedAt: attribution.recordedAt,
                    },
                  },
                ],
                nextCursor: null,
              });
            if (path === `${root}/versions/${approved.id}`)
              return Response.json({
                version: approved,
                currentSelection: { activeVersionId: approved.id },
              });
            throw new Error('Unexpected localization route.');
          }),
        );
        const message = (key: Parameters<typeof kind.message>[1]) =>
          kind.message(locale, key);
        const numbered = (key: Parameters<typeof kind.message>[1]) =>
          formatMessage(message(key), { number: '1' });
        localStorage.setItem(interfaceLocaleStorageKey, locale);
        render(
          <InterfaceLocaleProvider>
            <Workspace
              actor={kind.actor}
              identity={deterministicBrowserIdentity()}
            />
          </InterfaceLocaleProvider>,
        );
        expect(
          await screen.findByRole('heading', { name: message('title') }),
        ).toBeVisible();
        expect(await screen.findByText(numbered('active'))).toBeVisible();
        expect(screen.getByText(message('head'))).toBeVisible();
        expect(screen.getAllByText(message('approved'))[0]).toBeVisible();
        fireEvent.click(
          screen.getByRole('button', { name: message('history') }),
        );
        fireEvent.click(
          await screen.findByRole('button', { name: numbered('openVersion') }),
        );
        expect(await screen.findByText(message('historical'))).toBeVisible();
        fireEvent.click(
          screen.getByRole('button', { name: message('copyVersion') }),
        );
        expect(
          screen.getByRole('button', { name: message('submit') }),
        ).toBeVisible();
        expect(
          screen.getByLabelText(numbered('stageTitle'), { exact: true }),
        ).toBeVisible();
        expect(
          screen.getByRole('group', { name: message('frameworks') }),
        ).toBeVisible();
      },
    );
  });
