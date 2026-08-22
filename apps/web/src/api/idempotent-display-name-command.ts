export interface IdempotentDisplayNameCommand {
  readonly displayName: string;
  readonly idempotencyKey: string;
}

export function resolveIdempotentDisplayNameCommand(
  displayName: string,
  previous: IdempotentDisplayNameCommand | undefined,
  createKey: () => string = () => crypto.randomUUID(),
): IdempotentDisplayNameCommand | undefined {
  const normalizedName = displayName.trim();
  if (!normalizedName) return undefined;
  return previous?.displayName === normalizedName
    ? previous
    : { displayName: normalizedName, idempotencyKey: createKey() };
}
