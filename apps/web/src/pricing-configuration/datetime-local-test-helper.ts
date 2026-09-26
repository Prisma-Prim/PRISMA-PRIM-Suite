const zeroSeconds = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):00$/u;

export function canonicalDateTimeLocalValue(value: string): string {
  const match = zeroSeconds.exec(value);
  return match?.[1] ?? value;
}
