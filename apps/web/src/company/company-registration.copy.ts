export const companyRegistrationCopy = {
  permissionDenied:
    'You do not have permission to register or view Companies in this Workspace.',
  displayNameRequired: 'Company display name is required.',
  retryableError:
    'We could not register the Company. Your request can be retried safely.',
  eyebrow: 'Workspace setup',
  title: 'Provider Company',
  description: 'Register your provider Company in this Workspace.',
  displayNameLabel: 'Company display name',
  submit: 'Register Company',
  submitting: 'Registering…',
  active: 'Active',
  workspace: 'Workspace',
  created: 'Created',
  authorizedUser: 'an authorized user',
  registeredBy: (displayName: string) => `Registered by ${displayName}`,
} as const;
