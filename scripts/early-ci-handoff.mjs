export const earlyCiHandoffProtocol = Object.freeze({
  action: Object.freeze({
    kind: 'github-pull-request-body-marker',
    marker: '<!-- agent-doctor-early-ci: required -->',
    timing: 'same-publication-write',
  }),
  completion: Object.freeze({
    statusContext: 'Early CI preflight',
    headBinding: 'pull-request-head-sha',
    requiredState: 'success',
  }),
  automaticTrigger:
    'opening, reopening, editing, or synchronizing the pull request',
});
