import { ConflictException, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { ProjectTemplateVersionService } from './project-template-version.service.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import type { ActorContext } from '../access/access.types.js';
import { ProjectTemplateAccessService } from '../access/project-template-access.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  projectTemplateInstances,
  projectTemplateTaskCopies,
} from '../database/schema/project-template.js';
import { ProjectService } from '../project/project.service.js';
import { TaskService } from '../task/task.service.js';
import {
  readTemplateSnapshot,
  templateCreationInput,
} from './project-template.definition.js';

@Injectable()
export class ProjectTemplateService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: ProjectTemplateAccessService,
    private readonly versions: ProjectTemplateVersionService,
    private readonly projects: ProjectService,
    private readonly tasks: TaskService,
  ) {}

  async create(actor: ActorContext, body: unknown, key: string | undefined) {
    const input = templateCreationInput(body);
    const idempotencyKey = requireIdempotencyKey(key);
    return this.database.transaction(async () => {
      const companyId = await this.access.requireActor(actor, {
        instantiate: true,
        lock: true,
      });
      const fingerprint = JSON.stringify({ companyId, ...input });
      const lock = JSON.stringify([
        'project.from_template',
        actor.workspaceId,
        actor.workspaceMembershipId,
        idempotencyKey,
      ]);
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))`,
      );
      const [existing] = await this.database.connection
        .select()
        .from(projectTemplateInstances)
        .where(
          and(
            eq(projectTemplateInstances.workspaceId, actor.workspaceId),
            eq(
              projectTemplateInstances.createdByMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(projectTemplateInstances.idempotencyKey, idempotencyKey),
          ),
        );
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new ConflictException(
            'Idempotency-Key was already used for another Template creation intent.',
          );
        // Confirm the original identity using current read facts, even after
        // Project closure or original Client supersession; never copy again.
        return this.projects.read(actor, existing.projectId);
      }
      const source = await this.versions.sourceWithinTransaction({
        actor,
        companyId,
        version: input.templateVersion,
      });
      const project = await this.projects.createNewWithinTransaction(
        actor,
        {
          title: input.title,
          clientAccountId: input.clientAccountId,
        },
        idempotencyKey,
      );
      const copied = await this.tasks.createTemplateCopiesWithinTransaction({
        actor,
        projectId: project.id,
        titles: source.stages.flatMap((stage) =>
          stage.tasks.map((task) => task.title),
        ),
      });
      await this.database.connection.insert(projectTemplateInstances).values({
        projectId: project.id,
        workspaceId: actor.workspaceId,
        companyId,
        clientAccountId: project.clientAccountId,
        createdByMembershipId: actor.workspaceMembershipId,
        idempotencyKey,
        fingerprint,
        snapshot: source,
      });
      await this.database.connection.insert(projectTemplateTaskCopies).values(
        copied.map((task, position) => ({
          workspaceId: actor.workspaceId,
          companyId,
          projectId: project.id,
          taskId: task.id,
          position,
        })),
      );
      return project;
    });
  }

  async read(actor: ActorContext, projectId: string) {
    return this.database.transaction(
      () => this.readWithinTransaction(actor, projectId),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /** The caller owns the snapshot when composing copied-plan progress. */
  async readWithinTransaction(actor: ActorContext, projectId: string) {
    const companyId = await this.access.requireActor(actor, {
      copiedPlan: true,
    });
    await this.projects.read(actor, projectId);
    const [instance] = await this.database.connection
      .select()
      .from(projectTemplateInstances)
      .where(
        and(
          eq(projectTemplateInstances.workspaceId, actor.workspaceId),
          eq(projectTemplateInstances.companyId, companyId),
          eq(projectTemplateInstances.projectId, projectId),
        ),
      );
    if (!instance) return { template: null };
    const snapshot = readTemplateSnapshot(instance.snapshot);
    const copies = await this.database.connection
      .select()
      .from(projectTemplateTaskCopies)
      .where(
        and(
          eq(projectTemplateTaskCopies.workspaceId, actor.workspaceId),
          eq(projectTemplateTaskCopies.companyId, companyId),
          eq(projectTemplateTaskCopies.projectId, projectId),
        ),
      )
      .orderBy(asc(projectTemplateTaskCopies.position));
    const expectedCount = snapshot.stages.reduce(
      (count, stage) => count + stage.tasks.length,
      0,
    );
    if (copies.length !== expectedCount)
      throw new Error('Incomplete stored Project Template Task copies.');
    let position = 0;
    return {
      template: {
        ...snapshot,
        stages: snapshot.stages.map((stage) => ({
          ...stage,
          tasks: stage.tasks.map((task) => {
            const copy = copies[position];
            if (!copy || copy.position !== position)
              throw new Error('Invalid stored Project Template Task order.');
            position += 1;
            return { ...task, taskId: copy.taskId };
          }),
        })),
      },
    };
  }
}
