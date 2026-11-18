import { NotFoundException } from '@nestjs/common';

/** A saved omission may only be disclosed if the native Project inventory still exposes it. */
export function requireVisibleMissing(
  saved: readonly { documentId: string; title: string }[],
  current: readonly { documentId: string; title: string }[],
): void {
  const visible = new Set(current.map((document) => document.documentId));
  if (saved.some((document) => !visible.has(document.documentId)))
    throw new NotFoundException();
}
