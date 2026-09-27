export interface ClientLegalEntity {
  id: string;
  legalName: string;
  taxId: string | null;
  legalAddress: string | null;
  createdAt: string;
}

export interface ClientLegalEntityList {
  clientVersion: number;
  legalEntities: ClientLegalEntity[];
}

export interface ClientLegalEntityMutation {
  clientVersion: number;
  legalEntity: ClientLegalEntity;
}

/** Proves one successful list response; anything else rejects the whole read. */
export function readClientLegalEntityList(
  value: unknown,
): ClientLegalEntityList {
  if (!isRecord(value) || !Array.isArray(value.legalEntities)) invalid();
  const entries: unknown[] = value.legalEntities;
  return {
    clientVersion: version(value.clientVersion),
    legalEntities: entries.map(legalEntity),
  };
}

/** Proves one confirmed registration or correction response. */
export function readClientLegalEntityMutation(
  value: unknown,
): ClientLegalEntityMutation {
  if (!isRecord(value)) invalid();
  return {
    clientVersion: version(value.clientVersion),
    legalEntity: legalEntity(value.legalEntity),
  };
}

function legalEntity(value: unknown): ClientLegalEntity {
  if (!isRecord(value)) invalid();
  const { id, legalName, taxId, legalAddress, createdAt } = value;
  if (
    typeof id !== 'string' ||
    !id ||
    typeof legalName !== 'string' ||
    !legalName ||
    typeof createdAt !== 'string' ||
    !Number.isFinite(Date.parse(createdAt))
  )
    invalid();
  return {
    id,
    legalName,
    taxId: optionalText(taxId),
    legalAddress: optionalText(legalAddress),
    createdAt,
  };
}

function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    invalid();
  return value;
}

function optionalText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !value) invalid();
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new Error('Invalid Client legal entity response.');
}
