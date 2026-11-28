import type { ActorContext } from '../../access-types';
import type { CompanyGrantBundle } from '../../access/company-grants';
import {
  companyGrants,
  type CompanyGrantRequest,
} from '../../access/company-grants.test-fixture';

/**
 * A small stateful Ideas and Operational Risk API over fictional records,
 * shared by the Clarté Improvement App tests and browser journey (#1545).
 * It answers only what the slice reads and writes; every other request is
 * reported as unhandled.
 */

export const clarteImprovementCompany = {
  id: '00000000-0000-4000-8000-000000001545',
  displayName: 'PRISMA-PRIM',
};
const ada = {
  internalUserId: '00000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
  displayName: 'Ada Ionescu',
};
const boris = {
  internalUserId: '00000000-0000-4000-8000-000000000011',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000012',
  displayName: 'Boris Lungu',
};

const improvementGrants: readonly CompanyGrantRequest[] = [
  {
    bundle: 'company_ideas_reader',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001920',
  },
  {
    bundle: 'company_ideas_recorder',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001921',
  },
  {
    bundle: 'company_ideas_reviewer',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001922',
  },
  {
    bundle: 'company_operational_risk_reader',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001923',
  },
  {
    bundle: 'company_operational_risk_recorder',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001924',
  },
];

/**
 * A fictional member holding every Ideas and Operational Risk grant, less
 * the bundles named in `without`.
 */
export function clarteImprovementActor(
  without: readonly CompanyGrantBundle[] = [],
): ActorContext {
  return {
    internalUserId: ada.internalUserId,
    workspaceMembershipId: ada.workspaceMembershipId,
    workspaceId: '00000000-0000-4000-8000-000000000003',
    workspaceName: 'PRISMA Workspace',
    displayName: ada.displayName,
    email: 'ada@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...clarteImprovementCompany,
      grants: companyGrants(
        ...improvementGrants.filter((grant) => !without.includes(grant.bundle)),
      ),
    },
  };
}

