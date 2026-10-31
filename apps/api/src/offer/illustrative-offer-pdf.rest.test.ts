import { createHash } from 'node:crypto';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  compactPdfText,
  inspectCommercialPdf,
} from '../commercial-pdf/pdf-inspection.test-support.mjs';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_WORKSPACE,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from './offer-estimate-preparation.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Exact illustrative Offer v1 PDF public REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture();
  });
  beforeEach(async () => {
    await fixture.reset();
  });
  afterAll(async () => {
    await fixture?.close();
  });

  it('downloads every literal of the authorized exact unadjusted v1 source with its distinct English binding', async () => {
    const source = await fixture.prepare();
    const snapshot = await fixture.illustrativeSnapshot(source);
    const path = `/offers/opportunities/${source.opportunityId}`;
    const offer = responseRecord(
      await fixture.command({
        path,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          pricingSnapshotId: snapshot.id,
          recipient: { kind: 'PRIMARY' },
          scopeNote: 'Scope  with\ttab\r\n\nȘț Русский Français a\u0306 ☀️',
          commercialConditions: '<script>literal &amp; once</script>',
        },
      }),
    );
    const version = responseRecord(offer.version);
    const representation = responseRecord(version.representation);
    const html = responseString(representation, 'html');
    const digest = responseString(representation, 'sha256');
    const versionId = responseString(version, 'id');
    const exact = `${path}/versions/${versionId}`;
    const before = await fixture.read({
      path: exact,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
    });
    const response = await fixture.request({
      path: `${exact}/pdf?sourceHtmlSha256=${digest}`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
    });
    expect({
      status: response.status,
      error: response.ok ? null : await response.json(),
    }).toEqual({ status: 200, error: null });
    expect(response.headers.get('x-commercial-pdf-renderer')).toBe(
      'COMMERCIAL_ILLUSTRATIVE_OFFER_PDF/1',
    );
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="offer-${String(offer.illustrativeReference)}-v1-non-official-en.pdf"`,
    );
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(
      JSON.parse(response.headers.get('x-commercial-pdf-source') ?? 'null'),
    ).toEqual({
      kind: 'offer',
      workspaceId: ESTIMATE_OFFER_WORKSPACE,
      companyId: source.companyId,
      opportunityId: source.opportunityId,
      rootId: offer.id,
      reference: offer.illustrativeReference,
      versionId,
      versionNumber: 1,
      provenance: 'ILLUSTRATIVE',
      language: 'en',
      createdAt: version.createdAt,
      sourceRendererCode: 'OFFER_ILLUSTRATIVE',
      sourceRendererVersion: 1,
      sourceHtmlSha256: digest,
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Number(response.headers.get('content-length'))).toBe(bytes.length);
    expect(response.headers.get('x-commercial-pdf-sha256')).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    const pages = await inspectCommercialPdf(bytes);
    const extracted = pages
      .flatMap((page) => page.items)
      .filter((item) => item.tag.startsWith('SourceBlock'))
      .map((item) => item.text)
      .join('');
    let visible = '';
    function visit(node: DefaultTreeAdapterMap['node'], insideBody = false) {
      const inside = insideBody || node.nodeName === 'body';
      if (inside && node.nodeName === '#text' && 'value' in node)
        visible += node.value;
      if ('childNodes' in node)
        for (const child of node.childNodes) visit(child, inside);
    }
    visit(parse(html));
    expect(compactPdfText(extracted)).toBe(compactPdfText(visible));
    expect(
      await fixture.read({
        path: exact,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    ).toEqual(before);
  }, 30_000);
});
