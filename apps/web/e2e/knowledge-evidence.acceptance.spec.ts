import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { selectOption } from './select-option';
import { evidenceFixture } from './knowledge-evidence.acceptance.fixture';

for (const frame of ['prisme', 'classic'])
  test(`reads exact admitted evidence, earlier equal-byte PDF and deliberate known-version history in ${frame}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const fixture = await evidenceFixture(
      page.request,
      `${frame}-${testInfo.project.name}`,
    );
    const calls: string[] = [];
    const cachePolicies: string[] = [];
    page.on('request', (request) => {
      if (
        request.url().includes('/api/knowledge/') ||
        request.url().includes('/content')
      )
        calls.push(request.url());
    });
    page.on('response', (response) => {
      if (
        response.url().includes('/api/knowledge/evidence/') ||
        response.url().includes('/content')
      )
        cachePolicies.push(response.headers()['cache-control'] ?? '');
    });
    await page.goto('/?frame=' + frame);
    const narrow = testInfo.project.name.endsWith('narrow');
    if (narrow && frame === 'prisme')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: fixture.companyName,
    });
    if (narrow && frame === 'classic')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    const navigation = page.getByRole('navigation', {
      name: 'Primary navigation',
    });
    await navigation
      .getByRole('link', { name: 'Knowledge evidence', exact: true })
      .click();
    const panel = page.locator('section#knowledge-evidence');
    await expect(panel).toHaveAccessibleName('Knowledge evidence');
    await expect(
      panel.getByText(fixture.sources[0]?.title ?? 'missing'),
    ).toBeVisible();
    expect(
      calls.filter((url) => url.includes('/knowledge/evidence/sources')),
    ).toHaveLength(1);
    for (const source of fixture.sources) {
      expect(source.representationId).not.toBe(source.laterRepresentationId);
      const query = panel.getByRole('textbox');
      await expect(query).toHaveAccessibleName('Literal search');
      await query.fill(source.passageText);
      await panel
        .getByRole('button', { name: 'Search passages', exact: true })
        .click();
      await expect(panel.locator('pre')).toHaveText(source.passageText, {
        useInnerText: false,
      });
      await panel
        .getByRole('button', { name: 'Open passage', exact: true })
        .focus();
      await page.keyboard.press('Enter');
      const citation = panel.getByRole('article', { name: source.title });
      await expect(citation).toBeVisible();
      await expect(
        panel.getByRole('heading', { name: 'Knowledge evidence', exact: true }),
      ).toBeFocused();
      expect(await citation.locator('pre').textContent()).toBe(
        source.passageText,
      );
      const downloads = page.waitForEvent('download');
      const beforePdf = calls.length;
      await citation
        .getByRole('button', { name: 'Download exact source PDF' })
        .click();
      const download = await downloads,
        path = await download.path();
      if (!path) throw new Error('Missing native download.');
      const actual = await readFile(path);
      expect(actual).toEqual(source.bytes);
      expect(createHash('sha256').update(actual).digest('hex')).toBe(
        source.sourceSha256,
      );
      const native = calls.filter((url) => url.includes('/content'));
      const exactNativeUrl = `${new URL(page.url()).origin}/api/documents/${source.documentId}/versions/${source.documentVersionId}/content/${source.representationId}`;
      expect(native.at(-1)).toBe(exactNativeUrl);
      expect(calls.slice(beforePdf)).toEqual([
        `${new URL(page.url()).origin}/api/knowledge/evidence/sources/${source.sourceId}/passages/p1`,
        exactNativeUrl,
      ]);
      expect(
        native.some((url) => url.endsWith('/' + source.laterRepresentationId)),
      ).toBe(false);
      const before = calls.length;
      for (const locale of ['ro', 'ru', 'fr', 'en']) {
        await selectOption(
          page.locator('.interface-locale-control').getByRole('combobox'),
          { value: locale },
        );
        expect(await citation.locator('pre').textContent()).toBe(
          source.passageText,
        );
        await expect(query).toHaveValue(source.passageText);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        if (source.sourceId === fixture.sources[0]?.sourceId)
          await page.screenshot({
            path: testInfo.outputPath(
              `knowledge-${frame}-locale-${locale}.png`,
            ),
            fullPage: true,
          });
      }
      expect(calls).toHaveLength(before);
      await page.screenshot({
        path: testInfo.outputPath(
          `knowledge-${frame}-${source.draftBody.language}.png`,
        ),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await fixture.supersede(source.documentId);
      const beforeHistory = calls.length;
      const exactHistoryUrl = `${new URL(page.url()).origin}/api/knowledge/evidence/sources/${source.sourceId}/passages/p1?mode=historical&documentVersionId=${source.documentVersionId}`;
      const historyRequest = page.waitForRequest((request) =>
        request
          .url()
          .includes(
            `/knowledge/evidence/sources/${source.sourceId}/passages/p1?mode=historical&documentVersionId=${source.documentVersionId}`,
          ),
      );
      await citation
        .getByRole('button', {
          name: 'Reopen this cited version — ' + source.title,
        })
        .click();
      await historyRequest;
      await expect(
        panel.getByText('Historical evidence', { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByText('Exact cited version · Superseded', { exact: true }),
      ).toBeVisible();
      expect(calls.slice(beforeHistory)).toEqual([exactHistoryUrl]);
      expect(await panel.locator('pre').textContent()).toBe(source.passageText);
      const historicalDownload = page.waitForEvent('download');
      await panel
        .getByRole('button', { name: 'Download exact source PDF' })
        .click();
      const historicalFile = await historicalDownload,
        historicalPath = await historicalFile.path();
      if (!historicalPath) throw new Error('Missing exact historical PDF.');
      expect(await readFile(historicalPath)).toEqual(source.bytes);
      expect(calls.slice(-2)).toEqual([exactHistoryUrl, exactNativeUrl]);
      expect(page.url()).not.toContain(source.sourceId);
      expect(page.url()).not.toContain(source.documentVersionId);
      const stored = await page.evaluate(() =>
        JSON.stringify([
          Object.entries(localStorage),
          Object.entries(sessionStorage),
        ]),
      );
      expect(stored).not.toContain(source.sourceId);
      expect(stored).not.toContain(source.documentVersionId);
      expect(stored).not.toContain(source.passageText);
      await expect(panel.getByRole('textbox')).toHaveCount(1);
      await panel
        .getByRole('button', { name: 'Return to current sources' })
        .click();
      await expect(
        panel.getByRole('heading', { name: 'Current sources' }),
      ).toBeVisible();
    }
    expect(calls.some((url) => url.includes('/administration'))).toBe(false);
    expect(cachePolicies.length).toBeGreaterThan(0);
    expect(
      cachePolicies.every((policy) => policy === 'private, no-store'),
    ).toBe(true);
  });

for (const frame of ['prisme', 'classic'])
  test(`withholds Knowledge navigation and direct-fragment reads from a native Source Administrator without Reader in ${frame}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const fixture = await evidenceFixture(
      page.request,
      `no-reader-${frame}-${testInfo.project.name}`,
      { reader: false },
    );
    const reads: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/knowledge/evidence/'))
        reads.push(request.url());
    });
    await page.goto('/?frame=' + frame + '#knowledge-evidence');
    const narrow = testInfo.project.name.endsWith('narrow');
    if (narrow && frame === 'prisme')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: fixture.companyName,
    });
    if (narrow && frame === 'classic')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    const navigation = page.getByRole('navigation', {
      name: 'Primary navigation',
    });
    if (frame === 'classic') {
      await expect(
        page.getByRole('region', { name: 'Working Documents', exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        navigation.getByRole('link', {
          name: 'Working Documents',
          exact: true,
        }),
      ).toBeVisible();
    }
    await expect(
      navigation.getByRole('link', { name: 'Knowledge evidence', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Knowledge evidence', exact: true }),
    ).toHaveCount(0);
    expect(reads).toEqual([]);
  });
