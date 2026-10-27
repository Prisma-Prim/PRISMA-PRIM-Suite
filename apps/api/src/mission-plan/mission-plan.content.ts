import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import { readProjectTitle } from '../project/project.service.js';
import { createInput as taskInput } from '../task/task.validation.js';
export function exactRecord(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid mission-plan input.');
  const row = Object.fromEntries(Object.entries(value));
  if (
    Object.keys(row).length !== keys.length ||
    Object.keys(row).some((k) => !keys.includes(k))
  )
    throw new BadRequestException('Unsupported mission-plan fields.');
  return row;
}
export function versionNumber(value: unknown) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    throw new BadRequestException('Select an exact mission-plan Version.');
  return value;
}
function paragraph(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Array.from(value).length > 2000
  )
    throw new BadRequestException(
      'Enter a planned activity and intended result within 2000 characters.',
    );
  return value;
}
export function publicationContent(value: unknown, successor: boolean) {
  const row = exactRecord(
    value,
    successor
      ? ['expectedHeadVersion', 'title', 'activities']
      : ['title', 'activities'],
  );
  if (
    !Array.isArray(row.activities) ||
    row.activities.length < 1 ||
    row.activities.length > 50
  )
    throw new BadRequestException('A plan needs one to50 activities.');
  const activities = row.activities.map((value: unknown) => {
    const a = exactRecord(value, [
      'key',
      'title',
      'activity',
      'intendedResult',
    ]);
    return {
      key: requireUuid(a.key),
      title: taskInput({ title: a.title }).title,
      activity: paragraph(a.activity),
      intendedResult: paragraph(a.intendedResult),
    };
  });
  if (new Set(activities.map((a) => a.key)).size !== activities.length)
    throw new BadRequestException('Activity identities must be unique.');
  return {
    title: readProjectTitle(row.title),
    activities,
    ...(successor
      ? { expectedHeadVersion: versionNumber(row.expectedHeadVersion) }
      : {}),
  };
}
