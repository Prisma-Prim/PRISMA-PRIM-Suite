import { Injectable, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { CommercialPdfRenderer } from '../commercial-pdf/commercial-pdf-renderer.js';
import {
  readExactCommercialPdf,
  requirePdfIds,
} from '../commercial-pdf/commercial-pdf-read.js';
import type { CommercialPdfSource } from '../commercial-pdf/commercial-pdf-source.js';
import { offerPdfSource } from './offer-pdf-source.js';
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
        return offerPdfSource(input.actor, offer);
      },
    });
  }
}
