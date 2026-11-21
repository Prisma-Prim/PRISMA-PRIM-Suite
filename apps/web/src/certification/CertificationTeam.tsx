import { unexpected } from './certification-command';
import {
  TeamCandidateSearch,
  useTeamCandidates,
} from './CertificationTeamCandidates';
import { useState, type FormEvent } from 'react';
import { formatMessage } from '../localization/messages';
import { type CertificationMessageKey } from './certification.copy';
import {
  decisionFromDraft,
  emptyDecisionDraft,
  linkedToAnyTeamVersion,
  teamDraftFor,
  teamFromDraft,
  type DecisionCheck,
  type DecisionDraft,
  type TeamCheck,
  type TeamDraft,
} from './certification-team-draft';
import { teamWithoutConflict } from './certification-team';
import {
  type CaseDetail,
  type CertificationActorReference,
} from './certification-response';
import { DecisionForm, TeamForm } from './CertificationTeamForms';
import {
  DecisionView,
  TeamView,
  type KnownPeople,
} from './CertificationTeamViews';
import { VersionAttribution } from './CertificationAttribution';

import {
  IDLE,
  retryUncertainCommand,
  reuse,
  blockedUntilReload,
  clearReloadedFeedback,
  describedFeedbackId,
  refusedWith,
  type Intent,
  type Feedback,
} from './certification-command';

import type {
  CertificationCaseView as CaseView,
  CertificationWorkflowContext,
} from './certification-command';

