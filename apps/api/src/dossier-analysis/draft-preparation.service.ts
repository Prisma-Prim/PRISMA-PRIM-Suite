import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { requireUuid } from '../access/access-command-validation.js';
import { CertificationService } from '../certification/certification.service.js';
import { CertificationAuditService } from '../certification/certification-audit.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { FIELDS } from '../dossier-analysis-engine/index.js';
import { DossierRunService } from './run.service.js';
import { DossierSuggestionService } from './suggestion.service.js';

/** Only direct descriptive mappings; never resolve business identities or dates. */
const fields = {
  legalName: { target: 'declaredLegalName', limit: 300 },
  address: { target: 'declaredAddress', limit: 500 },
  scope: { target: 'requestedScope', limit: 2000 },
} satisfies Record<string, { target: string; limit: number }>;

function mapping(field: string) {
  switch (field) {
    case 'legalName':
      return fields.legalName;
    case 'address':
      return fields.address;
    case 'scope':
      return fields.scope;
    default:
      return null;
  }
}

@Injectable()
export class DossierDraftPreparationService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly certification: CertificationService,
    private readonly audit: CertificationAuditService,
    private readonly runs: DossierRunService,
    private readonly suggestions: DossierSuggestionService,
  ) {}

  prepare(input: {
    actor: ActorContext;
    projectId: string;
    runId: string;
    query: unknown;
  }) {
    return this.prepareFor(input, false);
  }

  prepareStage(input: {
    actor: ActorContext;
    projectId: string;
    runId: string;
    query: unknown;
  }) {
    return this.prepareFor(input, true);
  }

  private prepareFor(
    input: {
      actor: ActorContext;
      projectId: string;
      runId: string;
      query: unknown;
    },
    stage: boolean,
  ) {
    const projectId = requireUuid(input.projectId),
      runId = requireUuid(input.runId);
    const query = preparationQuery(input.query, stage);
    return this.database.transaction(
      async () => {
        const target = query.step
          ? await this.audit.stageDraftContextWithinTransaction({
              actor: input.actor,
              projectId,
              ...query,
              step: query.step,
            })
          : await this.certification.applicationDraftContextWithinTransaction({
              actor: input.actor,
              projectId,
              ...query,
            });
        const frozen = await this.runs.frozenWithinTransaction(
          input.actor,
          projectId,
          runId,
          false,
        );
        if (frozen.stale)
          throw new ConflictException(
            'The analysis changed. Prepare a current run.',
          );
        const suggestions = await this.suggestions.listWithinTransaction(
          input.actor,
          projectId,
          frozen.row.companyId,
          runId,
          frozen.snapshot.sources,
          frozen.snapshot.sourceHash,
        );
        const candidates = suggestions.flatMap((suggestion) => {
          const review = suggestion.reviews.at(-1);
          const field =
            suggestion.proposal &&
            (query.step
              ? stageMapping(suggestion.proposal.field, query.step)
              : mapping(suggestion.proposal.field));
          if (
            !field ||
            !review ||
            review.decision === 'reject' ||
            !suggestion.proposal
          )
            return [];
          const value =
            review.decision === 'correct'
              ? review.replacementValue
              : suggestion.proposal.value;
          if (
            !value ||
            value.trim() !== value ||
            value.length > field.limit ||
            /[\p{Cc}\p{Cf}]/u.test(value)
          )
            return [];
          return [
            {
              field: field.target,
              value,
              suggestionId: suggestion.id,
              reviewRevision: review.revision,
              reviewer: review.actorDisplayName,
              reviewedAt: review.recordedAt,
              proposalValue: suggestion.proposal.value,
              citations: suggestion.proposal.citations.map((citation) => {
                const source = frozen.snapshot.sources.find(
                  (s) => s.id === citation.sourceId,
                );
                if (!source)
                  throw new BadRequestException(
                    'The cited source is unavailable.',
                  );
                return {
                  ...citation,
                  documentTitle: source.documentTitle,
                  fileName: source.fileName,
                  versionNumber: source.versionNumber,
                };
              }),
            },
          ];
        });
        if (candidates.length > 100)
          throw new BadRequestException('The preparation is too large.');
        return {
          format: query.step
            ? 'CERTIFICATION_STAGE_DRAFT/1'
            : 'CERTIFICATION_APPLICATION_DRAFT/1',
          target,
          run: { id: runId, snapshotHash: frozen.row.snapshotHash },
          candidates,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}

function stageMapping(field: string, step: string) {
  if (step === 'stage_1_plan' || step === 'stage_2_plan')
    return field === 'scope' ? { target: 'scope', limit: 2000 } : null;
  return FIELDS.some((known) => known === field)
    ? { target: field, limit: 2000 }
    : null;
}

function preparationQuery(value: unknown, stage: boolean) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid draft preparation.');
  const query = Object.fromEntries(Object.entries(value));
  if (
    Object.keys(query).some(
      (k) =>
        !['caseId', 'expectedRevision', ...(stage ? ['step'] : [])].includes(k),
    ) ||
    typeof query.expectedRevision !== 'string' ||
    !/^[1-9]\d{0,9}$/u.test(query.expectedRevision)
  )
    throw new BadRequestException('Invalid draft preparation.');
  const expectedRevision = Number(query.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision >= 2147483647)
    throw new BadRequestException('Invalid draft revision.');
  const step =
    query.step === 'stage_1_plan' ||
    query.step === 'stage_2_plan' ||
    query.step === 'stage_1_report' ||
    query.step === 'stage_2_report'
      ? query.step
      : undefined;
  if (stage && !step) throw new BadRequestException('Invalid draft step.');
  return { caseId: requireUuid(query.caseId), expectedRevision, step };
}
