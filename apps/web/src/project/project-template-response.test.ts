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
    const successor = {
      ...templateFixture,
      version: 2,
      stages: templateFixture.stages.map((stage) => ({
        ...stage,
        tasks: stage.tasks.map((task) => ({
          ...task,
          title:
            task.key === 'clarify_request'
              ? 'Published successor title'
              : task.title,
        })),
      })),
    };
    expect(
      readTemplateCatalogue({ templates: [successor, templateFixture] }),
    ).toEqual([successor, templateFixture]);

    for (const value of [
      null,
      {},
      { templates: null },
      { templates: [{ ...templateFixture, templateKey: 'UNAPPROVED' }] },
      { templates: [{ ...templateFixture, version: 0 }] },
      { templates: [{ ...templateFixture, version: 1.5 }] },
      { templates: [{ ...templateFixture, version: 2147483648 }] },
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

it('rejects partial, future or contradictory thirteen-activity sources and incomplete copied identities', async () => {
  const { pilotSourceFixture, pilotCopyFixture } =
    await import('./project-pilot-plan.test-fixtures');
  expect(readTemplateCatalogue({ templates: [pilotSourceFixture] })).toEqual([
    pilotSourceFixture,
  ]);
  expect(readCopiedTemplatePlan({ template: pilotCopyFixture })).toEqual({
    template: pilotCopyFixture,
  });
  for (const changed of [
    { version: 2 },
    { templateKey: 'UNKNOWN' },
    { stages: [] },
    { activities: pilotSourceFixture.activities.slice(0, 12) },
    {
      activities: pilotSourceFixture.activities.map((row) => ({
        ...row,
        required: true,
      })),
    },
    {
      activities: pilotSourceFixture.activities.map((row, index) => ({
        ...row,
        key: index === 12 ? 'CT_AN12' : row.key,
      })),
    },
  ])
    expect(
      readTemplateCatalogue({
        templates: [{ ...pilotSourceFixture, ...changed }],
      }),
    ).toBeUndefined();
  expect(
    readCopiedTemplatePlan({ template: pilotSourceFixture }),
  ).toBeUndefined();
  expect(
    readCopiedTemplatePlan({
      template: {
        ...pilotCopyFixture,
        activities: pilotCopyFixture.activities.map((row) => ({
          ...row,
          taskId: pilotCopyFixture.activities[0]?.taskId,
        })),
      },
    }),
  ).toBeUndefined();
});