/** A Workspace member the read Case names, offered as a team member link. */
type CasePerson = CertificationActorReference & { self: boolean };
export type TeamKind = 'team' | 'decision';
interface TeamContext extends CertificationWorkflowContext<TeamKind> {
  scope: string;
  selectedId: string | undefined;
  readCandidates: Parameters<typeof useTeamCandidates>[0]['read'];
}
/** Owns the editing and approval of the Case’s audit team across reloads. */
export function useCertificationTeam({
  view,
  actor,
  authority,
  prefix,
  copy,
  commit,
  renderFeedback,
  scope,
  selectedId,
  readCandidates,
}: TeamContext) {
  /** Null until edited: a first team starts with one empty member. */
  const [teamDraft, setTeamDraft] = useState<TeamDraft | null>(null);
  const teamCandidates = useTeamCandidates({
    scope,
    caseId: selectedId,
    enabled: authority.manage,
    linkedIds:
      teamDraft?.members.map((member) => member.workspaceMembershipId) ?? [],
    read: readCandidates,
  });
  /** The user is editing a new team version. */
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamFeedback, setTeamFeedback] = useState<Feedback>(IDLE);
  const [decisionDraft, setDecisionDraft] =
    useState<DecisionDraft>(emptyDecisionDraft);
  const [decisionFeedback, setDecisionFeedback] = useState<Feedback>(IDLE);
  const feedbackIds = {
    team: `${prefix}-team-feedback`,
    decision: `${prefix}-decision-feedback`,
  };
  const feedbackSetters = {
    team: setTeamFeedback,
    decision: setDecisionFeedback,
  };
  const feedback = [teamFeedback, decisionFeedback];
  function execute(kind: TeamKind, intent: Intent) {
    return commit({
      kind,
      intent,
      setFeedback: feedbackSetters[kind],
      confirmed: () => {
        switch (kind) {
          case 'team':
            return resetTeamDraft();
          case 'decision':
            return setDecisionDraft(emptyDecisionDraft());
        }
        return unexpected(kind);
      },
    });
  }
  function reset() {
    resetTeamDraft();
    setTeamFeedback(IDLE);
    setDecisionDraft(emptyDecisionDraft());
    setDecisionFeedback(IDLE);
  }
  function clearRefusals() {
    setTeamFeedback(clearReloadedFeedback);
    setDecisionFeedback(clearReloadedFeedback);
  }
  function feedbackMessage(kind: TeamKind, feedback: Feedback) {
    return renderFeedback({
      kind,
      feedback,
      id: feedbackIds[kind],
      retry: () =>
        retryUncertainCommand(feedback, (intent) => execute(kind, intent)),
    });
  }
  function describedFeedback(kind: TeamKind, feedback: Feedback) {
    return describedFeedbackId(feedback, feedbackIds[kind]);
  }
  function resetTeamDraft() {
    setTeamDraft(null);
    setTeamOpen(false);
  }

  /**
   * The Workspace members the read Case names, the actor first. No member
   * directory is readable under the Certification grants, so a team member
   * can be linked only to a person the Case already shows.
   */
  function casePeople(view: CaseView): CasePerson[] {
    const named = new Map<string, string>();
    const add = (reference: CertificationActorReference) => {
      if (!named.has(reference.workspaceMembershipId))
        named.set(reference.workspaceMembershipId, reference.displayName);
    };
    add(view.caseDetail.openedBy);
    for (const entry of view.timeline.entries) add(entry.recordedBy);
    for (const item of view.register.items) add(item.attachedBy);
    for (const finding of view.caseDetail.findings)
      for (const record of finding.records) add(record.recordedBy);
    named.delete(actor.workspaceMembershipId);
    return [
      {
        workspaceMembershipId: actor.workspaceMembershipId,
        displayName: actor.displayName,
        self: true,
      },
      ...[...named]
        .map(([workspaceMembershipId, displayName]) => ({
          workspaceMembershipId,
          displayName,
          self: false,
        }))
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        ),
    ];
  }

  function knownPeople(view: CaseView): KnownPeople {
    return new Map(
      casePeople(view).map((person) => [
        person.workspaceMembershipId,
        person.displayName,
      ]),
    );
  }

  /**
   * The links a team member may carry: Case people, eligible Company auditors
   * discovered by Access, and links retained by the latest recorded team.
   */
  function linkOptions(view: CaseView): { value: string; label: string }[] {
    const people = casePeople(view).map((person) => ({
      value: person.workspaceMembershipId,
      label: person.self
        ? formatMessage(copy('teamMemberYou'), { name: person.displayName })
        : person.displayName,
    }));
    const named = new Set(people.map((option) => option.value));
    for (const candidate of teamCandidates.options) {
      if (!named.has(candidate.workspaceMembershipId)) {
        people.push({
          value: candidate.workspaceMembershipId,
          label: candidate.displayLabel,
        });
        named.add(candidate.workspaceMembershipId);
      }
    }
    const known = new Set(people.map((option) => option.value));
    const kept = (view.caseDetail.team?.value.members ?? []).flatMap(
      (member) =>
        member.workspaceMembershipId === null ||
        known.has(member.workspaceMembershipId)
          ? []
          : [
              {
                value: member.workspaceMembershipId,
                label: `${copy('teamMemberLinkedUnknown')} — ${member.name}`,
              },
            ],
    );
    return [...people, ...kept];
  }

  function render(busy: boolean) {
    if (!view) return null;
    const caseView = view;
    function submitTeam(event: FormEvent) {
      event.preventDefault();
      if (busy || !authority.manage || blockedUntilReload(teamFeedback)) return;
      const current = caseView.caseDetail;
      const check = teamFromDraft(teamDraft ?? teamDraftFor(null), {
        correcting: current.team !== null,
        linkable: new Set(linkOptions(caseView).map((option) => option.value)),
        consultantDeclared: declaredConsultant(current) !== null,
        register: caseView.register.items,
      });
      if (check.status !== 'valid') {
        setTeamFeedback(refusedWith(teamMessage(check)));
        return;
      }
      const analysis = check.team.impartialityAnalysis;
      const body = JSON.stringify({
        expectedRevision: current.revision,
        ...(check.reason === null ? {} : { reason: check.reason }),
        members: check.team.members,
        ...(analysis === null ? {} : { impartialityAnalysis: analysis }),
      });
      void execute(
        'team',
        reuse(teamFeedback, {
          path: `/certification-cases/${encodeURIComponent(current.id)}/team`,
          body,
          caseId: current.id,
        }),
      );
    }

    function submitDecision(event: FormEvent) {
      event.preventDefault();
      if (busy || !authority.approve || blockedUntilReload(decisionFeedback))
        return;
      const { caseDetail: current, timeline, register } = caseView;
      const team = current.team;
      if (!team || current.nextStep !== 'team_decision') return;
      const check = decisionFromDraft(decisionDraft, {
        team: team.value,
        timeline,
        register: register.items,
      });
      if (check.status !== 'valid') {
        setDecisionFeedback(refusedWith(teamDecisionMessage(check.status)));
        return;
      }
      const body = JSON.stringify({
        expectedRevision: current.revision,
        teamVersion: team.version,
        decision: check.decision,
        ...(check.decision === 'returned' ? { reason: check.reason } : {}),
        ...(check.onBehalf === null ? {} : { onBehalf: check.onBehalf }),
        independenceAttested: true,
      });
      void execute(
        'decision',
        reuse(decisionFeedback, {
          path: `/certification-cases/${encodeURIComponent(current.id)}/team-decision`,
          body,
          caseId: current.id,
        }),
      );
    }

    /** The latest team's state: awaiting a decision, approved or returned. */
    function teamStatus(current: CaseDetail) {
      const { team, teamDecision } = current;
      const decided =
        team && teamDecision?.value.teamVersion === team.version
          ? teamDecision.value.decision
          : undefined;
      return (
        <span
          className={`certification-status certification-status-${decided === 'returned' ? 'rejected' : 'open'}`}
        >
          {copy(
            decided === undefined
              ? 'teamStatusPending'
              : decided === 'approved'
                ? 'teamStatusApproved'
                : 'teamStatusReturned',
          )}
        </span>
      );
    }

    /** The team form, the entry to a new version or why it is unavailable. */
    function teamStep(view: CaseView) {
      const current = view.caseDetail;
      const proposed = current.team;
      if (current.status !== 'open' || !current.agreement) return null;
      if (proposed && !teamOpen)
        return (
          <>
            {current.nextStep === 'team' && (
              <p className="certification-blocked">
                {copy('teamReturnedNote')}
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setTeamDraft(teamDraftFor(proposed));
                setTeamOpen(true);
                setTeamFeedback(IDLE);
              }}
            >
              {copy('correctTeam')}
            </button>
          </>
        );
      return (
        <>
          <TeamCandidateSearch
            key={current.id}
            candidates={teamCandidates}
            disabled={busy}
          />
          <TeamForm
            idPrefix={`${prefix}-team`}
            draft={teamDraft ?? teamDraftFor(null)}
            correcting={proposed !== null}
            linkOptions={linkOptions(view)}
            documents={view.register.items}
            consultant={declaredConsultant(current)}
            disabled={busy}
            submitting={teamFeedback.status === 'saving'}
            submitBlocked={blockedUntilReload(teamFeedback)}
            feedbackId={describedFeedback('team', teamFeedback)}
            onChange={(draft) => {
              setTeamDraft(draft);
              setTeamOpen(true);
              if (
                teamFeedback.status === 'saved' ||
                (teamFeedback.status === 'refused' && !teamFeedback.reload)
              )
                setTeamFeedback(IDLE);
            }}
            onSubmit={submitTeam}
            onCancel={
              proposed
                ? () => {
                    resetTeamDraft();
                    setTeamFeedback(IDLE);
                  }
                : undefined
            }
          />
        </>
      );
    }

    /**
     * The decision form for an approver who is not on the team, the plain
     * reason an approver cannot decide, or who decides for everyone else.
     */
    function decisionStep(view: CaseView) {
      const current = view.caseDetail;
      const team = current.team;
      if (current.status !== 'open' || !team) return null;
      if (current.nextStep !== 'team_decision') return null;
      if (!authority.approve)
        return (
          <p className="certification-note">{copy('teamAwaitingApprover')}</p>
        );
      // The server refuses a decision by anyone linked to any team version.
      if (linkedToAnyTeamVersion(view.timeline, actor.workspaceMembershipId))
        return (
          <p className="certification-blocked">{copy('teamIndependence')}</p>
        );
      return (
        <DecisionForm
          idPrefix={`${prefix}-decision`}
          draft={decisionDraft}
          teamVersion={team.version}
          conflictDeclared={!teamWithoutConflict(team.value)}
          documents={view.register.items}
          disabled={busy}
          submitting={decisionFeedback.status === 'saving'}
          submitBlocked={blockedUntilReload(decisionFeedback)}
          feedbackId={describedFeedback('decision', decisionFeedback)}
          onChange={(draft) => {
            setDecisionDraft(draft);
            if (
              decisionFeedback.status === 'saved' ||
              (decisionFeedback.status === 'refused' &&
                !decisionFeedback.reload)
            )
              setDecisionFeedback(IDLE);
          }}
          onSubmit={submitDecision}
        />
      );
    }
    return (
      <>
        {caseView.caseDetail.agreement && (
          <section aria-labelledby={`${prefix}-team-title`}>
            <h5 id={`${prefix}-team-title`}>{copy('teamTitle')}</h5>
            {caseView.caseDetail.team ? (
              <>
                <VersionAttribution version={caseView.caseDetail.team} />
                <p>
                  {copy('status')}: {teamStatus(caseView.caseDetail)}
                </p>
                <TeamView
                  team={caseView.caseDetail.team.value}
                  people={knownPeople(caseView)}
                  register={caseView.register}
                />
              </>
            ) : (
              <p>{copy('teamMissing')}</p>
            )}
            {authority.manage && (
              <>
                {feedbackMessage('team', teamFeedback)}
                {teamStep(caseView)}
              </>
            )}
          </section>
        )}
        {caseView.caseDetail.team && (
          <section aria-labelledby={`${prefix}-decision-title`}>
            <h5 id={`${prefix}-decision-title`}>{copy('decisionTitle')}</h5>
            {caseView.caseDetail.teamDecision ? (
              <>
                <VersionAttribution
                  version={caseView.caseDetail.teamDecision}
                />
                <DecisionView
                  decision={caseView.caseDetail.teamDecision.value}
                  register={caseView.register}
                />
              </>
            ) : (
              <p>{copy('decisionMissing')}</p>
            )}
            {caseView.caseDetail.teamDecision &&
              caseView.caseDetail.teamDecision.value.teamVersion !==
                caseView.caseDetail.team.version && (
                <p className="certification-note">
                  {formatMessage(copy('decisionEarlierVersion'), {
                    decided: caseView.caseDetail.teamDecision.value.teamVersion,
                    current: caseView.caseDetail.team.version,
                  })}
                </p>
              )}
            {feedbackMessage('decision', decisionFeedback)}
            {decisionStep(caseView)}
          </section>
        )}
      </>
    );
  }
  return {
    render,
    knownPeople,
    reset,
    clearRefusals,
    saving: feedback.some((item) => item.status === 'saving'),
    saved: feedback.some((item) => item.status === 'saved'),
  };
}

