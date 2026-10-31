import { Injectable, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { CommercialPdfRenderer } from '../commercial-pdf/commercial-pdf-renderer.js';
import {
  readExactCommercialPdf,
  requirePdfIds,
} from '../commercial-pdf/commercial-pdf-read.js';
import {
  pdfRefusal,
  type CommercialPdfSource,
} from '../commercial-pdf/commercial-pdf-source.js';
import { OfferService } from './offer.service.js';
@Injectable()
export class OfferPdfService {
  constructor(
    private readonly offers: OfferService,
    private readonly renderer: CommercialPdfRenderer,
  ) {}
  async read(input: {
    actor: ActorContext;
    opportunityId: string;
    versionId: string;
    query: unknown;
    signal?: AbortSignal;
  }) {
    requirePdfIds(input.opportunityId, input.versionId);
    return readExactCommercialPdf({
      query: input.query,
      signal: input.signal,
      renderer: this.renderer,
      readSource: async (): Promise<CommercialPdfSource> => {
        const offer = await this.offers.read(
          input.actor,
          input.opportunityId,
          input.versionId,
        );
        if (!offer) throw new NotFoundException();
        const version = offer.version;
        const identity = {
          kind: 'offer',
          workspaceId: input.actor.workspaceId,
          companyId: offer.companyId,
          opportunityId: offer.opportunityId,
          rootId: offer.id,
          reference: offer.illustrativeReference,
          versionId: version.id,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt,
          sourceRendererVersion: 1,
        } satisfies Pick<
          CommercialPdfSource,
          | 'kind'
          | 'workspaceId'
          | 'companyId'
          | 'opportunityId'
          | 'rootId'
          | 'reference'
          | 'versionId'
          | 'versionNumber'
          | 'createdAt'
          | 'sourceRendererVersion'
        >;
        if (version.provenance === 'ILLUSTRATIVE') {
          const representation = version.representation;
          if (
            representation.templateCode !== 'OFFER_ILLUSTRATIVE' ||
            representation.templateVersion !== 1 ||
            version.pricingSnapshot.lines.some(
              (line) => line.adjustment !== null,
            )
          )
            pdfRefusal('PDF_SOURCE_UNSUPPORTED');
          return {
            ...identity,
            provenance: 'ILLUSTRATIVE',
            language: 'en',
            sourceRendererCode: 'OFFER_ILLUSTRATIVE',
            sourceHtmlSha256: representation.sha256,
            html: representation.html,
          };
        }
        if (
          version.provenance !== 'COMPANY_MODEL_ESTIMATE' ||
          version.eligibility !== 'NON_OFFICIAL_REHEARSAL'
        )
          pdfRefusal('PDF_SOURCE_UNSUPPORTED');
        const representation = version.representation;
        if (
          representation.rendererCode !== 'OFFER_COMPANY_CONSULTING_RO' ||
          representation.rendererVersion !== 1 ||
          version.modelSource.language !== 'ro' ||
          version.modelSource.code !== 'INTEGRATED_MANAGEMENT_CONSULTING_RO'
        )
          pdfRefusal('PDF_SOURCE_UNSUPPORTED');
        return {
          ...identity,
          provenance: version.provenance,
          language: 'ro',
          sourceRendererCode: representation.rendererCode,
          sourceHtmlSha256: representation.sha256,
          html: representation.html,
        };
      },
    });
  }
}
