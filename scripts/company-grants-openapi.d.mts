export function createCurrentActorValidator(): {
  accepts(value: unknown): boolean;
  errors(): string;
};