/** Why a team decision draft is refused before it is sent. */
function teamDecisionMessage(
  status: Exclude<DecisionCheck, { status: 'valid' }>['status'],
): CertificationMessageKey {
  switch (status) {
    case 'incomplete':
      return 'decisionValidation';
    case 'acting':
      return 'actingValidation';
    case 'actingOnTeam':
      return 'actingOnTeam';
    case 'conflictDeclared':
      return 'decisionConflictOnly';
    case 'attestation':
      return 'teamDecisionAttestationRequired';
  }
  return unexpected(status);
}

/** The consultant the accepted application declared, if any. */
function declaredConsultant(current: CaseDetail): string | null {
  const consultant = current.application?.value.consultant;
  return consultant?.used ? consultant.name : null;
}

function teamMessage(
  check: Exclude<TeamCheck, { status: 'valid' }>,
): CertificationMessageKey {
  switch (check.status) {
    case 'incomplete':
      return 'teamValidation';
    case 'conflictNote':
      return 'teamConflictNoteRequired';
    case 'link':
      return 'teamLinkInvalid';
    case 'unavailableLink':
      return 'teamMemberUnknown';
    case 'leader':
      return 'teamLeaderRule';
    case 'category':
      return 'teamCategoryRule';
    case 'analysisRequired':
      return 'teamAnalysisRequired';
    case 'reasonRequired':
      return 'reasonRequired';
  }
  return unexpected(check.status);
}
