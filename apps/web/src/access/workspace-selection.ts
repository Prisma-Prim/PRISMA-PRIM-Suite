const key = 'prisma-workspace-context';
// undefined means not selected in this document; null explicitly clears a stale hint.
let currentSelection: string | null | undefined;
export function selectedWorkspaceId(): string | undefined {
  if (currentSelection !== undefined) return currentSelection ?? undefined;
  const history: unknown = window.history.state;
  if (
    typeof history === 'object' &&
    history !== null &&
    'workspaceSelection' in history
  ) {
    return isUuid(history.workspaceSelection)
      ? history.workspaceSelection
      : undefined;
  }
  try {
    const value = sessionStorage.getItem(key);
    return isUuid(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
export function selectWorkspace(id: string) {
  if (!isUuid(id)) throw new Error('Invalid Workspace selection.');
  currentSelection = id;
  rememberSelection(id);
  try {
    sessionStorage.setItem(key, id);
  } catch {
    // The current document can enter the Workspace without persistence.
  }
}
export function clearWorkspaceSelection() {
  currentSelection = null;
  rememberSelection(null);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Optional preference cleanup must never block provider sign-out.
  }
}
function rememberSelection(workspaceSelection: string | null) {
  try {
    const current: unknown = window.history.state;
    window.history.replaceState(
      {
        ...(typeof current === 'object' && current !== null ? current : {}),
        workspaceSelection,
      },
      '',
    );
  } catch {
    // In-memory selection still works if history persistence is unavailable.
  }
}
export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}
