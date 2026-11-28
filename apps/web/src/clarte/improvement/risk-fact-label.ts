import { useOperationalRiskCopy } from '../../operational-risk/operational-risk.copy';
import type { factFields } from '../../operational-risk/operational-risk.editor';
import { useClarteImprovementCopy } from './clarte-improvement.copy';

/**
 * A Risk fact's label where it is read. The form's labels say which facts
 * are optional; a recorded fact or log date needs no such note.
 */
export function useFactLabel() {
  const copy = useOperationalRiskCopy();
  const text = useClarteImprovementCopy();
  return (name: (typeof factFields)[number] | 'occurredOn'): string => {
    switch (name) {
      case 'existingMeasures':
        return text('existingMeasuresLabel');
      case 'sourceDescription':
        return text('sourceDescriptionLabel');
      case 'plannedDate':
        return text('plannedDateLabel');
      case 'occurredOn':
        return text('occurredOnLabel');
      default:
        return copy(name);
    }
  };
}
