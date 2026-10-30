import { ConflictException } from '@nestjs/common';
import { MAX_NEXT_ACTION_REVISION } from './project-next-action.input.js';

/** Material successor only: unchanged declarations never consume a revision. */
export function nextActionMaterialRevision(current: number): number {
  if (
    !Number.isInteger(current) ||
    current < 0 ||
    current > MAX_NEXT_ACTION_REVISION
  )
    throw new Error('Invalid stored next-action revision.');
  if (current === MAX_NEXT_ACTION_REVISION)
    throw new ConflictException('Next-action revision is exhausted.');
  return current + 1;
}
