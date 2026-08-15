import type { ActorContext } from '../access-types';

interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): unknown;
}

export interface CompanyContextPreferenceStore {
  read(actor: ActorContext): string | undefined;
  write(actor: ActorContext, companyId: string): void;
  clear(actor: ActorContext): void;
}

export function createCompanyContextPreferenceStore(
  suppliedStorage?: PreferenceStorage,
): CompanyContextPreferenceStore {
  let storage = suppliedStorage;
  if (!storage) {
    try {
      storage = window.localStorage;
    } catch {
      storage = undefined;
    }
  }

  return {
    read(actor) {
      try {
        return storage?.getItem(preferenceKey(actor)) ?? undefined;
      } catch {
        return undefined;
      }
    },
    write(actor, companyId) {
      try {
        storage?.setItem(preferenceKey(actor), companyId);
      } catch {
        // Browser storage is an optional preference, never an access boundary.
      }
    },
    clear(actor) {
      try {
        storage?.removeItem(preferenceKey(actor));
      } catch {
        // Safe reselection must remain available when storage is unavailable.
      }
    },
  };
}

export function preferenceKey(
  actor: Pick<ActorContext, 'workspaceId' | 'workspaceMembershipId'>,
): string {
  return `prisma-prim.company-context:${actor.workspaceId}:${actor.workspaceMembershipId}`;
}
