const key = 'prisma-workspace-context';
export function selectedWorkspaceId(): string | undefined {
  try {
    const value = sessionStorage.getItem(key);
    return isUuid(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
export function selectWorkspace(id: string) {
  if (!isUuid(id)) throw new Error('Invalid Workspace selection.');
  sessionStorage.setItem(key, id);
}
export function clearWorkspaceSelection() {
  sessionStorage.removeItem(key);
}
export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}
