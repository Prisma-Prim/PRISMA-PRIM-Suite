CREATE TABLE "client_duplicate_review_candidates" (
	"workspace_id" uuid NOT NULL,
	"review_reference" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"captured_version" integer NOT NULL,
	CONSTRAINT "client_duplicate_review_candidates_positive_version_check" CHECK ("client_duplicate_review_candidates"."captured_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "client_duplicate_review_relationship_snapshots" (
	"workspace_id" uuid NOT NULL,
	"review_reference" uuid NOT NULL,
	"participant_kind" text NOT NULL,
	"client_account_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	CONSTRAINT "client_duplicate_review_relationships_participant_kind_check" CHECK ("client_duplicate_review_relationship_snapshots"."participant_kind" IN ('candidate', 'proposal'))
);
--> statement-breakpoint
CREATE TABLE "client_duplicate_reviews" (
	"reference" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"proposal_kind" text NOT NULL,
	"proposal_actor_workspace_membership_id" uuid NOT NULL,
	"attempted_company_id" uuid NOT NULL,
	"registration_command_id" uuid,
	"correction_command_id" uuid,
	"proposal_client_account_id" uuid,
	"proposal_version" integer,
	"normalized_identifier" text NOT NULL,
	"proposed_fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_duplicate_reviews_source_shape_check" CHECK ((
        ("client_duplicate_reviews"."proposal_kind" = 'registration'
          AND "client_duplicate_reviews"."registration_command_id" IS NOT NULL
          AND "client_duplicate_reviews"."correction_command_id" IS NULL
          AND "client_duplicate_reviews"."proposal_client_account_id" IS NULL
          AND "client_duplicate_reviews"."proposal_version" IS NULL)
        OR
        ("client_duplicate_reviews"."proposal_kind" = 'correction'
          AND "client_duplicate_reviews"."registration_command_id" IS NULL
          AND "client_duplicate_reviews"."correction_command_id" IS NOT NULL
          AND "client_duplicate_reviews"."proposal_client_account_id" IS NOT NULL
          AND "client_duplicate_reviews"."proposal_version" > 0)
      )),
	CONSTRAINT "client_duplicate_reviews_identifier_not_blank_check" CHECK (length("client_duplicate_reviews"."normalized_identifier") > 0
        AND "client_duplicate_reviews"."normalized_identifier" = btrim("client_duplicate_reviews"."normalized_identifier"))
);
--> statement-breakpoint
DROP INDEX "company_role_assignments_scope_unique";--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD COLUMN "permission_set_version" text;--> statement-breakpoint
UPDATE "company_role_assignments"
SET "permission_set_version" = 'v1'
WHERE "bundle"::text = 'company_director_client_access';--> statement-breakpoint
CREATE UNIQUE INDEX "client_correction_commands_review_target_unique" ON "client_account_correction_commands" USING btree ("workspace_id","actor_workspace_membership_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_registration_commands_review_target_unique" ON "client_account_registration_commands" USING btree ("workspace_id","actor_workspace_membership_id","id");--> statement-breakpoint
CREATE INDEX "client_accounts_active_tax_id_lookup" ON "client_accounts" USING btree ("workspace_id","tax_id") WHERE "client_accounts"."status" = 'active' AND "client_accounts"."tax_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "client_duplicate_reviews_list_lookup" ON "client_duplicate_reviews" USING btree ("workspace_id","attempted_company_id","created_at","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "client_duplicate_reviews_workspace_reference_unique" ON "client_duplicate_reviews" USING btree ("workspace_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "client_duplicate_reviews_registration_command_unique" ON "client_duplicate_reviews" USING btree ("workspace_id","registration_command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_duplicate_reviews_correction_command_unique" ON "client_duplicate_reviews" USING btree ("workspace_id","correction_command_id");--> statement-breakpoint
ALTER TABLE "client_duplicate_review_candidates" ADD CONSTRAINT "client_duplicate_review_candidates_review_fk" FOREIGN KEY ("workspace_id","review_reference") REFERENCES "public"."client_duplicate_reviews"("workspace_id","reference") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_duplicate_review_candidates" ADD CONSTRAINT "client_duplicate_review_candidates_client_fk" FOREIGN KEY ("workspace_id","client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_duplicate_review_relationship_snapshots" ADD CONSTRAINT "client_duplicate_review_relationships_review_fk" FOREIGN KEY ("workspace_id","review_reference") REFERENCES "public"."client_duplicate_reviews"("workspace_id","reference") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_duplicate_review_relationship_snapshots" ADD CONSTRAINT "client_duplicate_review_relationships_relationship_fk" FOREIGN KEY ("workspace_id","client_account_id","company_id","relationship_id") REFERENCES "public"."client_company_relationships"("workspace_id","client_account_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_duplicate_reviews" ADD CONSTRAINT "client_duplicate_reviews_actor_fk" FOREIGN KEY ("workspace_id","proposal_actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_duplicate_reviews" ADD CONSTRAINT "client_duplicate_reviews_attempted_company_fk" FOREIGN KEY ("workspace_id","attempted_company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_duplicate_reviews" ADD CONSTRAINT "client_duplicate_reviews_registration_command_fk" FOREIGN KEY ("workspace_id","proposal_actor_workspace_membership_id","registration_command_id") REFERENCES "public"."client_account_registration_commands"("workspace_id","actor_workspace_membership_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_duplicate_reviews" ADD CONSTRAINT "client_duplicate_reviews_correction_command_fk" FOREIGN KEY ("workspace_id","proposal_actor_workspace_membership_id","correction_command_id") REFERENCES "public"."client_account_correction_commands"("workspace_id","actor_workspace_membership_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_duplicate_reviews" ADD CONSTRAINT "client_duplicate_reviews_proposal_client_fk" FOREIGN KEY ("workspace_id","proposal_client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_duplicate_review_candidates_identity_unique" ON "client_duplicate_review_candidates" USING btree ("workspace_id","review_reference","client_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_duplicate_review_relationships_identity_unique" ON "client_duplicate_review_relationship_snapshots" USING btree ("workspace_id","review_reference","relationship_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_role_assignments_active_scope_unique" ON "company_role_assignments" USING btree ("workspace_id","company_id","workspace_membership_id","bundle") WHERE "company_role_assignments"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text <> 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
