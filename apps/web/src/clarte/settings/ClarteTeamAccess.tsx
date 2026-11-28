import { ChevronRight, MailPlus } from 'lucide-react';
import { useId, useState } from 'react';
import type { BrowserIdentity } from '../../access-composition';
import type { ActorContext } from '../../access-types';
import {
  bundleLabel,
  disambiguatedLabel,
  duplicatedLabels,
  memberLabel,
} from '../../access/assignment-bundles';
import {
  useAssignmentBundleCatalogue,
  type AssignmentBundleOption,
} from '../../access/assignment-bundle-catalogue';
import type {
  CompanyAccessAdministration,
  CompanyAccessMember,
} from '../../access/company-access-administration-response';
import { useCompanyAssignmentCopy } from '../../access/company-assignment-localization.copy';
import {
  useCompanyAccessAdministration,
  type CompanyAccessAdministrationCallbacks,
} from '../../access/use-company-access-administration';
import { useMembershipSuspension } from '../../access/use-membership-suspension';
import {
  useSessionRevocations,
  type SessionRevocationStatus,
} from '../../access/use-session-revocations';
import { useWorkspaceMembershipSuspensionCopy } from '../../access/workspace-membership-suspension.copy';
import { useSessionRevocationCopy } from '../../access/workspace-session-revocation.copy';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { formatMessage } from '../../localization/messages';
import { ClarteBadge, type ClarteTone } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteConfirmDialog } from '../components/ClarteConfirmDialog';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { rightsGroupOf, rightsGroups } from './rights-groups';
import { useSettingsAccessCopy } from './settings-access.copy';

/** The views of a member's panel. */
type MemberView = 'rights' | 'access';

type TeamAccessProps = CompanyAccessAdministrationCallbacks &
  Readonly<{ actor: ActorContext; identity: BrowserIdentity }>;

const revocationTones = {
  pending: 'info',
  running: 'info',
  retry_required: 'warning',
  complete: 'success',
} as const satisfies Record<SessionRevocationStatus, ClarteTone>;

/**
 * Team and rights in the Settings console: the members and the Companies
 * where they hold rights; per member and Company, grant and revoke each rights
 * set with its current state and captured version (EX-013 to EX-016, EX-026
 * to EX-028); suspend a member after review and confirmation (EX-029); follow
 * and retry the identity-provider session revocation (EX-030). The server's
 * administration read is the only state shown.
 */
