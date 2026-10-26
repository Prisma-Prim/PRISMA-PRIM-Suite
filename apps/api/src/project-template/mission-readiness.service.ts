import { Injectable } from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { ProjectService } from '../project/project.service.js';
import { TaskResultsService } from '../task/task-results.service.js';
import { PILOT_TEMPLATE_KEY } from './project-pilot-plan.definition.js';
import { ProjectTemplateService } from './project-template.service.js';

type ReadinessTask = Awaited<
  ReturnType<TaskResultsService['readinessWithinTransaction']>
>;
function missionActivityState({ task, result }: ReadinessTask) {
  switch (task.status) {
    case 'todo':
    case 'in_progress':
    case 'blocked':
      return 'WORK_OPEN';
    case 'cancelled':
      return 'WORK_CANCELLED';
    case 'done':
      return result.kind === 'unavailable'
        ? 'EVIDENCE_UNAVAILABLE'
        : result.current === null
          ? 'RESULT_NOT_RECORDED'
          : 'RECORDED_RESULT_NOT_REVIEWED';
    default: {
      const exhaustive: never = task;
      return exhaustive;
    }
  }
}

/** Composes public owners; it neither qualifies evidence nor changes mission completion. */
@Injectable()
export class MissionReadinessService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly templates: ProjectTemplateService,
    private readonly projects: ProjectService,
    private readonly results: TaskResultsService,
  ) {}

  async read(actor: ActorContext, projectId: string) {
    return this.database.transaction(
      () => this.readWithinTransaction(actor, projectId),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /** Caller owns the snapshot when composing governed mission evidence. */
  async readWithinTransaction(actor: ActorContext, projectId: string) {
    const { template } = await this.templates.readWithinTransaction(
      actor,
      projectId,
    );
    if (!template || template.templateKey !== PILOT_TEMPLATE_KEY)
      return { assessment: null };
    if (
      template.version !== 1 ||
      template.activities.length !== 13 ||
      new Set(template.activities.map((row) => row.taskId)).size !== 13
    )
      throw new Error('Invalid stored mission activity mapping.');
    const project = await this.projects.read(actor, projectId);
    const activities = [];
    for (const activity of template.activities) {
      const current = await this.results.readinessWithinTransaction(
        actor,
        activity.taskId,
      );
      if (current.task.projectId !== projectId)
        throw new Error('Invalid stored mission Task Project.');
      activities.push({
        key: activity.key,
        title: activity.title,
        activity: activity.activity,
        intendedResult: activity.intendedResult,
        task: {
          id: current.task.id,
          title: current.task.title,
          status: current.task.status,
          version: current.task.version,
        },
        result: current.result,
        state: missionActivityState(current),
      });
    }
    return {
      assessment: {
        kind: 'DIAGNOSTIC_ONLY' as const,
        project: { id: project.id, status: project.status },
        source: {
          templateKey: template.templateKey,
          version: template.version,
          title: template.title,
        },
        clarification: {
          state: 'BUSINESS_CLARIFICATION_PENDING' as const,
          questionId: 'MISSION-CLOSE-01' as const,
        },
        activities,
      },
    };
  }
}
