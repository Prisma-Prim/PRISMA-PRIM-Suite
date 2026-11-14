import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { CompanyContextAccess } from './CompanyContextAccess';
import { companyAccessAdministrationResponse } from './company-access-administration-response';
import {
  assignmentAdministration,
  assignmentAdministrator,
  assignmentBundleCases,
  assignmentLocaleCases,
} from './company-assignment-localization.test-fixtures';

// The browser spec e2e/company-assignment-localization.spec.ts compares the
// bundle list the Company access screen offers with assignmentBundleCases. A
// feature that adds a bundle but not its fixture entry used to be found only by
// that slow browser job. This guard finds it in `pnpm verify` and says what to
// edit. The fixture cannot be generated: its ro/ru/fr/en labels are
// independent expectations and the option order belongs to the screen.

const fixtureFile =
  'apps/web/src/access/company-assignment-localization.test-fixtures.ts';
const registryFile = 'apps/api/src/access/company-permissions.ts';

// Registry bundles this screen deliberately does not offer: Knowledge
// assignments are granted through the Knowledge module's own routes.
const NOT_OFFERED_ON_THE_SCREEN: ReadonlySet<string> = new Set([
  'Company Knowledge Source Administrator',
  'Company Knowledge Evidence Reader',
]);

interface OfferedBundle {
  value: string;
  label: string;
}
interface FixtureBundle {
  value: string;
  canonical: string;
  version: string | null;
}
/** Registry label to the captured versions of that bundle, in capture order. */
type RegistryVersions = ReadonlyMap<string, readonly string[]>;

