import { BadRequestException } from '@nestjs/common';
import type {
  CreateCompanyServiceOfferingCommand,
  CreateServiceDefinitionCommand,
} from './commercial-catalogue.types.js';

// Every length and grammar below is a provisional drafting choice recorded in
// the owning PRD (section 13, rows 16 and 17), not an approved business limit.
const DEFINITION_FIELDS = new Set(['code', 'name', 'description']);
const OFFERING_FIELDS = new Set(['serviceDefinitionId', 'commercialLabel']);
const CODE_GRAMMAR = /^[A-Z0-9_-]{1,40}$/u;
const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function readCreateServiceDefinitionCommand(
  value: unknown,
): CreateServiceDefinitionCommand {
  const body = record(value, 'definition');
  rejectExtraFields(body, DEFINITION_FIELDS, 'definition');
  if (typeof body.code !== 'string' || !CODE_GRAMMAR.test(body.code))
    invalid('code', 'Enter 1 to 40 characters using A-Z, 0-9, _ or -.');
  return {
    code: body.code,
    name: requiredString(body.name, 'name', 160),
    description: optionalString(body.description, 'description', 2_000),
  };
}

// Reads only the target identity of an offering command so its current
// readability can be revalidated before any replay. A payload that carries no
// well-formed target is left to full validation later in the command order.
export function readTargetServiceDefinitionId(
  value: unknown,
): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined;
  const target = Object.fromEntries(Object.entries(value)).serviceDefinitionId;
  return typeof target === 'string' && UUID_GRAMMAR.test(target)
    ? target.toLowerCase()
    : undefined;
}

export function readCreateCompanyServiceOfferingCommand(
  value: unknown,
): CreateCompanyServiceOfferingCommand {
  const body = record(value, 'offering');
  rejectExtraFields(body, OFFERING_FIELDS, 'offering');
  if (
    typeof body.serviceDefinitionId !== 'string' ||
    !UUID_GRAMMAR.test(body.serviceDefinitionId)
  )
    invalid('serviceDefinitionId', 'Select a Service Definition.');
  return {
    serviceDefinitionId: body.serviceDefinitionId.toLowerCase(),
    commercialLabel: optionalString(
      body.commercialLabel,
      'commercialLabel',
      160,
    ),
  };
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid(field, 'Enter a valid object.');
  return Object.fromEntries(Object.entries(value));
}

function rejectExtraFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  field: string,
): void {
  if (Object.keys(value).some((key) => !allowed.has(key)))
    invalid(field, 'Remove unsupported fields.');
}

function requiredString(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maximum
  )
    invalid(field, `Enter between 1 and ${maximum} characters.`);
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  maximum: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > maximum)
    invalid(field, `Enter at most ${maximum} characters.`);
  return value;
}

function invalid(field: string, message: string): never {
  throw new BadRequestException({
    code: 'VALIDATION_ERROR',
    field,
    message,
  });
}
