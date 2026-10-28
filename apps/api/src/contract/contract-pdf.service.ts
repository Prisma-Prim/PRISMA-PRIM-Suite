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
import { ContractVersionReader } from './contract-version-reader.js';
@Injectable()
export class ContractPdfService {
  constructor(
    private readonly contracts: ContractVersionReader,
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
        const contract = await this.contracts.readForPdf({
          actor: input.actor,
          opportunityId: input.opportunityId,
          versionId: input.versionId,
        });
        if (!contract) throw new NotFoundException();
        const version = contract.version;
        if (
          contract.kind !== 'CONTRACT' ||
          contract.origin !== 'COMPANY_MODEL_OFFER' ||
          version.provenance !== 'COMPANY_MODEL_OFFER'
        )
          pdfRefusal('PDF_SOURCE_UNSUPPORTED');
        if (!('modelGeneration' in version))
          pdfRefusal('PDF_SOURCE_UNSUPPORTED');
        const representation = version.representation;
        if (
          !('rendererCode' in representation) ||
          !('rendererVersion' in representation)
        )
          pdfRefusal('PDF_SOURCE_UNSUPPORTED');
        if (
          representation.rendererCode !== 'COMPANY_CONSULTING_CONTRACT_RO' ||
          representation.rendererVersion !== 1 ||
          version.modelGeneration.modelSource.language !== 'ro' ||
          version.modelGeneration.modelSource.code !==
            'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO'
        )
          pdfRefusal('PDF_SOURCE_UNSUPPORTED');
        return {
          kind: 'contract',
          workspaceId: input.actor.workspaceId,
          companyId: contract.companyId,
          opportunityId: contract.opportunityId,
          rootId: contract.id,
          reference: contract.illustrativeReference,
          versionId: version.id,
          versionNumber: version.versionNumber,
          provenance: version.provenance,
          language: 'ro',
          createdAt: version.createdAt,
          sourceRendererCode: representation.rendererCode,
          sourceRendererVersion: 1,
          sourceHtmlSha256: representation.sha256,
          html: representation.html,
        };
      },
    });
  }
}