// The registry is read with import.meta.glob instead of a static import: the
// production web image copies only apps/web, and `tsc -b` there type-checks
// every file under src, so a static import of apps/api/src would break that
// build. The module is unparsed input, so its shape is checked here.
const registryModules = import.meta.glob(
  '../../../api/src/access/company-permissions.ts',
  { eager: true },
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function registryVersionsOf(registryModule: unknown): RegistryVersions {
  const bundles = isRecord(registryModule)
    ? registryModule.COMPANY_ROLE_BUNDLES
    : undefined;
  if (!isRecord(bundles))
    throw new Error(
      `COMPANY_ROLE_BUNDLES is not exported by ${registryFile}. If the registry moved, update the import.meta.glob path in this test.`,
    );
  return new Map(
    Object.entries(bundles).map(([key, bundle]): [string, string[]] => {
      if (
        !isRecord(bundle) ||
        typeof bundle.label !== 'string' ||
        !isRecord(bundle.versions)
      )
        throw new Error(
          `COMPANY_ROLE_BUNDLES.${key} in ${registryFile} no longer has a label and a versions table; update this guard.`,
        );
      return [bundle.label, Object.keys(bundle.versions)];
    }),
  );
}

function bundleFixtureDivergences({
  offered,
  fixture,
  registry,
}: {
  offered: readonly OfferedBundle[];
  fixture: readonly FixtureBundle[];
  registry: RegistryVersions;
}): string[] {
  const problems: string[] = [];
  const fixtureValues = new Set(fixture.map((bundle) => bundle.value));
  const offeredValues = new Set(offered.map((bundle) => bundle.value));

  offered.forEach((bundle, index) => {
    if (fixtureValues.has(bundle.value)) return;
    const previous = index === 0 ? undefined : offered[index - 1];
    const where =
      previous === undefined
        ? 'as the first entry'
        : `right after "${previous.value}"`;
    problems.push(
      `The screen offers bundle "${bundle.value}" (shown as "${bundle.label}") but assignmentBundleCases has no entry with that value. Add one ${where} with its registry label, a captured version and independently written ro/ru/fr/en labels.`,
    );
  });
  for (const bundle of fixture) {
    if (!offeredValues.has(bundle.value))
      problems.push(
        `assignmentBundleCases lists "${bundle.value}" but the screen does not offer it. Remove or rename the entry.`,
      );
  }

  const offeredOrder = offered
    .map((bundle) => bundle.value)
    .filter((value) => fixtureValues.has(value));
  const fixtureOrder = fixture
    .map((bundle) => bundle.value)
    .filter((value) => offeredValues.has(value));
  const firstDifference = offeredOrder.findIndex(
    (value, index) => value !== fixtureOrder[index],
  );
  if (firstDifference >= 0)
    problems.push(
      `assignmentBundleCases must follow the screen's option order: at shared position ${firstDifference + 1} the screen offers "${offeredOrder[firstDifference]}" where the fixture has "${fixtureOrder[firstDifference]}".`,
    );

  for (const bundle of fixture) {
    const captured = registry.get(bundle.canonical);
    if (captured === undefined) {
      problems.push(
        `Bundle "${bundle.value}" has canonical "${bundle.canonical}", which is not a label in COMPANY_ROLE_BUNDLES. Use the registry label of the bundle.`,
      );
      continue;
    }
    const valid =
      captured.length === 0
        ? bundle.version === null
        : bundle.version !== null && captured.includes(bundle.version);
    if (!valid)
      problems.push(
        `Bundle "${bundle.value}" uses version ${JSON.stringify(bundle.version)}, but COMPANY_ROLE_BUNDLES captures ${captured.length === 0 ? 'no version (use null)' : captured.join(', ')} for "${bundle.canonical}".`,
      );
  }
  const fixtureCanonicals = new Set(fixture.map((bundle) => bundle.canonical));
  for (const label of registry.keys())
    if (!fixtureCanonicals.has(label) && !NOT_OFFERED_ON_THE_SCREEN.has(label))
      problems.push(
        `COMPANY_ROLE_BUNDLES has "${label}" but the Company access screen does not offer it. Add its option, route and assignmentBundleCases entry, or list it in NOT_OFFERED_ON_THE_SCREEN with the reason.`,
      );
  return problems;
}

function outOfSyncMessage(problems: readonly string[]): string {
  return [
    `The Company access bundle fixture is out of sync with the Company access screen or the bundle registry. Update assignmentBundleCases in ${fixtureFile} (registry: COMPANY_ROLE_BUNDLES in ${registryFile}):`,
    ...problems.map((problem) => `- ${problem}`),
  ].join('\n');
}

const english = assignmentLocaleCases.find((item) => item.locale === 'en');
if (!english) throw new Error('Missing independent English fixture');
const englishLocale = english.locale;
const englishBundleLabel = english.bundle;

afterEach(() => {
  vi.unstubAllGlobals();
});

async function bundlesOfferedByTheScreen(): Promise<OfferedBundle[]> {
  localStorage.setItem(interfaceLocaleStorageKey, englishLocale);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(assignmentAdministration())),
  );
  render(
    <InterfaceLocaleProvider>
      <CompanyContextAccess
        actor={assignmentAdministrator}
        identity={{
          loaded: true,
          signedIn: true,
          getToken: vi.fn(async () => null),
          rejectSession: vi.fn(async () => undefined),
          signOut: vi.fn(async () => undefined),
          signedOutView: null,
        }}
        onActorRevalidated={vi.fn(async () => undefined)}
        onCompanyContextRejected={vi.fn(async () => undefined)}
        onActivityRecorded={vi.fn(async () => undefined)}
        onClientAuthorityChanged={vi.fn(async () => undefined)}
        onWorkspaceAccessRejected={vi.fn(async () => undefined)}
      />
    </InterfaceLocaleProvider>,
  );
  const control = await screen.findByRole('combobox', {
    name: englishBundleLabel,
  });
  fireEvent.click(control);
  return within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((option) => {
      const value = option.getAttribute('data-value');
      if (value === null) throw new Error('A bundle option has no data-value.');
      return { value, label: option.textContent ?? '' };
    });
}

it('keeps assignmentBundleCases in step with the bundles the Company access screen offers and with COMPANY_ROLE_BUNDLES', async () => {
  const problems = bundleFixtureDivergences({
    offered: await bundlesOfferedByTheScreen(),
    fixture: assignmentBundleCases,
    registry: registryVersionsOf(Object.values(registryModules)[0]),
  });
  if (problems.length > 0) throw new Error(outOfSyncMessage(problems));
});

const offered = [
  { value: 'alpha', label: 'Alpha label' },
  { value: 'beta', label: 'Beta label' },
  { value: 'gamma', label: 'Gamma label' },
];
const fixture = [
  { value: 'alpha', canonical: 'Company Alpha', version: 'v1' },
  { value: 'beta', canonical: 'Company Beta', version: null },
  { value: 'gamma', canonical: 'Company Gamma', version: 'v2' },
];
const registry: RegistryVersions = new Map([
  ['Company Alpha', ['v1']],
  ['Company Beta', []],
  ['Company Gamma', ['v1', 'v2']],
]);

