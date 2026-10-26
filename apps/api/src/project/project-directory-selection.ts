import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';

/** New selection namespaces are strict; omitted selectors retain legacy behavior. */
export function readProjectDirectorySelection(
  query: unknown,
):
  | { view: 'mine_open' }
  | { clientDossierId: string; offset: number }
  | undefined {
  if (typeof query !== 'object' || query === null || Array.isArray(query))
    throw invalidSelection();
  const entries: [string, unknown][] = Object.entries(query);
  if (
    entries.some(
      ([key]) =>
        key === 'clientDossierId' || key.startsWith('clientDossierId['),
    )
  ) {
    if (entries.some(([key]) => key !== 'clientDossierId' && key !== 'offset'))
      throw invalidSelection();
    const values = Object.fromEntries(entries);
    const clientDossierId = requireUuid(values.clientDossierId);
    const value = values.offset;
    if (value === undefined) return { clientDossierId, offset: 0 };
    if (
      typeof value !== 'string' ||
      !/^\d+$/u.test(value) ||
      !Number.isSafeInteger(Number(value))
    )
      throw invalidSelection();
    return { clientDossierId, offset: Number(value) };
  }
  if (!entries.some(([key]) => key === 'view' || key.startsWith('view[')))
    return undefined;
  if (
    entries.length !== 1 ||
    entries[0]?.[0] !== 'view' ||
    entries[0][1] !== 'mine_open'
  )
    throw invalidSelection();
  return { view: 'mine_open' };
}
function invalidSelection() {
  return new BadRequestException('Invalid Project directory selection.');
}
