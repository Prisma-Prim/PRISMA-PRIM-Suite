import { commercialIntakeCopy as copy } from './commercial-intake.copy';

/** An eligible member: a membership identifier and a label, never email. */
export type ResponsibleCandidate = {
  workspaceMembershipId: string;
  displayLabel: string;
};

/**
 * The responsible-actor change of one Opportunity: closed, loading its
 * eligible members, their load failed, choosing, in flight, waiting for an
 * explicit retry after an uncertain outcome, refused because the chosen member
 * became unavailable until the list reloads, or blocked until the Request
 * reloads after a conflict.
 */
export type ResponsibleEdit =
  | { kind: 'idle' | 'loading' | 'load-error' | 'unavailable' | 'conflict' }
  | {
      kind: 'choosing' | 'saving' | 'uncertain';
      members: ResponsibleCandidate[];
      selection: string;
    };

export type ResponsibleEditor = {
  edit: ResponsibleEdit;
  /** The recorded responsible actor, eligible or not. */
  current: { workspaceMembershipId: string; displayName: string };
  /** Another Opportunity editor is open, so this one cannot start. */
  blocked: boolean;
  onOpen: () => void;
  onSelect: (workspaceMembershipId: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onReloadList: () => void;
  onReloadRequest: () => void;
};

/**
 * The Request detail's responsible-actor control. The workspace owns its state
 * and commands, so the next-action editor's protections apply to it as well.
 */
export function OpportunityResponsible({
  editor,
  pending,
}: {
  editor: ResponsibleEditor;
  pending: boolean;
}) {
  const { edit } = editor;
  switch (edit.kind) {
    case 'idle':
      return (
        <button
          type="button"
          className="commercial-intake-secondary-action"
          onClick={editor.onOpen}
          disabled={pending || editor.blocked}
        >
          {copy.changeResponsible}
        </button>
      );
    case 'conflict':
      return (
        <button
          type="button"
          onClick={editor.onReloadRequest}
          disabled={pending}
        >
          {copy.reloadRequest}
        </button>
      );
    case 'loading':
    case 'load-error':
    case 'unavailable':
      return (
        <div className="commercial-intake-responsible">
          {edit.kind === 'loading' ? (
            <p role="status">{copy.responsibleMembersLoading}</p>
          ) : null}
          <div className="commercial-intake-next-action-actions">
            {edit.kind === 'loading' ? null : (
              <button type="button" onClick={editor.onReloadList}>
                {copy.responsibleReloadList}
              </button>
            )}
            <button type="button" onClick={editor.onCancel}>
              {copy.cancelResponsible}
            </button>
          </div>
        </div>
      );
    case 'choosing':
    case 'saving':
    case 'uncertain':
      return (
        <ResponsibleChoice
          editor={editor}
          edit={edit}
          current={editor.current}
          pending={pending}
        />
      );
    default:
      return assertNeverResponsibleEdit(edit);
  }
}

function ResponsibleChoice({
  editor,
  edit,
  current,
  pending,
}: {
  editor: ResponsibleEditor;
  edit: Extract<ResponsibleEdit, { members: ResponsibleCandidate[] }>;
  current: ResponsibleEditor['current'];
  pending: boolean;
}) {
  const others = edit.members.filter(
    (member) => member.workspaceMembershipId !== current.workspaceMembershipId,
  );
  const currentEligible = others.length < edit.members.length;
  const saving = edit.kind === 'saving';
  return (
    <form
      className="commercial-intake-responsible"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        editor.onSave();
      }}
    >
      {currentEligible ? null : (
        <p>{copy.responsibleCurrentIneligible(current.displayName)}</p>
      )}
      {others.length === 0 ? (
        <p>{copy.responsibleNoOtherMember}</p>
      ) : (
        <label>
          {copy.responsibleChoice}
          <select
            value={edit.selection}
            onChange={(event) => editor.onSelect(event.target.value)}
            disabled={saving || edit.kind === 'uncertain'}
          >
            {currentEligible ? null : (
              <option value="">{copy.responsibleSelectMember}</option>
            )}
            {edit.members.map((member) => (
              <option
                key={member.workspaceMembershipId}
                value={member.workspaceMembershipId}
              >
                {member.displayLabel}
              </option>
            ))}
          </select>
        </label>
      )}
      {saving ? <p role="status">{copy.responsibleSaving}</p> : null}
      <div className="commercial-intake-next-action-actions">
        {others.length === 0 ? null : (
          <button
            type="submit"
            className="commercial-intake-primary-action"
            disabled={pending || !edit.selection}
          >
            {edit.kind === 'uncertain'
              ? copy.retryResponsible
              : copy.saveResponsible}
          </button>
        )}
        <button
          type="button"
          className="commercial-intake-secondary-action"
          onClick={editor.onCancel}
          disabled={saving}
        >
          {copy.cancelResponsible}
        </button>
      </div>
    </form>
  );
}

function assertNeverResponsibleEdit(edit: never): never {
  throw new Error(
    `Unexpected responsible-actor edit state: ${JSON.stringify(edit)}`,
  );
}
