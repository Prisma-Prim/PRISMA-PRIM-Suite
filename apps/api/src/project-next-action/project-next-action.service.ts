import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import {
  runKeyedCommand,
  staleVersionConflict,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import { ProjectService } from '../project/project.service.js';
import { isOpenProjectStatus } from '../project/project-status.js';
import {
  MAX_NEXT_ACTION_REVISION,
  NEXT_ACTION_KEY_MAX_LENGTH,
  nextActionInput,
  nextActionQuery,
} from './project-next-action.input.js';
import { ProjectNextActionStore } from './project-next-action.store.js';
import type {
  NextActionReceipt,
  NextActionScope,
} from './project-next-action.types.js';

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
          await this.authorization.requirePermissions(actor, {
            permissions: ['project.read'],
            lock: false,
          });
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
    const input = nextActionInput(body);
    const intent = (scope: NextActionScope) => ({
      format: 'project-next-action-command-v1',
      companyId: scope.companyId,
      projectId: scope.projectId,
      ...input,
    });
    return runKeyedCommand(this.database, {
      name: 'project.next-action.command',
      actor,
      key,
      maxKeyLength: NEXT_ACTION_KEY_MAX_LENGTH,
      authorize: async () => {
        await this.authorization.requirePermissions(actor, {
          permissions: ['project.read'],
          lock: true,
        });
        await this.clients.requireCapturedReferenceReadAuthorityWithinTransaction(
          actor,
        );
        const capture = (
          await this.authorization.requirePermissions(actor, {
            permissions: ['project.next_action.update'],
            lock: true,
          })
        ).grant('project.next_action.update');
        const { project, scope } = await this.context(actor, projectId);
        return { project, scope, assignmentId: capture.assignmentId };
      },
      findReceipt: ({ key: used }) => this.store.receipt(actor, used),
      // Receipts record their intent as its JSON spelling.
      recordedIntent: (receipt): unknown => JSON.parse(receipt.fingerprint),
      intent: ({ scope: { scope } }) => intent(scope),
      replay: ({ scope: { scope }, receipt }) =>
        this.store.replay(scope, receipt),
      execute: async ({
        scope: { project, scope, assignmentId },
        key: used,
      }) => {
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
          throw staleVersionConflict('Reload the current next action.');
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
            assignmentId,
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
          assignmentId,
          key: used,
          fingerprint: JSON.stringify(intent(scope)),
          response,
          clientUseVersion:
            client.version + (response.outcome === 'changed' ? 1 : 0),
          occurredAt,
        });
        return response;
      },
    }).catch(unavailable);
  }
}
function unavailable(error: unknown): never {
  if (error instanceof HttpException) throw error;
  throw new InternalServerErrorException('Project next action is unavailable.');
}
