import { isProject } from './project-directory';
import { readOptionalResponsibleMember } from './project-responsible-response';

/** Additive HTTP reader: validate only consumed facts and the exact requested scope. */
export function readClientProjectPage(
  value: unknown,
  expected: { companyId: string; clientDossierId: string; offset: number },
) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Client Project page.');
  const page = Object.fromEntries(Object.entries(value));
  if (
    page.companyId !== expected.companyId ||
    page.clientDossierId !== expected.clientDossierId ||
    page.offset !== expected.offset ||
    page.pageSize !== 25 ||
    typeof page.hasMore !== 'boolean' ||
    !Array.isArray(page.items) ||
    page.items.length > 25 ||
    (page.hasMore && page.items.length !== 25)
  )
    throw new Error('Mismatched Client Project page.');
  const rows: unknown[] = page.items;
  const items = rows.map((value) => {
    if (
      !isProject(value) ||
      !value.id ||
      !value.title.trim() ||
      value.companyId !== expected.companyId ||
      value.clientDossierId !== expected.clientDossierId
    )
      throw new Error('Mismatched Client Project.');
    const fields = Object.fromEntries(Object.entries(value));
    return {
      ...value,
      responsible: readOptionalResponsibleMember(fields.responsible),
    };
  });
  if (new Set(items.map((row) => row.id)).size !== items.length)
    throw new Error('Duplicate Client Project.');
  return { ...expected, pageSize: 25, hasMore: page.hasMore, items };
}
export type ClientProjectPage = ReturnType<typeof readClientProjectPage>;
