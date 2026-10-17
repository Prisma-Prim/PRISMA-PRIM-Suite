import type {
  TemplateVersion,
  CopiedTemplatePlan,
} from './project-template-response';

export const templateFixture = {
  templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE',
  version: 1,
  title: 'Préparation d’une mission de conseil',
  illustrative: true,
  stages: [
    {
      key: 'scoping',
      title: 'Cadrage',
      tasks: [
        {
          key: 'clarify_request',
          title: 'Clarifier la demande',
          required: true,
        },
        {
          key: 'confirm_scope',
          title: 'Confirmer le périmètre',
          required: true,
        },
      ],
    },
    {
      key: 'preparation',
      title: 'Préparation',
      tasks: [
        {
          key: 'collect_questionnaire',
          title: 'Recueillir le questionnaire',
          required: true,
        },
        { key: 'prepare_plan', title: 'Préparer le plan', required: true },
      ],
    },
  ],
} satisfies TemplateVersion;
export const copiedPlanFixture = {
  ...templateFixture,
  stages: [
    {
      key: 'scoping',
      title: 'Cadrage',
      tasks: [
        {
          key: 'clarify_request',
          title: 'Clarifier la demande',
          required: true,
          taskId: '00000000-0000-4000-8000-000000000001',
        },
        {
          key: 'confirm_scope',
          title: 'Confirmer le périmètre',
          required: true,
          taskId: '00000000-0000-4000-8000-000000000002',
        },
      ],
    },
    {
      key: 'preparation',
      title: 'Préparation',
      tasks: [
        {
          key: 'collect_questionnaire',
          title: 'Recueillir le questionnaire',
          required: true,
          taskId: '00000000-0000-4000-8000-000000000003',
        },
        {
          key: 'prepare_plan',
          title: 'Préparer le plan',
          required: true,
          taskId: '00000000-0000-4000-8000-000000000004',
        },
      ],
    },
  ],
} satisfies CopiedTemplatePlan;
