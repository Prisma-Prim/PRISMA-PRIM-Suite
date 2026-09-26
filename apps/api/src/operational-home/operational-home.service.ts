import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { ClientService } from '../client/client.service.js';
import { operationalDate } from '../clock/operational-date.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { DatabaseContext } from '../database/database-context.js';
import { ProjectService } from '../project/project.service.js';
import { TaskService } from '../task/task.service.js';
import {
  COMPANY_SUMMARY_KINDS,
  type CompanySummary,
  type CompanySummaryKind,
  type OperationalHomeView,
} from './operational-home.types.js';

/**
 * Composes the public reads of the Client, Project and Task capabilities into
 * the active-Company operational home (Operational Dashboard PRD §17). It owns
 * no business rule beyond composition, stores nothing and records nothing.
 */
@Injectable()
export class OperationalHomeService {
  constructor(
    private readonly database: DatabaseContext,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
    private readonly clients: ClientService,
    private readonly projects: ProjectService,
    private readonly tasks: TaskService,
  ) {}

  async read(
    actor: ActorContext,
    query: unknown,
  ): Promise<OperationalHomeView> {
    requireNoQueryParameter(query);
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    // One sampled instant and one snapshot serve every count of this read.
    const today = operationalDate(this.clock.now());
    const counts: Record<CompanySummaryKind, () => Promise<number>> = {
      active_clients: async () =>
        (await this.clients.query(actor, { kind: 'active-company-list' }))
          .length,
      open_projects: () => this.projects.countOpen(actor),
      overdue_tasks: async () =>
        (
          await this.tasks.readCompanyOverdueTasks(actor, {
            today,
            rowLimit: 0,
          })
        ).total,
    };
    return this.database.transaction(
      async () => {
        const summaries: CompanySummary[] = [];
        for (const kind of COMPANY_SUMMARY_KINDS) {
          const result = await whenPermitted(counts[kind]);
          if (result.permitted) summaries.push({ kind, count: result.value });
        }
        if (summaries.length === 0) throw new ForbiddenException();
        return { companyId, today, summaries };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
}

type Permitted<T> = { permitted: true; value: T } | { permitted: false };

/**
 * Runs an owning module's read and reports only its authority refusal as
 * absence, so each summary is shown exactly when that read, evaluated live by
 * its own predicate, would answer the reader. Any other failure propagates.
 */
async function whenPermitted<T>(read: () => Promise<T>): Promise<Permitted<T>> {
  try {
    return { permitted: true, value: await read() };
  } catch (error: unknown) {
    if (error instanceof ForbiddenException) return { permitted: false };
    throw error;
  }
}

function requireNoQueryParameter(value: unknown): void {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.keys(value).length > 0
  )
    throw new BadRequestException(
      'The operational home takes no query parameter.',
    );
}
