import * as fc from 'fast-check';
import { randomUUID } from 'node:crypto';
import type { Route } from '@playwright/test';
import type { InterfaceLocale } from '../src/localization/interface-locale';
import {
  certificationMessages,
  type CertificationMessageKey,
} from '../src/certification/certification.copy';
import { formatMessage, resolveMessage } from '../src/localization/messages';
import type {
  BrowserAction,
  BrowserSequenceAdapter,
} from './browser-sequences.fixture';
import {
  certificationMembers,
  prepareCertificationJourney,
  record,
  type Identity,
} from './certification-journey.acceptance.fixture';
import { removeRoute } from './route-removal';
import { selectOption } from './select-option';
import { expect, expectApiFailure } from './ui-chaos.fixture';

type Variant = 'a' | 'b';
type Sent = { key: string | undefined; body: string | null };
type Phase =
  | { kind: 'ready' }
  | { kind: 'draft'; basis: string }
  | { kind: 'uncertain'; basis: string; sent: Sent };
const variants = fc.constantFrom<Variant>('a', 'b');
const apiPattern = '**/api/**';

export const certificationSequenceAdapter: BrowserSequenceAdapter<
  Variant,
  Variant
> = {
  caseId: 'certification-recommendation',
  initial: variants,
  values: variants,
  async open({ page, info, trial, initial }) {
    const narrow = info.project.name.endsWith('narrow');
    const source = await prepareCertificationJourney(
      page.request,
      `sequence-${trial}-${randomUUID().slice(0, 8)}`,
      { stopAfter: 'recommendation' },
    );
    const { manager, auditor, reader } = certificationMembers;
    const recommendationPath = `/api${source.base}/recommendation`;
    const pattern = `**${recommendationPath}`;
    const starting = await source.read(manager, source.base);
    if (typeof starting.revision !== 'number')
      throw new Error('Missing native Case version.');
    let revision = starting.revision;
    let recorded: { id: string; version: number; basis: string } | null = null;
    let editCount = 0;
    let phase: Phase = { kind: 'ready' };
    let member: Identity = auditor;

    const message = (
      key: CertificationMessageKey,
      locale: InterfaceLocale = 'en',
    ) => resolveMessage(certificationMessages, locale, key);
    const article = () =>
      page.getByRole('article', {
        name: formatMessage(message('caseHeading'), {
          reference: source.orderReference,
        }),
        exact: true,
      });
    const recommendation = () =>
      article().getByRole('region', {
        name: message('recommendationTitle'),
        exact: true,
      });
    const basisField = (locale: InterfaceLocale = 'en') =>
      page.getByLabel(message('recommendationBasis', locale), { exact: true });
    const submit = () =>
      recommendation().getByRole('button', {
        name: message('recommendationSubmit'),
        exact: true,
      });
    const retry = () =>
      recommendation().getByRole('button', {
        name: message('retry'),
        exact: true,
      });

    const credentials = (route: Route) =>
      route.fallback({
        headers: { ...route.request().headers(), ...member },
      });
    await page.route(apiPattern, credentials);
    async function openMember(next: Identity) {
      member = next;
      await page.goto('/');
      if (narrow)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await selectOption(
        page.getByRole('combobox', { name: 'Active Company', exact: true }),
        source.companyId,
      );
      if (narrow) {
        await page.getByRole('button', { name: 'Close navigation' }).click();
        await page.getByRole('button', { name: 'Open navigation' }).click();
      }
      await page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: 'Projects', exact: true })
        .click();
      const projects = page.locator('.project-workspace');
      await projects
        .getByRole('searchbox', { name: 'Find Projects' })
        .fill(source.projectTitle);
      await projects
        .getByRole('list', { name: 'Projects', exact: true })
        .getByRole('button', {
          name: `${source.projectTitle} Client: ${source.clientName}`,
          exact: true,
        })
        .click();
      await projects
        .getByRole('tab', { name: message('title'), exact: true })
        .click();
      await page
        .getByRole('tabpanel', { name: message('title'), exact: true })
        .getByRole('button', { name: source.orderReference, exact: true })
        .click();
      await expect(article()).toBeVisible();
    }
    async function inspectReader() {
      await openMember(reader);
      await expect(recommendation().getByRole('form')).toHaveCount(0);
      await expect(
        recommendation().getByRole('button', {
          name: message('correctRecommendation'),
          exact: true,
        }),
      ).toHaveCount(0);
      if (recorded)
        await expect(recommendation()).toContainText(recorded.basis);
      await openMember(auditor);
    }
    try {
      if (initial === 'b') await inspectReader();
      else await openMember(auditor);
    } catch (error) {
      await removeRoute(page, apiPattern, credentials);
      throw error;
    }

    async function edit(variant: Variant) {
      if (phase.kind === 'ready' && recorded)
        await recommendation()
          .getByRole('button', {
            name: message('correctRecommendation'),
            exact: true,
          })
          .click();
      await recommendation()
        .getByRole('radio', {
          name: message('recommendationGrant'),
          exact: true,
        })
        .check();
      const basis = `Fictional reviewed findings ${++editCount} ${variant}\n<literal evidence>`;
      await basisField().fill(basis);
      if (recorded)
        await recommendation()
          .getByLabel(message('correctionReason'), { exact: true })
          .fill('Fictional reviewed amendment to the recommendation.');
      phase = { kind: 'draft', basis };
    }
    async function confirm(lost: boolean) {
      if (phase.kind !== 'draft')
        throw new Error('Missing reviewed recommendation draft.');
      const { basis } = phase;
      const requests: Sent[] = [];
      const observe = async (route: Route) => {
        const request = route.request();
        if (request.method() !== 'POST') return route.fallback();
        requests.push({
          key: request.headers()['idempotency-key'],
          body: request.postData(),
        });
        if (!lost) return route.fallback();
        const result = await route.fetch({
          headers: { ...request.headers(), ...auditor },
        });
        expect(result.status()).toBe(201);
        expectApiFailure({
          page,
          request,
          reason:
            'The native Certification recommendation committed and its acknowledgement was deliberately lost.',
        });
        return route.abort('connectionfailed');
      };
      await page.route(pattern, observe);
      try {
        await submit().focus();
        await page.keyboard.press('Enter');
        if (lost) await expect(retry()).toBeVisible();
        else
          await expect(
            page.getByText(message('saveConfirmed'), { exact: true }),
          ).toBeVisible();
        const sent = requests[0];
        if (!sent?.key || !sent.body)
          throw new Error('Missing native recommendation key or body.');
        expect(requests).toHaveLength(1);
        expect(record(JSON.parse(sent.body))).toMatchObject({
          expectedRevision: revision,
          basis,
        });
        revision++;
        const version = (recorded?.version ?? 0) + 1;
        const current = record(
          (await source.read(manager, source.base)).recommendation,
        );
        expect(current).toMatchObject({ version, caseRevision: revision });
        if (typeof current.id !== 'string' || !current.id)
          throw new Error('Missing native recommendation version identity.');
        expect(current.id).not.toBe(recorded?.id);
        recorded = { id: current.id, version, basis };
        phase = lost ? { kind: 'uncertain', basis, sent } : { kind: 'ready' };
      } finally {
        await removeRoute(page, pattern, observe);
      }
    }
    async function retryExact() {
      if (phase.kind !== 'uncertain')
        throw new Error('Missing frozen recommendation command.');
      const writes: Sent[] = [];
      const observe = (route: Route) => {
        const request = route.request();
        if (request.method() === 'POST')
          writes.push({
            key: request.headers()['idempotency-key'],
            body: request.postData(),
          });
        return route.fallback();
      };
      await page.route(pattern, observe);
      try {
        await retry().click();
        await expect(
          page.getByText(message('saveConfirmed'), { exact: true }),
        ).toBeVisible();
        expect(writes).toEqual([phase.sent]);
        phase = { kind: 'ready' };
      } finally {
        await removeRoute(page, pattern, observe);
      }
    }
    async function preserveDraftAcrossLocale() {
      if (phase.kind !== 'draft') throw new Error('Missing literal draft.');
      await selectOption(page.locator('#interface-locale'), 'fr');
      await expect(basisField('fr')).toHaveValue(phase.basis);
      await selectOption(page.locator('#interface-locale'), 'en');
    }
    async function verify() {
      const detail = await source.read(manager, source.base);
      expect(detail).toMatchObject({
        id: source.caseId,
        companyId: source.companyId,
        revision,
      });
      expect(detail.decision).toBeNull();
      if (recorded) {
        expect(detail.recommendation).toMatchObject({
          id: recorded.id,
          version: recorded.version,
          caseRevision: revision,
          recordedBy: { workspaceMembershipId: source.auditorMembership },
          value: { recommendation: 'grant', basis: recorded.basis },
        });
      } else expect(detail.recommendation).toBeNull();
      if (phase.kind === 'ready' && recorded)
        await expect(recommendation()).toContainText(recorded.basis);
      if (phase.kind !== 'ready')
        await expect(basisField()).toHaveValue(phase.basis);
      const decision = article().getByRole('region', {
        name: message('certificationDecisionTitle'),
        exact: true,
      });
      await expect(decision.getByRole('form')).toHaveCount(0);
      if (recorded && phase.kind !== 'uncertain')
        await expect(decision).toContainText(
          message('certificationDecisionIndependence'),
        );
    }
    function actions(value: Variant): BrowserAction[] {
      if (phase.kind === 'uncertain')
        return [
          {
            label: 'retry-conserved-native-certification-recommendation',
            run: retryExact,
          },
        ];
      if (phase.kind === 'draft')
        return [
          {
            label: 'edit-literal-certification-recommendation',
            run: () => edit(value),
          },
          {
            label: 'save-recommendation-with-lost-receipt',
            run: () => confirm(true),
          },
          {
            label: 'persist-human-reviewed-recommendation',
            run: () => confirm(false),
          },
          {
            label: 'preserve-certification-draft-across-locale',
            run: preserveDraftAcrossLocale,
          },
        ];
      return [
        {
          label: 'start-human-certification-recommendation',
          run: () => edit(value),
        },
        {
          label: 'consult-as-independent-certification-reader',
          run: inspectReader,
        },
        {
          label: 'navigate-and-reopen-exact-certification-case',
          run: () => openMember(auditor),
        },
      ];
    }
    return {
      actions,
      verify,
      async settle() {
        if (phase.kind === 'uncertain') await retryExact();
      },
      async dispose() {
        await removeRoute(page, apiPattern, credentials);
      },
      describe: () => ({
        phase: phase.kind,
        revision,
        recorded: recorded !== null,
      }),
    };
  },
};
