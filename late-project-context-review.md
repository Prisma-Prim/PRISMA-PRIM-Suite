# Late configured provider Project-context findings

Configured provider updates produced two further receipts without any new review request from root: review5636473280 on90a8251 reported discussion_r4365728725 (hidden Project result lifetime); review5636590203 on3d53273 reported discussion_r4365806692 (Project lifecycle refresh). Root discovered these unresolved threads during the final disposition check and cancelled CI40057481783. Its actual overall conclusion is cancelled; previous API/web/browser successes are not relabeled a complete final gate.

## Triage and bounded scope

The hidden Project finding is blocking under §27 and acceptance7: TaskProjects deliberately caches ordinary Task owners in hidden containers. TaskResults therefore remained mounted after selection moved to another Project, retaining result drafts/uncertain commands and processing late downloads.

The refresh finding has a valid blocking subset: the Project status can refresh to closed after another actor closes Tasks/the Project, while the local Task detail/version stays cached. Result mutability and eligible references must re-read with that observed status. The provider's Project-reopening premise does not apply: completed/cancelled Projects remain terminal under §23. No reopening or new lifecycle transition is implemented.

## Correction and public proof

The selected Project now explicitly owns whether its TaskResults is mounted. Inactive Project result owners unmount and abort reads/history/downloads; ordinary Task cache/drafts remain. An observed ProjectStatus refreshes the active result availability through the existing read effect, alongside observed Task version. Status is not added to the result lifetime key: an uncertain historical command in the active Task retains its exact body/key, including after Project closure.

Six real owning-UI scenarios through ProjectTasks and the external HTTP boundary failed on unchanged3d53273 after test-fixture ambiguity/text corrections, then passed after the focused fix. They cover hidden draft/late PDF retirement, an aborted PDF signal despite a late transport reply, pending/uncertain command retirement, first/corrected-result read-only refresh with a cached Task, and exact historical retry across observed closure. Ordinary Task draft preservation is asserted. All177 affected Task/result/localization cases pass. Strengthened PDF proof and strict types pass; full lint/format passed, with a focused final-file check after strengthening. Broader whole-web and actual browser/App proof are separately guarded on frozen805c615.

## Standards then Spec examination

Standards: the existing validated ProjectStatus type and an explicit named active prop keep interfaces narrow. No new permission/state, dependency, assertion or owning-module mock. The result owner remains stable through ordinary Task refreshes; conditional mounting concerns only actual Project selection. Existing Task cache ownership is unchanged.

Spec: every recorded provider finding has been examined against §27, not accepted as an instruction to invent Project reopening. Selection change retires result UI and late replies; current Project lifecycle refresh revalidates read-only state through the server-owned snapshot. Active uncertain receipts remain independently recoverable. Same-pattern inspection includes Task selection keys, Project hidden cache, ProjectWorkspace selection/stale-Client retirement and App Actor/Company/session ownership. No wider workflow, permission or data-integrity change.

These are focused fixes inside the original Task-result acceptance contract, incorporated by amending the same correction commit to805c61560987194f85e817e2adbf6541868b87ef. They are not new blockers from the one explicitly requested independent sensitive confirmation, which completed with zero new findings on9fe03ef. No third independent review/confirmation or duplicate provider trigger is requested. The original Workspace authority fallback/lifetime-key logic is byte-identical; earlier confirmation does not attest to these later context changes. All configured-provider threads must have a concrete disposition before any fresh final CI dispatch.

Final verification: frozen805c615 whole web2978passed, ordinary Task browser16passed and actual-App/PostgreSQL2passed with clean before/after guards. Configured-provider new+1 feedback completed03:42:56Z with all threads resolved before final complete CI40059640331; all16jobs/all10runtime Test steps passed.
