import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import { inputObject } from './certification.validation.js';

export const TEAM_ROLES = [
  'team_leader',
  'auditor',
  'technical_expert',
  'observer',
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export interface ImpartialityDeclarations {
  noConsultancy: boolean;
  noEmployment: boolean;
  noManagementInvolvement: boolean;
  confidentiality: boolean;
}

export interface TeamMember {
  name: string;
  role: TeamRole;
  workspaceMembershipId: string | null;
  holdsCategory: boolean;
  competenceNote: string;
  declarations: ImpartialityDeclarations;
  conflictNote: string | null;
}

export interface AuditTeam {
  members: TeamMember[];
}

export type TeamDecision = { teamVersion: number } & (
  | { decision: 'approved'; reason: null }
  | { decision: 'returned'; reason: string }
);

const DECLARATIONS = [
  'noConsultancy',
  'noEmployment',
  'noManagementInvolvement',
  'confidentiality',
] as const;

/** Validates both submitted and persisted teams against the composition rules. */
export function auditTeam(value: unknown): AuditTeam {
  const body = inputObject(value, ['members']);
  if (
    !Array.isArray(body.members) ||
    body.members.length < 1 ||
    body.members.length > 10
  )
    return invalid();
  const members = body.members.map(member);
  const links = members.flatMap((entry) =>
    entry.workspaceMembershipId ? [entry.workspaceMembershipId] : [],
  );
  if (new Set(links).size !== links.length) return invalid();
  const leaders = members.filter((entry) => entry.role === 'team_leader');
  const [leader] = leaders;
  if (leaders.length !== 1 || !leader)
    throw rule(
      'CERTIFICATION_TEAM_LEADER',
      'A team has exactly one team leader.',
    );
  const competent = members.filter(
    (entry) => entry.role !== 'observer' && entry.holdsCategory,
  );
  const expertWithCategory = members.some(
    (entry) => entry.role === 'technical_expert' && entry.holdsCategory,
  );
  if (!competent.length || (!leader.holdsCategory && !expertWithCategory))
    throw rule(
      'CERTIFICATION_TEAM_CATEGORY',
      'The team must hold the client category; without a team leader holding it, a technical expert who holds it is required.',
    );
  return { members };
}

export function teamCommand(value: unknown): {
  expectedRevision: number;
  reason: string | null;
  team: AuditTeam;
} {
  const body = inputObject(value, ['expectedRevision', 'reason', 'members']);
  return {
    expectedRevision: revision(body.expectedRevision),
    reason: optionalText(body.reason, 2000),
    team: auditTeam({ members: body.members }),
  };
}

export function teamDecisionCommand(value: unknown): {
  expectedRevision: number;
  decision: TeamDecision;
} {
  const body = inputObject(value, [
    'expectedRevision',
    'teamVersion',
    'decision',
    'reason',
  ]);
  return {
    expectedRevision: revision(body.expectedRevision),
    decision: teamDecision({
      teamVersion: body.teamVersion,
      decision: body.decision,
      reason: body.reason,
    }),
  };
}

/** Validates both submitted and persisted team decisions. */
export function teamDecision(value: unknown): TeamDecision {
  const body = inputObject(value, ['teamVersion', 'decision', 'reason']);
  const teamVersion = revision(body.teamVersion);
  if (body.decision === 'approved') {
    if (body.reason !== undefined && body.reason !== null) return invalid();
    return { teamVersion, decision: 'approved', reason: null };
  }
  if (body.decision !== 'returned') return invalid();
  return { teamVersion, decision: 'returned', reason: text(body.reason, 2000) };
}

/** Every declaration of every member confirms the absence of conflict. */
export function teamWithoutConflict(team: AuditTeam): boolean {
  return team.members.every((entry) =>
    DECLARATIONS.every((declaration) => entry.declarations[declaration]),
  );
}

export function teamMembershipIds(team: AuditTeam): string[] {
  return team.members.flatMap((entry) =>
    entry.workspaceMembershipId ? [entry.workspaceMembershipId] : [],
  );
}

function member(value: unknown): TeamMember {
  const body = inputObject(value, [
    'name',
    'role',
    'workspaceMembershipId',
    'holdsCategory',
    'competenceNote',
    'declarations',
    'conflictNote',
  ]);
  const role = TEAM_ROLES.find((entry) => entry === body.role);
  if (!role || typeof body.holdsCategory !== 'boolean') return invalid();
  const declarationsBody = inputObject(body.declarations, DECLARATIONS);
  const declarations: ImpartialityDeclarations = {
    noConsultancy: flag(declarationsBody.noConsultancy),
    noEmployment: flag(declarationsBody.noEmployment),
    noManagementInvolvement: flag(declarationsBody.noManagementInvolvement),
    confidentiality: flag(declarationsBody.confidentiality),
  };
  const conflict = DECLARATIONS.some((name) => !declarations[name]);
  const conflictNote = optionalText(body.conflictNote, 1000);
  if (conflict !== (conflictNote !== null))
    throw rule(
      'CERTIFICATION_TEAM_CONFLICT_NOTE',
      'Describe the conflict when a declaration is not confirmed, and only then.',
    );
  return {
    name: text(body.name, 200),
    role,
    workspaceMembershipId:
      body.workspaceMembershipId === undefined ||
      body.workspaceMembershipId === null
        ? null
        : requireUuid(body.workspaceMembershipId),
    holdsCategory: body.holdsCategory,
    competenceNote: text(body.competenceNote, 1000),
    declarations,
    conflictNote,
  };
}

/** An explicit boolean: a declaration never defaults. */
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') return invalid();
  return value;
}

function revision(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2147483646
  )
    return invalid();
  return value;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    return invalid();
  return value;
}

function optionalText(value: unknown, limit: number): string | null {
  return value === undefined || value === null ? null : text(value, limit);
}

function rule(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}

function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_CERTIFICATION_INPUT',
    message: 'Invalid certification input.',
  });
}