export function ClarteTeamAccess({
  actor,
  identity,
  onActivityRecorded = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
  ...callbacks
}: TeamAccessProps) {
  const copy = useCompanyAssignmentCopy();
  const teamCopy = useSettingsAccessCopy();
  const { formatNumber } = useInterfaceLocale();
  const suspensionCopy = useWorkspaceMembershipSuspensionCopy();
  const access = useCompanyAccessAdministration({
    actor,
    identity,
    onActivityRecorded,
    onWorkspaceAccessRejected,
    ...callbacks,
  });
  const [openMemberId, setOpenMemberId] = useState<string>();
  const administration =
    access.administration.status === 'ready'
      ? access.administration.value
      : undefined;
  const members = administration?.members ?? [];
  const duplicateMemberLabels = duplicatedLabels(members.map(memberLabel));
  const suspensionMembers = members.map((member) => ({
    workspaceMembershipId: member.workspaceMembershipId,
    label: disambiguatedLabel({
      label: memberLabel(member),
      id: member.workspaceMembershipId,
      duplicates: duplicateMemberLabels,
      referenceLabel: copy('referenceLabel'),
    }),
  }));
  const suspension = useMembershipSuspension({
    actor,
    identity,
    members: suspensionMembers,
    disabled: access.mutation.status === 'submitting',
    reloadAdministration: access.reloadAdministration,
    onPendingChange: access.setSuspensionPending,
    onActivityRecorded,
    onWorkspaceAccessRejected,
  });

  if (!access.allowed)
    return <ClarteErrorState title={teamCopy.accessForbidden} />;
  if (access.administration.status === 'loading')
    return <ClarteLoadingState label={copy('loading')} />;
  if (!administration)
    return (
      <ClarteErrorState
        title={copy('error')}
        action={
          <ClarteButton onClick={() => void access.retryAdministration()}>
            {copy('retry')}
          </ClarteButton>
        }
      />
    );

  const openMember = members.find(
    (member) =>
      member.workspaceMembershipId === openMemberId &&
      member.workspaceMembershipId === access.workspaceMembershipId,
  );
  const reviewedMember = suspensionMembers.find(
    (member) =>
      suspension.state.status === 'reviewing' &&
      member.workspaceMembershipId === suspension.state.workspaceMembershipId,
  );

  function open(member: CompanyAccessMember) {
    if (!administration) return;
    const activeCompanyId = actor.activeCompany?.id;
    const companyId =
      administration.companies.find((company) => company.id === activeCompanyId)
        ?.id ?? administration.companies[0]?.id;
    setOpenMemberId(member.workspaceMembershipId);
    access.selectMember(member.workspaceMembershipId);
    if (companyId) access.selectCompany(companyId);
    suspension.select(member.workspaceMembershipId);
  }

  return (
    <>
      <ClarteCard
        title={`${teamCopy.membersTitle} · ${formatNumber(members.length)}`}
        actions={
          // The same gate under which App offers the Invitations section.
          actor.workspacePermissions.includes('member.invite') ? (
            <a
              className="clarte-button clarte-button--secondary clarte-button--small"
              href="#invitations"
            >
              <MailPlus aria-hidden="true" />
              {teamCopy.inviteTitle}
            </a>
          ) : undefined
        }
      >
        <p className="clarte-settings-hint">{teamCopy.rightsHint}</p>
        {members.length === 0 || administration.companies.length === 0 ? (
          <ClarteEmptyState title={copy('empty')} />
        ) : (
          <div className="clarte-table-wrap">
            <table className="clarte-table clarte-members">
              <thead>
                <tr>
                  <th scope="col">{teamCopy.personColumn}</th>
                  <th scope="col">{teamCopy.companiesColumn}</th>
                  <th scope="col">
                    <span className="clarte-visually-hidden">
                      {copy('workspaceMemberLabel')}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const companies = companiesWithRights(administration, member);
                  return (
                    <tr key={member.workspaceMembershipId}>
                      <td>
                        <span className="clarte-member">
                          <span
                            className="clarte-member-initials"
                            aria-hidden="true"
                          >
                            {initialsOf(member.displayName)}
                          </span>
                          <span className="clarte-settings-cell-stack">
                            <button
                              type="button"
                              className="clarte-member-open"
                              onClick={() => open(member)}
                            >
                              {member.displayName}
                            </button>
                            <small>
                              {duplicateMemberLabels.has(memberLabel(member))
                                ? disambiguatedLabel({
                                    label: memberLabel(member),
                                    id: member.workspaceMembershipId,
                                    duplicates: duplicateMemberLabels,
                                    referenceLabel: copy('referenceLabel'),
                                  })
                                : member.email}
                            </small>
                          </span>
                        </span>
                      </td>
                      <td data-label={teamCopy.companiesColumn}>
                        {companies.length === 0 ? (
                          <span className="clarte-settings-muted">
                            {teamCopy.noRights}
                          </span>
                        ) : (
                          companies.join(', ')
                        )}
                      </td>
                      <td className="clarte-member-chevron">
                        <ChevronRight aria-hidden="true" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ClarteCard>
      {suspension.state.status === 'ready' && (
        <p className="clarte-settings-status" role="status">
          {suspensionCopy.suspended}
        </p>
      )}
      <ClarteSessionRevocations
        actor={actor}
        identity={identity}
        onActivityRecorded={onActivityRecorded}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
      {openMember && (
        <MemberRights
          member={openMember}
          administration={administration}
          access={access}
          suspension={suspension}
          onClose={() => {
            setOpenMemberId(undefined);
            suspension.reset();
          }}
        />
      )}
      {reviewedMember && (
        <ClarteConfirmDialog
          title={suspensionCopy.confirmationRegionLabel}
          description={`${suspensionCopy.selectedMemberLabel}: ${reviewedMember.label}. ${suspensionCopy.confirmation}`}
          confirmLabel={suspensionCopy.confirm}
          cancelLabel={suspensionCopy.cancel}
          tone="danger"
          busy={suspension.pending}
          onCancel={suspension.reset}
          onConfirm={() => void suspension.submit()}
        />
      )}
    </>
  );
}

/** Up to two initials of a member's name, for the avatar beside it. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('');
}

/** The Companies where the member holds at least one active rights set. */
function companiesWithRights(
  administration: CompanyAccessAdministration,
  member: CompanyAccessMember,
): string[] {
  return administration.companies
    .filter((company) =>
      administration.assignments.some(
        (assignment) =>
          assignment.active &&
          assignment.workspaceMembershipId === member.workspaceMembershipId &&
          assignment.companyId === company.id,
      ),
    )
    .map((company) => company.displayName);
}

function MemberRights({
  member,
  administration,
  access,
  suspension,
  onClose,
}: Readonly<{
  member: CompanyAccessMember;
  administration: CompanyAccessAdministration;
  access: ReturnType<typeof useCompanyAccessAdministration>;
  suspension: ReturnType<typeof useMembershipSuspension>;
  onClose: () => void;
}>) {
  const copy = useCompanyAssignmentCopy();
  const teamCopy = useSettingsAccessCopy();
  const suspensionCopy = useWorkspaceMembershipSuspensionCopy();
  const catalogue = useAssignmentBundleCatalogue();
  const headingId = useId();
  const [view, setView] = useState<MemberView>('rights');
  const { mutation, companyId } = access;
  const busy = mutation.status === 'submitting' || access.suspensionPending;
  const duplicateCompanyLabels = duplicatedLabels(
    administration.companies.map((company) => company.displayName),
  );
  const views = [
    { id: 'rights', label: teamCopy.rightsTab },
    { id: 'access', label: suspensionCopy.title },
  ] as const satisfies readonly { id: MemberView; label: string }[];
  const tabId = (id: MemberView) => `${headingId}-tab-${id}`;
  const panelId = `${headingId}-view`;
  return (
    <ClarteSidePanel
      title={member.displayName}
      description={member.email}
      onClose={onClose}
    >
      <div className="clarte-member-rights">
        <div
          className="clarte-panel-tabs"
          role="tablist"
          aria-label={member.displayName}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const next = view === 'rights' ? 'access' : 'rights';
            setView(next);
            document.getElementById(tabId(next))?.focus();
          }}
        >
          {views.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              id={tabId(candidate.id)}
              aria-selected={view === candidate.id}
              aria-controls={panelId}
              tabIndex={view === candidate.id ? 0 : -1}
              onClick={() => setView(candidate.id)}
            >
              {candidate.label}
            </button>
          ))}
        </div>
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(view)}
          className="clarte-member-view"
        >
          {view === 'rights' ? (
            <>
              <div
                className="clarte-company-choice"
                role="group"
                aria-labelledby={`${headingId}-company-choice`}
              >
                <span id={`${headingId}-company-choice`}>
                  {copy('companyLabel')}
                </span>
                {administration.companies.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    aria-pressed={company.id === companyId}
                    disabled={busy}
                    onClick={() => access.selectCompany(company.id)}
                  >
                    {disambiguatedLabel({
                      label: company.displayName,
                      id: company.id,
                      duplicates: duplicateCompanyLabels,
                      referenceLabel: copy('referenceLabel'),
                    })}
                  </button>
                ))}
              </div>
              <p className="clarte-settings-hint">
                {copy('capturedVersionExplanation')}
              </p>
              {mutation.status === 'ready' && (
                <p className="clarte-settings-status" role="status">
                  {mutation.submission === 'grant'
                    ? copy('granted')
                    : copy('revoked')}
                </p>
              )}
              {(mutation.status === 'error' ||
                mutation.status === 'unrefreshed') && (
                <p className="clarte-settings-alert" role="alert">
                  {copy('error')}
                </p>
              )}
              {companyId &&
                rightsGroups.map((group) => {
                  const options = catalogue.filter(
                    (option) => rightsGroupOf[option.bundle] === group,
                  );
                  return (
                    <section
                      key={group}
                      className="clarte-rights-group"
                      aria-labelledby={`${headingId}-${group}`}
                    >
                      <h3 id={`${headingId}-${group}`}>
                        {teamCopy.rightsGroup(group)}
                      </h3>
                      <ul className="clarte-rights">
                        {options.map((option) => (
                          <RightsSet
                            key={option.bundle}
                            option={option}
                            administration={administration}
                            access={access}
                            busy={busy}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })}
            </>
          ) : (
            <div className="clarte-member-suspension">
              <p className="clarte-settings-hint">
                {suspensionCopy.description}
              </p>
              <ClarteButton
                variant="danger"
                disabled={busy || suspension.pending}
                onClick={() => suspension.review(member.workspaceMembershipId)}
              >
                {suspensionCopy.review}
              </ClarteButton>
              {suspension.pending && (
                <p className="clarte-settings-hint" role="status">
                  {suspensionCopy.submitting}
                </p>
              )}
              {suspension.state.status === 'error' && (
                <p className="clarte-settings-alert" role="alert">
                  {suspensionCopy.error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </ClarteSidePanel>
  );
}

function RightsSet({
  option,
  administration,
  access,
  busy,
}: Readonly<{
  option: AssignmentBundleOption;
  administration: CompanyAccessAdministration;
  access: ReturnType<typeof useCompanyAccessAdministration>;
  busy: boolean;
}>) {
  const copy = useCompanyAssignmentCopy();
  const teamCopy = useSettingsAccessCopy();
  const label = bundleLabel(option.bundle);
  const assignment = administration.assignments.find(
    (candidate) =>
      candidate.active &&
      candidate.workspaceMembershipId === access.workspaceMembershipId &&
      candidate.companyId === access.companyId &&
      candidate.bundle === label,
  );
  const version = assignment?.permissionSetVersion ?? null;
  const submission =
    access.retrySubmission(option.bundle) ?? (assignment ? 'revoke' : 'grant');
  const action = submission === 'grant' ? copy('grant') : copy('revoke');
  return (
    <li>
      <div className="clarte-settings-cell-stack">
        <strong>{option.label}</strong>
        {option.prerequisites !== undefined && (
          <small>{option.prerequisites}</small>
        )}
      </div>
      <ClarteBadge tone={assignment ? 'success' : 'neutral'}>
        {!assignment
          ? copy('currentStateNotGranted')
          : version === null
            ? copy('currentStateGranted')
            : formatMessage(copy('currentStateGrantedVersion'), { version })}
      </ClarteBadge>
      <ClarteButton
        size="small"
        variant={submission === 'grant' ? 'secondary' : 'quiet'}
        disabled={busy}
        aria-label={formatMessage(teamCopy.bundleAction, {
          action,
          bundle: option.label,
        })}
        onClick={() => void access.submit(submission, option.bundle)}
      >
        {action}
      </ClarteButton>
    </li>
  );
}

function ClarteSessionRevocations(
  props: Readonly<{
    actor: ActorContext;
    identity: BrowserIdentity;
    onWorkspaceAccessRejected: () => Promise<void> | void;
    onActivityRecorded: () => Promise<void> | void;
  }>,
) {
  const copy = useSessionRevocationCopy();
  const teamCopy = useSettingsAccessCopy();
  const { allowed, state, load } = useSessionRevocations(props);
  if (!allowed) return null;
  return (
    <ClarteCard
      title={copy.title}
      actions={
        <ClarteButton
          size="small"
          disabled={state.kind === 'loading'}
          onClick={() => void load()}
        >
          {copy.refresh}
        </ClarteButton>
      }
    >
      <p className="clarte-settings-hint">{copy.description}</p>
      {state.kind === 'loading' && <ClarteLoadingState label={copy.pending} />}
      {state.kind === 'error' && <ClarteErrorState title={copy.error} />}
      {state.kind === 'ready' && state.page.records.length === 0 && (
        <ClarteEmptyState title={copy.empty} />
      )}
      {state.kind === 'ready' && state.page.records.length > 0 && (
        <ul className="clarte-list clarte-revocation-list">
          {state.page.records.map((row) => (
            <li key={row.workspaceMembershipId} data-status={row.status}>
              <div className="clarte-settings-cell-stack">
                <strong>{row.displayName}</strong>
                <small>{copy.status[row.status]}</small>
              </div>
              <ClarteBadge tone={revocationTones[row.status]}>
                {teamCopy.revocationStatus(row.status)}
              </ClarteBadge>
              {(row.status === 'pending' ||
                row.status === 'retry_required') && (
                <ClarteButton
                  size="small"
                  variant="primary"
                  onClick={() =>
                    void load(undefined, row.workspaceMembershipId)
                  }
                >
                  {copy.retry}
                </ClarteButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {state.kind === 'ready' && state.page.nextCursor && (
        <ClarteButton
          size="small"
          onClick={() => {
            if (state.page.nextCursor) void load(state.page.nextCursor);
          }}
        >
          {copy.more}
        </ClarteButton>
      )}
    </ClarteCard>
  );
}
