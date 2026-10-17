import { describe, expect, it } from 'vitest';
import {
  readCopiedTemplatePlan,
  readTemplateCatalogue,
} from './project-template-response';
import {
  copiedPlanFixture,
  templateFixture,
} from './project-template.test-fixtures';

describe('Project Template HTTP boundary', () => {
  it('allows selecting only the supported approved identity/version and rejects malformed source definitions', () => {
    expect(readTemplateCatalogue({ templates: [templateFixture] })).toEqual([
      templateFixture,
    ]);
    expect(readTemplateCatalogue({ templates: [] })).toEqual([]);
    for (const value of [
      null,
      {},
      { templates: null },
      { templates: [{ ...templateFixture, templateKey: 'UNAPPROVED' }] },
      { templates: [{ ...templateFixture, version: 2 }] },
      { templates: [templateFixture, templateFixture] },
      { templates: [{ ...templateFixture, illustrative: false }] },
      { templates: [{ ...templateFixture, stages: [] }] },
      {
        templates: [
          {
            ...templateFixture,
            stages: templateFixture.stages.map((stage) => ({
              ...stage,
              tasks: stage.tasks.map((task) => ({ ...task, required: false })),
            })),
          },
        ],
      },
    ])
      expect(readTemplateCatalogue(value)).toBeUndefined();
  });

  it('requires four distinct copied Task identities while manual Projects have no copied model', () => {
    expect(readCopiedTemplatePlan({ template: null })).toEqual({
      template: null,
    });
    expect(readCopiedTemplatePlan({ template: copiedPlanFixture })).toEqual({
      template: copiedPlanFixture,
    });
    expect(
      readCopiedTemplatePlan({ template: templateFixture }),
    ).toBeUndefined();
    expect(
      readCopiedTemplatePlan({
        template: {
          ...copiedPlanFixture,
          stages: copiedPlanFixture.stages.map((stage) => ({
            ...stage,
            tasks: stage.tasks.map((task) => ({
              ...task,
              taskId: '00000000-0000-4000-8000-000000000001',
            })),
          })),
        },
      }),
    ).toBeUndefined();
    expect(
      readCopiedTemplatePlan({
        template: {
          ...copiedPlanFixture,
          stages: copiedPlanFixture.stages.map((stage) => ({
            ...stage,
            tasks: stage.tasks.map((task) => ({
              ...task,
              taskId: 'not-an-id',
            })),
          })),
        },
      }),
    ).toBeUndefined();
  });
});