it('accepts a fixture that matches the screen and the registry', () => {
  expect(bundleFixtureDivergences({ offered, fixture, registry })).toEqual([]);
});

it('names a bundle the screen offers but the fixture lacks, where to add it and which file to edit', () => {
  const problems = bundleFixtureDivergences({
    offered,
    fixture: fixture.filter((bundle) => bundle.value !== 'beta'),
    registry,
  });
  expect(problems).toEqual([
    expect.stringContaining(
      'The screen offers bundle "beta" (shown as "Beta label")',
    ),
    expect.stringContaining(
      'COMPANY_ROLE_BUNDLES has "Company Beta" but the Company access screen does not offer it',
    ),
  ]);
  expect(problems[0]).toContain('right after "alpha"');
  const message = outOfSyncMessage(problems);
  expect(message).toContain(fixtureFile);
  expect(message).toContain(registryFile);
});

it('names a fixture entry the screen no longer offers and an order difference', () => {
  expect(
    bundleFixtureDivergences({
      offered,
      fixture: [...fixture, { ...fixture[0], value: 'delta' }],
      registry,
    }),
  ).toEqual([expect.stringContaining('lists "delta" but the screen')]);
  expect(
    bundleFixtureDivergences({
      offered,
      fixture: [fixture[1], fixture[0], fixture[2]],
      registry,
    }),
  ).toEqual([
    expect.stringContaining(
      'at shared position 1 the screen offers "alpha" where the fixture has "beta"',
    ),
  ]);
});

it('names a fixture label or version the registry does not capture', () => {
  expect(
    bundleFixtureDivergences({
      offered,
      fixture: [
        { ...fixture[0], canonical: 'Company Renamed' },
        { ...fixture[1], version: 'v1' },
        { ...fixture[2], version: 'v9' },
      ],
      registry,
    }),
  ).toEqual([
    expect.stringContaining(
      'canonical "Company Renamed", which is not a label',
    ),
    expect.stringContaining(
      'Bundle "beta" uses version "v1", but COMPANY_ROLE_BUNDLES captures no version (use null)',
    ),
    expect.stringContaining(
      'Bundle "gamma" uses version "v9", but COMPANY_ROLE_BUNDLES captures v1, v2',
    ),
    expect.stringContaining(
      'COMPANY_ROLE_BUNDLES has "Company Alpha" but the Company access screen does not offer it',
    ),
  ]);
});

it('names a registry bundle the screen does not offer unless it is deliberately left out', () => {
  const withNewBundle: RegistryVersions = new Map([
    ...registry,
    ['Company Delta', ['v1']],
    ['Company Knowledge Evidence Reader', ['v1']],
  ]);
  expect(
    bundleFixtureDivergences({ offered, fixture, registry: withNewBundle }),
  ).toEqual([
    expect.stringContaining(
      'COMPANY_ROLE_BUNDLES has "Company Delta" but the Company access screen does not offer it',
    ),
  ]);
});

it('reads every registry label and captured version in the administration state, and no other version', () => {
  const registryVersions = registryVersionsOf(
    Object.values(registryModules)[0],
  );
  const base = assignmentAdministration();
  const assignmentsOf = (
    bundle: string,
    versions: readonly (string | null)[],
  ) =>
    versions.map((permissionSetVersion, index) => ({
      id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
      workspaceMembershipId: base.members[0]?.workspaceMembershipId,
      companyId: base.companies[0]?.id,
      bundle,
      permissionSetVersion,
      active: true,
    }));
  for (const [bundle, versions] of registryVersions) {
    const captured = versions.length === 0 ? [null] : versions;
    expect(
      companyAccessAdministrationResponse({
        ...base,
        assignments: assignmentsOf(bundle, captured),
      }).assignments.map((assignment) => assignment.permissionSetVersion),
    ).toEqual(captured);
    expect(() =>
      companyAccessAdministrationResponse({
        ...base,
        assignments: assignmentsOf(bundle, [
          versions.length === 0 ? 'v1' : 'v99',
        ]),
      }),
    ).toThrow();
  }
});
