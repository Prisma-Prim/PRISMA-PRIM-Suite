import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { ProjectService } from '../project/project.service.js';
import { isOpenProjectStatus } from '../project/project-status.js';
import {
  MAX_NEXT_ACTION_REVISION,
  nextActionInput,
  nextActionKey,
  nextActionQuery,
} from './project-next-action.input.js';
import { ProjectNextActionStore } from './project-next-action.store.js';
import type { NextActionReceipt } from './project-next-action.types.js';

@Injectable()
export class ProjectNextActionService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
    private readonly projects: ProjectService,
    private readonly store: ProjectNextActionStore,
    private readonly accountability: AccountabilityService,
  ) {}
  private async context(actor: ActorContext, projectId: string, lock = false) {
    const project = await this.projects.missionContextWithinTransaction({
      actor,
      projectId,
      lock,
    });
    return {
      project,
      scope: {
        workspaceId: actor.workspaceId,
        companyId: project.companyId,
        projectId: project.id,
        originalClientAccountId: project.clientAccountId,
      },
    };
  }
  async read(actor: ActorContext, projectId: string, query: unknown) {
    const before = nextActionQuery(query);
    return this.database
      .transaction(
        async () => {
          await this.authorization.requireProjectReadWithinReadTransaction(
            actor,
          );
          await this.clients.requireReferenceReadAuthorityWithinReadTransaction(
            actor,
          );
          const { scope } = await this.context(actor, projectId);
          return {
            current: await this.store.current(scope),
            history: await this.store.history(scope, before),
          };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      )
      .catch(unavailable);
  }
  async record(
    actor: ActorContext,
    projectId: string,
    body: unknown,
    key: string | undefined,
  ) {
    const input = nextActionInput(body),
      normalizedKey = nextActionKey(key);
    return this.database
      .transaction(async () => {
        await this.database.connection.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['project.next-action.command', actor.workspaceId, actor.workspaceMembershipId, normalizedKey])},0))`,
        );
        await this.authorization.requireCapturedProjectReadWithinTransaction(
          actor,
        );
        await this.clients.requireCapturedReferenceReadAuthorityWithinTransaction(
          actor,
        );
        const capture =
          await this.authorization.requireProjectNextActionCoordinator(actor);
        const { project, scope } = await this.context(actor, projectId);
        const fingerprint = JSON.stringify({
          format: 'project-next-action-command-v1',
          companyId: scope.companyId,
          projectId: scope.projectId,
          ...input,
        });
        const receipt = await this.store.receipt(actor, normalizedKey);
        if (receipt) {
          if (receipt.fingerprint !== fingerprint)
            throw new ConflictException(
              'Idempotency-Key belongs to another next-action intent.',
            );
          return this.store.replay(scope, receipt);
        }
        const client = await this.clients
          .lockActiveReferenceClient(actor, project.clientAccountId)
          .catch((error: unknown) => {
            // The original scoped Project was already established as readable above.
            // Historical Client eligibility invalidates a new intent, never its saved confirmation.
            if (error instanceof NotFoundException)
              throw new ConflictException(
                'The original Client is no longer eligible for a new action.',
              );
            throw error;
          });
        const fresh = await this.context(actor, projectId, true);
        if (
          !isOpenProjectStatus(fresh.project.status) ||
          fresh.project.lifecycleRevision !== input.expectedLifecycleRevision
        )
          throw new ConflictException('Reload the open Project lifecycle.');
        const current = await this.store.current(scope);
        if (current.revision !== input.expectedRevision)
          throw new ConflictException('Reload the current next action.');
        const occurredAt = new Date();
        let response: NextActionReceipt;
        if (current.text === input.text)
          response = this.store.response('unchanged', current);
        else {
          if (client.version === MAX_NEXT_ACTION_REVISION)
            throw new ConflictException('Client revision is exhausted.');
          const record = await this.store.append({
            scope,
            actor,
            assignmentId: capture.assignmentId,
            previous: current,
            text: input.text,
            lifecycleRevision: input.expectedLifecycleRevision,
            clientUseVersion: client.version + 1,
            occurredAt,
          });
          await this.accountability.recordProjectNextActionEvent({
            actor,
            companyId: scope.companyId,
            projectId,
            revision: record.revision,
            occurredAt,
          });
          await this.clients.recordReferenceUse(
            actor,
            scope.originalClientAccountId,
          );
          response = this.store.response('changed', record);
        }
        await this.store.remember({
          actor,
          scope,
          assignmentId: capture.assignmentId,
          key: normalizedKey,
          fingerprint,
          response,
          clientUseVersion:
            client.version + (response.outcome === 'changed' ? 1 : 0),
          occurredAt,
        });
        return response;
      })
      .catch(unavailable);
  }
}
function unavailable(error: unknown): never {
  if (error instanceof HttpException) throw error;
  throw new InternalServerErrorException('Project next action is unavailable.');
}