/** The fictional Ideas the API starts with, newest first. */
export const seededIdeas = {
  glossary: {
    id: '00000000-0000-4000-8000-000000002501',
    description:
      'Shared glossary for audit reports\nOne list of terms per standard, kept beside the report template.',
    origin: 'Remark from a fictional lead auditor',
  },
  checklist: {
    id: '00000000-0000-4000-8000-000000002502',
    description: 'Bilingual checklist for opening meetings',
    origin: 'Fictional client feedback',
  },
  summary: {
    id: '00000000-0000-4000-8000-000000002503',
    description: 'Printed summary sheet for every certificate',
    origin: 'Team meeting',
  },
} as const;
/** The id the fixture gives the n-th Idea recorded through it, from 1. */
export function recordedIdeaId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(2600 + sequence).padStart(12, '0')}`;
}

/** The fictional Operational Risks the API starts with. */
export const seededRisks = {
  calibration: {
    id: '00000000-0000-4000-8000-000000003501',
    facts: {
      process: 'Calibration of measuring equipment',
      cause: 'The calibration supplier moved its yearly schedule',
      effect: 'Instruments used after their calibration date',
      plannedMeasure: 'Book calibration slots one quarter ahead',
      existingMeasures: 'Manual calendar kept by the quality lead',
      sourceDescription: 'Fictional internal audit finding',
      plannedDate: '2027-03-31',
    },
  },
  archiving: {
    id: '00000000-0000-4000-8000-000000003502',
    facts: {
      process: 'Archiving of signed contracts',
      cause: 'Paper copies are kept in two offices',
      effect: 'A signed copy cannot be found on request',
      plannedMeasure: 'Scan every signed contract on receipt',
      existingMeasures: null,
      sourceDescription: null,
      plannedDate: null,
    },
  },
} as const;
/** The calibration Risk's first log note and the correction of its statement. */
export const seededJournal = {
  original: {
    id: '00000000-0000-4000-8000-000000003511',
    narrative: 'Calibration slots requested for February',
  },
  correction: {
    id: '00000000-0000-4000-8000-000000003512',
    narrative: 'Calibration slots requested for March',
    reason: 'The supplier confirmed March, not February',
  },
} as const;
/** The id the fixture gives the n-th Risk entry recorded through it, from 1. */
export function recordedEntryId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(3600 + sequence).padStart(12, '0')}`;
}
/** The id the fixture gives the n-th Risk recorded through it, from 1. */
export function recordedRiskId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(3700 + sequence).padStart(12, '0')}`;
}

type Attribution = typeof ada;
type IdeaKind = 'new' | 'deferred' | 'rejected';
type Disposition = {
  id: string;
  ideaId: string;
  precedingRevision: number;
  revision: number;
  kind: 'deferred' | 'rejected';
  reason: string;
  reconsiderationDate: string | null;
  recordedBy: Attribution;
  recordedAt: string;
};
type IdeaState = {
  id: string;
  description: string;
  origin: string;
  submittedBy: Attribution;
  submittedAt: string;
  dispositions: Disposition[];
};
type Facts = {
  process: string;
  cause: string;
  effect: string;
  plannedMeasure: string;
  existingMeasures: string | null;
  sourceDescription: string | null;
  plannedDate: string | null;
};
type EntryActor = { workspaceMembershipId: string; displayName: string };
type RiskEntry = {
  id: string;
  revision: number;
  actor: EntryActor;
  recordedAt: string;
} & (
  | {
      kind: 'intake-recorded' | 'intake-corrected';
      facts: Facts;
      predecessorId: string | null;
      reason: string | null;
    }
  | {
      kind: 'observation' | 'reassessment';
      narrative: string;
      occurredOn: string | null;
    }
  | {
      kind: 'journal-corrected';
      originalEntryId: string;
      journalKind: 'observation' | 'reassessment';
      predecessorId: string;
      narrative: string;
      occurredOn: string | null;
      reason: string;
    }
);
type RiskState = { id: string; entries: RiskEntry[] };

export type FakeRequest = Readonly<{
  method: string;
  url: URL;
  body: unknown;
}>;
export type FakeReply = Readonly<{ status: number; json: unknown }>;
type Status = 401 | 403 | 404 | 500;

export type ClarteImprovementApiOptions = Readonly<{
  actor?: ActorContext;
  /** No seeded Ideas or Risks: the empty states. */
  empty?: boolean;
  /** Every Ideas list read answers this status. */
  ideasListStatus?: Status;
  /** Every Risk register read answers this status. */
  risksListStatus?: Status;
  /** Older fictional Ideas after the seeded ones, to page the list by 25. */
  olderIdeas?: number;
  /** Risks per register page; the API's own pages hold up to 50. */
  riskPageSize?: number;
}>;

/** The API pages Ideas by 25; a cursor here is the next row's offset. */
const ideaPageSize = 25;
function page<Row>(rows: readonly Row[], cursor: string | null, size: number) {
  const start = cursor === null ? 0 : Number(cursor);
  const end = start + size;
  return {
    rows: rows.slice(start, end),
    next: end < rows.length ? String(end) : null,
  };
}

const at = (minute: number) =>
  new Date(Date.UTC(2026, 10, 20, 8, minute)).toISOString();
const entryActor = (who: Attribution): EntryActor => ({
  workspaceMembershipId: who.workspaceMembershipId,
  displayName: who.displayName,
});

export function createClarteImprovementApi(
  options: ClarteImprovementApiOptions = {},
) {
  const actor = options.actor ?? clarteImprovementActor();
  const companyId = clarteImprovementCompany.id;
  const writes: string[] = [];
  const unhandled = new Set<string>();
  let clock = 100;
  let ideaSequence = 0;
  let entrySequence = 0;
  let riskSequence = 0;
  const now = () => at(clock++);

  const ideas: IdeaState[] = options.empty
    ? []
    : [
        {
          ...seededIdeas.glossary,
          submittedBy: ada,
          submittedAt: at(30),
          dispositions: [],
        },
        {
          ...seededIdeas.checklist,
          submittedBy: boris,
          submittedAt: at(20),
          dispositions: [
            {
              id: '00000000-0000-4000-8000-000000002511',
              ideaId: seededIdeas.checklist.id,
              precedingRevision: 1,
              revision: 2,
              kind: 'deferred',
              reason: 'Revisit after the January audits',
              reconsiderationDate: '2027-02-15',
              recordedBy: ada,
              recordedAt: at(25),
            },
          ],
        },
        {
          ...seededIdeas.summary,
          submittedBy: boris,
          submittedAt: at(10),
          dispositions: [
            {
              id: '00000000-0000-4000-8000-000000002512',
              ideaId: seededIdeas.summary.id,
              precedingRevision: 1,
              revision: 2,
              kind: 'rejected',
              reason: 'The certificate already carries this summary',
              reconsiderationDate: null,
              recordedBy: ada,
              recordedAt: at(15),
            },
          ],
        },
        ...Array.from(
          { length: options.olderIdeas ?? 0 },
          (_, index): IdeaState => ({
            id: `00000000-0000-4000-8000-${String(2800 + index).padStart(12, '0')}`,
            description: `Older fictional Idea ${index + 1}`,
            origin: 'Fictional suggestion box',
            submittedBy: boris,
            submittedAt: new Date(
              Date.UTC(2026, 9, 1, 8, 0) - index * 60_000,
            ).toISOString(),
            dispositions: [],
          }),
        ),
      ];

  const calibrationIntake: RiskEntry = {
    id: '00000000-0000-4000-8000-000000003510',
    revision: 1,
    actor: entryActor(boris),
    recordedAt: at(40),
    kind: 'intake-recorded',
    facts: { ...seededRisks.calibration.facts },
    predecessorId: null,
    reason: null,
  };
  const archivingIntake: RiskEntry = {
    id: '00000000-0000-4000-8000-000000003520',
    revision: 1,
    actor: entryActor(ada),
    recordedAt: at(50),
    kind: 'intake-recorded',
    facts: { ...seededRisks.archiving.facts },
    predecessorId: null,
    reason: null,
  };
  const risks: RiskState[] = options.empty
    ? []
    : [
        {
          id: seededRisks.archiving.id,
          entries: [archivingIntake],
        },
        {
          id: seededRisks.calibration.id,
          entries: [
            calibrationIntake,
            {
              id: seededJournal.original.id,
              revision: 2,
              actor: entryActor(boris),
              recordedAt: at(42),
              kind: 'observation',
              narrative: seededJournal.original.narrative,
              occurredOn: '2026-11-18',
            },
            {
              id: seededJournal.correction.id,
              revision: 3,
              actor: entryActor(ada),
              recordedAt: at(44),
              kind: 'journal-corrected',
              originalEntryId: seededJournal.original.id,
              journalKind: 'observation',
              predecessorId: seededJournal.original.id,
              narrative: seededJournal.correction.narrative,
              occurredOn: '2026-11-18',
              reason: seededJournal.correction.reason,
            },
          ],
        },
      ];

  const ok = (json: unknown, status = 200): FakeReply => ({ status, json });
  const refuse = (status: number, json: unknown = {}): FakeReply => ({
    status,
    json,
  });

  // Ideas
  function ideaRow(idea: IdeaState) {
    const latest = idea.dispositions.at(-1);
    const kind: IdeaKind = latest?.kind ?? 'new';
    return {
      id: idea.id,
      companyId,
      description: idea.description,
      origin: idea.origin,
      revision: idea.dispositions.length + 1,
      disposition: kind,
      submittedBy: idea.submittedBy,
      submittedAt: idea.submittedAt,
    };
  }
  function ideasReply(request: FakeRequest): FakeReply | undefined {
    const path = request.url.pathname;
    if (path === '/api/ideas' && request.method === 'GET') {
      if (options.ideasListStatus) return refuse(options.ideasListStatus);
      const sorted = [...ideas].sort((left, right) =>
        left.submittedAt === right.submittedAt
          ? right.id.localeCompare(left.id)
          : right.submittedAt.localeCompare(left.submittedAt),
      );
      const listed = page(
        sorted,
        request.url.searchParams.get('cursor'),
        ideaPageSize,
      );
      return ok({
        companyId,
        ideas: listed.rows.map(ideaRow),
        total: sorted.length,
        nextCursor: listed.next,
      });
    }
    if (path === '/api/ideas' && request.method === 'POST') {
      const body = record(request.body);
      const description = text(body.description);
      const origin = text(body.origin);
      if (!description || !origin) return refuse(400);
      ideaSequence += 1;
      const idea: IdeaState = {
        id: recordedIdeaId(ideaSequence),
        description,
        origin,
        submittedBy: ada,
        submittedAt: now(),
        dispositions: [],
      };
      ideas.push(idea);
      return ok(ideaRow(idea), 201);
    }
    const match = /^\/api\/ideas\/([^/]+)(\/dispositions)?$/u.exec(path);
    const idea = ideas.find((candidate) => candidate.id === match?.[1]);
    if (!match) return undefined;
    if (!idea) return refuse(404);
    if (!match[2]) return ok(ideaRow(idea));
    if (request.method === 'GET')
      return ok({
        ideaId: idea.id,
        entries: [...idea.dispositions].reverse(),
        total: idea.dispositions.length,
        nextCursor: null,
      });
    const body = record(request.body);
    const revision = idea.dispositions.length + 1;
    if (body.expectedRevision !== revision)
      return refuse(409, { code: 'STALE_VERSION' });
    const reason = text(body.reason);
    const kind = body.kind;
    if (!reason || (kind !== 'deferred' && kind !== 'rejected'))
      return refuse(400);
    const entry: Disposition = {
      id: `00000000-0000-4000-8000-${String(2700 + writes.length).padStart(12, '0')}`,
      ideaId: idea.id,
      precedingRevision: revision,
      revision: revision + 1,
      kind,
      reason,
      reconsiderationDate:
        kind === 'deferred' && typeof body.reconsiderationDate === 'string'
          ? body.reconsiderationDate
          : null,
      recordedBy: ada,
      recordedAt: now(),
    };
    idea.dispositions.push(entry);
    return ok({ idea: ideaRow(idea), entry }, 201);
  }

  // Operational Risks
  function intakeOf(risk: RiskState) {
    const intakes = risk.entries.filter(
      (entry) =>
        entry.kind === 'intake-recorded' || entry.kind === 'intake-corrected',
    );
    const original = intakes[0];
    const current = intakes.at(-1);
    if (!original || !current) throw new Error('A Risk without intake.');
    return { original, current };
  }
  function riskRecord(risk: RiskState) {
    const { original, current } = intakeOf(risk);
    return {
      id: risk.id,
      companyId,
      revision: risk.entries.length,
      assessment: 'not-assessed',
      responsibility: 'not-specified',
      createdAt: original.recordedAt,
      originalIntake: original,
      currentIntake: current,
    };
  }
  function riskSummary(risk: RiskState) {
    const { original, current } = intakeOf(risk);
    if (
      current.kind !== 'intake-recorded' &&
      current.kind !== 'intake-corrected'
    )
      throw new Error('A Risk intake without facts.');
    return {
      id: risk.id,
      companyId,
      revision: risk.entries.length,
      process: current.facts.process,
      createdAt: original.recordedAt,
    };
  }
  function statement(risk: RiskState, originalId: string) {
    const original = risk.entries.find((entry) => entry.id === originalId);
    if (
      !original ||
      (original.kind !== 'observation' && original.kind !== 'reassessment')
    )
      return undefined;
    const corrections = risk.entries.filter(
      (entry) =>
        entry.kind === 'journal-corrected' &&
        entry.originalEntryId === originalId,
    );
    return {
      riskId: risk.id,
      companyId,
      revision: risk.entries.length,
      originalEntry: original,
      currentEntry: corrections.at(-1) ?? original,
    };
  }
  function facts(body: Record<string, unknown>): Facts | undefined {
    const process = text(body.process);
    const cause = text(body.cause);
    const effect = text(body.effect);
    const plannedMeasure = text(body.plannedMeasure);
    if (!process || !cause || !effect || !plannedMeasure) return undefined;
    return {
      process,
      cause,
      effect,
      plannedMeasure,
      existingMeasures: text(body.existingMeasures) ?? null,
      sourceDescription: text(body.sourceDescription) ?? null,
      plannedDate:
        typeof body.plannedDate === 'string' ? body.plannedDate : null,
    };
  }
  function append(risk: RiskState, entry: RiskEntry): FakeReply {
    risk.entries.push(entry);
    return ok({ risk: riskRecord(risk), entry }, 201);
  }
  function nextEntry() {
    entrySequence += 1;
    return {
      id: recordedEntryId(entrySequence),
      actor: entryActor(ada),
      recordedAt: now(),
    };
  }
  function risksReply(request: FakeRequest): FakeReply | undefined {
    const path = request.url.pathname;
    if (path === '/api/operational-risks' && request.method === 'GET') {
      if (options.risksListStatus) return refuse(options.risksListStatus);
      const listed = page(
        [...risks]
          .sort((left, right) =>
            riskSummary(right).createdAt.localeCompare(
              riskSummary(left).createdAt,
            ),
          )
          .map(riskSummary),
        request.url.searchParams.get('cursor'),
        options.riskPageSize ?? 50,
      );
      return ok({ items: listed.rows, next_cursor: listed.next });
    }
    if (path === '/api/operational-risks' && request.method === 'POST') {
      const recorded = facts(record(request.body));
      if (!recorded) return refuse(400);
      riskSequence += 1;
      const risk: RiskState = { id: recordedRiskId(riskSequence), entries: [] };
      risks.push(risk);
      return append(risk, {
        ...nextEntry(),
        revision: 1,
        kind: 'intake-recorded',
        facts: recorded,
        predecessorId: null,
        reason: null,
      });
    }
    const match =
      /^\/api\/operational-risks\/([^/]+)(?:\/(history|intake-corrections|journal)(?:\/([^/]+)(\/corrections)?)?)?$/u.exec(
        path,
      );
    if (!match) return undefined;
    const risk = risks.find((candidate) => candidate.id === match[1]);
    if (!risk) return refuse(404);
    const [, , collection, journalId, corrections] = match;
    if (!collection) return ok(riskRecord(risk));
    if (collection === 'history')
      return ok({ items: [...risk.entries].reverse(), next_cursor: null });
    if (collection === 'journal' && journalId && request.method === 'GET') {
      const read = statement(risk, journalId);
      return read ? ok(read) : refuse(404);
    }
    const body = record(request.body);
    if (body.expectedRevision !== risk.entries.length)
      return refuse(409, { code: 'STALE_VERSION' });
    const revision = risk.entries.length + 1;
    if (collection === 'intake-corrections') {
      const corrected = facts(body);
      const reason = text(body.reason);
      if (!corrected || !reason) return refuse(400);
      return append(risk, {
        ...nextEntry(),
        revision,
        kind: 'intake-corrected',
        facts: corrected,
        predecessorId: intakeOf(risk).current.id,
        reason,
      });
    }
    const narrative = text(body.narrative);
    const occurredOn =
      typeof body.occurredOn === 'string' ? body.occurredOn : null;
    if (!narrative) return refuse(400);
    if (collection === 'journal' && !journalId) {
      if (body.kind !== 'observation' && body.kind !== 'reassessment')
        return refuse(400);
      return append(risk, {
        ...nextEntry(),
        revision,
        kind: body.kind,
        narrative,
        occurredOn,
      });
    }
    const read = journalId && corrections && statement(risk, journalId);
    const reason = text(body.reason);
    if (!read || !reason) return refuse(404);
    if (
      read.originalEntry.kind !== 'observation' &&
      read.originalEntry.kind !== 'reassessment'
    )
      return refuse(404);
    return append(risk, {
      ...nextEntry(),
      revision,
      kind: 'journal-corrected',
      originalEntryId: read.originalEntry.id,
      journalKind: read.originalEntry.kind,
      predecessorId: read.currentEntry.id,
      narrative,
      occurredOn,
      reason,
    });
  }

  function reply(request: FakeRequest): FakeReply {
    const path = request.url.pathname;
    if (request.method !== 'GET') writes.push(`${request.method} ${path}`);
    if (path === '/api/access/current-actor') return ok(actor);
    if (path === '/api/companies') return ok([clarteImprovementCompany]);
    if (path === '/api/activity-log') return ok({ events: [] });
    if (path === '/api/operational-home')
      return ok({ companyId, today: '2026-11-27', summaries: [] });
    const answer = ideasReply(request) ?? risksReply(request);
    if (answer) return answer;
    unhandled.add(`${request.method} ${path}`);
    return refuse(404);
  }

  return { reply, writes, unhandled };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}
