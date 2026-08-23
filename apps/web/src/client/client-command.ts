export interface RetryCommand {
  serializedBody: string;
  idempotencyKey: string;
}

export function optionalProperty<Key extends string>(key: Key, value: string) {
  const normalized = value.trim();
  return normalized ? { [key]: normalized } : {};
}

export function resolveRetryCommand(
  serializedBody: string,
  previous: RetryCommand | undefined,
): RetryCommand {
  return previous?.serializedBody === serializedBody
    ? previous
    : { serializedBody, idempotencyKey: crypto.randomUUID() };
}
