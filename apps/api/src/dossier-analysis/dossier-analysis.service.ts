import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { DossierHistoryService } from './history.service.js';
import { DossierInventoryService } from './inventory.service.js';
import { DossierRunService } from './run.service.js';
import { DossierSourceService } from './source.service.js';
import { DossierSuggestionService } from './suggestion.service.js';

@Injectable()
export class DossierAnalysisService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly sources: DossierSourceService,
    private readonly runs: DossierRunService,
    private readonly inventoryService: DossierInventoryService,
    private readonly suggestions: DossierSuggestionService,
    private readonly historyService: DossierHistoryService,
  ) {}
  inventory(actor: ActorContext, projectValue: unknown) {
    const projectId = requireUuid(projectValue);
    return this.database.transaction(
      () =>
        this.inventoryService.listWithinTransaction(actor, projectId, false),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  workspace(actor: ActorContext, projectValue: unknown) {
    const projectId = requireUuid(projectValue);
    return this.database.transaction(
      async () => {
        const current = await this.runs.captureWithinTransaction(
          actor,
          projectId,
          false,
        );
        const selected = current.selected;
        const sources = selected.map(({ row, live }) => ({
          id: row.id,
          documentId: row.documentId,
          documentVersionId: row.versionId,
          representationId: row.representationId,
          kind: row.kind,
          fileName: row.fileName,
          mediaType:
            row.kind === 'pdf'
              ? 'application/pdf'
              : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sizeBytes: row.size,
          sourceSha256: row.sha256,
          language: row.language,
          documentTitle: live.document.title,
          documentType: live.document.type,
          versionNumber: live.version.number,
          versionStatus: live.version.status,
          extraction: null,
        }));
        const history = await this.historyService.pageWithinTransaction(
          actor,
          projectId,
          null,
          current,
        );
        return { format: 'DOSSIER_ANALYSIS/1', sources, ...history };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  history(actor: ActorContext, projectValue: unknown, queryValue: unknown) {
    const projectId = requireUuid(projectValue);
    if (
      !queryValue ||
      typeof queryValue !== 'object' ||
      Array.isArray(queryValue)
    )
      throw new BadRequestException('Invalid history cursor.');
    const query = Object.fromEntries(Object.entries(queryValue));
    if (
      Object.keys(query).some((key) => key !== 'cursor') ||
      typeof query.cursor !== 'string' ||
      !query.cursor
    )
      throw new BadRequestException('Invalid history cursor.');
    const cursor = query.cursor;
    return this.database.transaction(
      async () => {
        const current = await this.runs.captureWithinTransaction(
          actor,
          projectId,
          false,
        );
        return this.historyService.pageWithinTransaction(
          actor,
          projectId,
          cursor,
          current,
        );
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  detail(actor: ActorContext, projectValue: unknown, runValue: unknown) {
    const projectId = requireUuid(projectValue),
      runId = requireUuid(runValue);
    return this.database.transaction(
      async () => {
        const frozen = await this.runs.frozenWithinTransaction(
          actor,
          projectId,
          runId,
          false,
        );
        const sources = frozen.snapshot.sources.map((source) => {
          const metadata = frozen.sourceRows.find(
            (row) => row.id === source.id,
          );
          if (!metadata) throw new NotFoundException();
          return {
            ...source,
            kind: metadata.kind,
            sizeBytes: metadata.size,
            mediaType:
              metadata.kind === 'pdf'
                ? 'application/pdf'
                : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          };
        });
        const suggestions = await this.suggestions.listWithinTransaction(
          actor,
          projectId,
          frozen.row.companyId,
          runId,
          frozen.snapshot.sources,
          frozen.snapshot.sourceHash,
        );
        return {
          id: runId,
          snapshotHash: frozen.row.snapshotHash,
          pipelineVersion: frozen.snapshot.pipelineVersion,
          createdAt: frozen.row.createdAt.toISOString(),
          stale: frozen.stale,
          sources,
          candidates: frozen.result.candidates,
          comparisons: frozen.result.comparisons,
          coverage: frozen.result.coverage,
          suggestions,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
