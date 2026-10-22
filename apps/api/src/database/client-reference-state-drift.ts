import { NotFoundException } from '@nestjs/common';

/** Only Client's operational owner raises this after a readable lock-set drift. */
export class ClientReferenceStateDrift extends Error {
  readonly refusal = new NotFoundException();

  constructor() {
    super('The readable Client reference changed while acquiring its locks.');
  }
}
