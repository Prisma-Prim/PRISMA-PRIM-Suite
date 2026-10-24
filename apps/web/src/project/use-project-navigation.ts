import { useEffect, useRef, useState } from 'react';

/** Task focus requires an exact Task identity. */
export type ProjectOpenTarget = { projectId: string } & (
  { taskId?: string; focus?: undefined } | { taskId: string; focus: 'task' }
);

export type ProjectNavigationIntent =
  | {
      kind: 'directory';
      client?: { clientDossierId: string; displayName: string };
    }
  | ({ kind: 'project' } & ProjectOpenTarget);

export type ProjectNavigationRequest = ProjectNavigationIntent & {
  requestId: number;
};

/** App supplies its existing Project owner context; no new session is created. */
export function useProjectNavigation(context: string) {
  const sequence = useRef(0);
  const [requested, setRequested] = useState<
    { context: string; request: ProjectNavigationRequest } | undefined
  >();
  useEffect(() => setRequested(undefined), [context]);
  return {
    // Withhold a retired activation during the render before its effect clears it.
    request: requested?.context === context ? requested.request : undefined,
    navigate(intent: ProjectNavigationIntent) {
      sequence.current += 1;
      setRequested({
        context,
        request: { ...intent, requestId: sequence.current },
      });
    },
  };
}
