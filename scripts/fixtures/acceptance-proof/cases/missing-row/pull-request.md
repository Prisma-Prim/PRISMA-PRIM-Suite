## Outcome

A user registers a Client and finds it in the directory.

Closes #501

## Acceptance proof

| Criterion | Kind | Functional proof                                                                                          | Visual proof                                                                                              |
| --------- | ---- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1         | UI   | `apps/web/e2e/client-registration.acceptance.spec.ts :: registers a Client and shows it in the directory` | `apps/web/e2e/client-registration.acceptance.spec.ts :: registers a Client and shows it in the directory` |
| 3         | UI   | `apps/web/src/client/client-registration-form.test.tsx :: shows the duplicate legal identifier error`     | `apps/web/e2e/client-registration.acceptance.spec.ts :: registers a Client and shows it in the directory` |

## Risks and merge danger

Door: two-way.
