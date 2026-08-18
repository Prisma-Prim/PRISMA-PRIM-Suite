INSERT INTO "workspace_permission_grants" (
	"workspace_id",
	"workspace_membership_id",
	"permission"
)
SELECT
	"workspace_id",
	"workspace_membership_id",
	'company.assignment.manage'::"workspace_permission"
FROM "workspace_permission_grants"
WHERE "permission" = 'company.manage'::"workspace_permission"
ON CONFLICT ("workspace_id", "workspace_membership_id", "permission") DO NOTHING;
