export const COMPANY_CONTEXT_USE_PERMISSION = 'company.context.use' as const;
export const COMPANY_CONTEXT_ACCESS_BUNDLE = 'company_context_access' as const;
export const COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL =
  'Company Context Access' as const;

export type CompanyPermission = typeof COMPANY_CONTEXT_USE_PERMISSION;
export type CompanyRoleBundle = typeof COMPANY_CONTEXT_ACCESS_BUNDLE;

export const COMPANY_PERMISSION_BUNDLES: Readonly<
  Record<CompanyPermission, readonly CompanyRoleBundle[]>
> = {
  [COMPANY_CONTEXT_USE_PERMISSION]: [COMPANY_CONTEXT_ACCESS_BUNDLE],
};
