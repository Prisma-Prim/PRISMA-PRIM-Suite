/** Provisional MVP bound on additional entities per Client (Shared Client PRD §20). */
export const CLIENT_LEGAL_ENTITY_CAPACITY = 50;

export const CLIENT_LEGAL_ENTITY_CAPACITY_EXCEEDED =
  'client_legal_entity_capacity_exceeded' as const;

/** The normalized shared identity values of one additional Client Legal Entity. */
export interface ClientLegalEntityValues {
  legalName: string;
  taxId: string | null;
  legalAddress: string | null;
}

export type ClientLegalEntityField = keyof ClientLegalEntityValues;

export const CLIENT_LEGAL_ENTITY_FIELDS = [
  'legalName',
  'taxId',
  'legalAddress',
] as const satisfies readonly ClientLegalEntityField[];

/** A non-empty subset of the values, each already normalized. */
export type ClientLegalEntityChanges = Partial<ClientLegalEntityValues>;

/** The previous and new value of each materially changed field. */
export type ClientLegalEntityFieldChanges = {
  [Field in ClientLegalEntityField]?: {
    before: ClientLegalEntityValues[Field];
    after: ClientLegalEntityValues[Field];
  };
};

export interface ClientLegalEntityView extends ClientLegalEntityValues {
  id: string;
  createdAt: string;
}

export interface ClientLegalEntityList {
  clientVersion: number;
  legalEntities: ClientLegalEntityView[];
}

export interface ClientLegalEntityMutationResult {
  clientVersion: number;
  legalEntity: ClientLegalEntityView;
}

export type ClientLegalEntityCommand =
  | {
      action: 'register';
      clientAccountId: string;
      expectedClientVersion: number;
      values: ClientLegalEntityValues;
      idempotencyKey: string;
    }
  | {
      action: 'correct';
      clientAccountId: string;
      legalEntityId: string;
      expectedClientVersion: number;
      changes: ClientLegalEntityChanges;
      idempotencyKey: string;
    };
