CREATE TYPE "public"."client_union_operation_status" AS ENUM('confirmed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."client_union_participant_role" AS ENUM('canonical', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."client_union_projection_action" AS ENUM('client.union_confirmed', 'client.union_reversed');--> statement-breakpoint
CREATE TYPE "public"."client_union_relationship_origin" AS ENUM('created', 'reused');--> statement-breakpoint
CREATE TABLE "client_union_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"intent" text NOT NULL,
	"union_operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_union_commands_intent_not_blank_check" CHECK (length("client_union_commands"."intent") > 0)
);
--> statement-breakpoint
CREATE TABLE "client_union_comparison_participants" (
	"workspace_id" uuid NOT NULL,
	"comparison_reference" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"captured_version" integer NOT NULL,
	CONSTRAINT "client_union_comparison_participants_positive_version_check" CHECK ("client_union_comparison_participants"."captured_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "client_union_comparison_relationships" (
	"workspace_id" uuid NOT NULL,
	"comparison_reference" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_union_comparisons" (
	"reference" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"selected_company_id" uuid NOT NULL,
	"normalized_identifier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_union_comparisons_identifier_not_blank_check" CHECK (length("client_union_comparisons"."normalized_identifier") > 0
        AND "client_union_comparisons"."normalized_identifier" = btrim("client_union_comparisons"."normalized_identifier"))
);
--> statement-breakpoint
CREATE TABLE "client_union_operation_companies" (
	"workspace_id" uuid NOT NULL,
	"union_operation_id" uuid NOT NULL,
	"company_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_union_operation_projections" (
	"public_reference" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"union_operation_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"action" "client_union_projection_action" NOT NULL,
	"company_local_position" integer NOT NULL,
	CONSTRAINT "client_union_operation_projections_positive_position_check" CHECK ("client_union_operation_projections"."company_local_position" > 0)
);
--> statement-breakpoint
CREATE TABLE "client_union_operation_relationships" (
	"workspace_id" uuid NOT NULL,
	"union_operation_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"origin" "client_union_relationship_origin" NOT NULL,
	"source_relationship_id" uuid,
	CONSTRAINT "client_union_operation_relationships_origin_shape_check" CHECK ((
        ("client_union_operation_relationships"."origin" = 'created' AND "client_union_operation_relationships"."source_relationship_id" IS NOT NULL)
        OR
        ("client_union_operation_relationships"."origin" = 'reused' AND "client_union_operation_relationships"."source_relationship_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "client_union_operation_snapshots" (
	"workspace_id" uuid NOT NULL,
	"union_operation_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"role" "client_union_participant_role" NOT NULL,
	"version" integer NOT NULL,
	"display_name" text NOT NULL,
	"tax_id" text,
	"address" text,
	"telephone" text,
	"general_email" text,
	"contacts" jsonb NOT NULL,
	"business_activity" text,
	CONSTRAINT "client_union_operation_snapshots_positive_version_check" CHECK ("client_union_operation_snapshots"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "client_union_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"canonical_client_account_id" uuid NOT NULL,
	"superseded_client_account_id" uuid NOT NULL,
	"normalized_identifier" text NOT NULL,
	"status" "client_union_operation_status" DEFAULT 'confirmed' NOT NULL,
	"confirmed_by_internal_user_id" uuid NOT NULL,
	"confirmed_by_workspace_membership_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"union_reason" text NOT NULL,
	"reversed_by_internal_user_id" uuid,
	"reversed_by_workspace_membership_id" uuid,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text,
	CONSTRAINT "client_union_operations_distinct_participants_check" CHECK ("client_union_operations"."canonical_client_account_id" <> "client_union_operations"."superseded_client_account_id"),
	CONSTRAINT "client_union_operations_identifier_not_blank_check" CHECK (length("client_union_operations"."normalized_identifier") > 0
        AND "client_union_operations"."normalized_identifier" = btrim("client_union_operations"."normalized_identifier")),
	CONSTRAINT "client_union_operations_reason_not_blank_check" CHECK (length(btrim("client_union_operations"."union_reason")) > 0
        AND ("client_union_operations"."reversal_reason" IS NULL
          OR length(btrim("client_union_operations"."reversal_reason")) > 0)),
	CONSTRAINT "client_union_operations_reversal_shape_check" CHECK ((
        ("client_union_operations"."status" = 'confirmed'
          AND "client_union_operations"."reversed_at" IS NULL
          AND "client_union_operations"."reversed_by_internal_user_id" IS NULL
          AND "client_union_operations"."reversed_by_workspace_membership_id" IS NULL
          AND "client_union_operations"."reversal_reason" IS NULL)
        OR
        ("client_union_operations"."status" = 'reversed'
          AND "client_union_operations"."reversed_at" IS NOT NULL
          AND "client_union_operations"."reversed_by_internal_user_id" IS NOT NULL
          AND "client_union_operations"."reversed_by_workspace_membership_id" IS NOT NULL
          AND "client_union_operations"."reversal_reason" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_comparisons_workspace_reference_unique" ON "client_union_comparisons" USING btree ("workspace_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_operations_workspace_id_unique" ON "client_union_operations" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "client_union_commands" ADD CONSTRAINT "client_union_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_commands" ADD CONSTRAINT "client_union_commands_operation_fk" FOREIGN KEY ("workspace_id","union_operation_id") REFERENCES "public"."client_union_operations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_comparison_participants" ADD CONSTRAINT "client_union_comparison_participants_comparison_fk" FOREIGN KEY ("workspace_id","comparison_reference") REFERENCES "public"."client_union_comparisons"("workspace_id","reference") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_comparison_participants" ADD CONSTRAINT "client_union_comparison_participants_client_fk" FOREIGN KEY ("workspace_id","client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_comparison_relationships" ADD CONSTRAINT "client_union_comparison_relationships_comparison_fk" FOREIGN KEY ("workspace_id","comparison_reference") REFERENCES "public"."client_union_comparisons"("workspace_id","reference") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_comparison_relationships" ADD CONSTRAINT "client_union_comparison_relationships_relationship_fk" FOREIGN KEY ("workspace_id","client_account_id","company_id","relationship_id") REFERENCES "public"."client_company_relationships"("workspace_id","client_account_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_comparisons" ADD CONSTRAINT "client_union_comparisons_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_comparisons" ADD CONSTRAINT "client_union_comparisons_selected_company_fk" FOREIGN KEY ("workspace_id","selected_company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_operation_companies" ADD CONSTRAINT "client_union_operation_companies_operation_fk" FOREIGN KEY ("workspace_id","union_operation_id") REFERENCES "public"."client_union_operations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_operation_companies" ADD CONSTRAINT "client_union_operation_companies_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_operation_projections" ADD CONSTRAINT "client_union_operation_projections_operation_fk" FOREIGN KEY ("workspace_id","union_operation_id") REFERENCES "public"."client_union_operations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_operation_projections" ADD CONSTRAINT "client_union_operation_projections_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_operation_relationships" ADD CONSTRAINT "client_union_operation_relationships_operation_fk" FOREIGN KEY ("workspace_id","union_operation_id") REFERENCES "public"."client_union_operations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_operation_relationships" ADD CONSTRAINT "client_union_operation_relationships_relationship_fk" FOREIGN KEY ("workspace_id","client_account_id","company_id","relationship_id") REFERENCES "public"."client_company_relationships"("workspace_id","client_account_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_operation_snapshots" ADD CONSTRAINT "client_union_operation_snapshots_operation_fk" FOREIGN KEY ("workspace_id","union_operation_id") REFERENCES "public"."client_union_operations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_operation_snapshots" ADD CONSTRAINT "client_union_operation_snapshots_client_fk" FOREIGN KEY ("workspace_id","client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_operations" ADD CONSTRAINT "client_union_operations_canonical_client_fk" FOREIGN KEY ("workspace_id","canonical_client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_operations" ADD CONSTRAINT "client_union_operations_superseded_client_fk" FOREIGN KEY ("workspace_id","superseded_client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_operations" ADD CONSTRAINT "client_union_operations_confirmed_by_fk" FOREIGN KEY ("workspace_id","confirmed_by_workspace_membership_id","confirmed_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_union_operations" ADD CONSTRAINT "client_union_operations_reversed_by_fk" FOREIGN KEY ("workspace_id","reversed_by_workspace_membership_id","reversed_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_commands_actor_key_unique" ON "client_union_commands" USING btree ("workspace_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_comparison_participants_identity_unique" ON "client_union_comparison_participants" USING btree ("workspace_id","comparison_reference","client_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_comparison_relationships_identity_unique" ON "client_union_comparison_relationships" USING btree ("workspace_id","comparison_reference","relationship_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_operation_companies_identity_unique" ON "client_union_operation_companies" USING btree ("workspace_id","union_operation_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_operation_projections_action_unique" ON "client_union_operation_projections" USING btree ("workspace_id","union_operation_id","company_id","action");--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_operation_projections_position_unique" ON "client_union_operation_projections" USING btree ("workspace_id","company_id","company_local_position");--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_operation_relationships_identity_unique" ON "client_union_operation_relationships" USING btree ("workspace_id","union_operation_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_operation_snapshots_identity_unique" ON "client_union_operation_snapshots" USING btree ("workspace_id","union_operation_id","client_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_operation_snapshots_role_unique" ON "client_union_operation_snapshots" USING btree ("workspace_id","union_operation_id","role");--> statement-breakpoint
CREATE INDEX "client_union_operation_snapshots_identifier_lookup" ON "client_union_operation_snapshots" USING btree ("workspace_id","tax_id") WHERE "client_union_operation_snapshots"."tax_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_operations_open_canonical_unique" ON "client_union_operations" USING btree ("workspace_id","canonical_client_account_id") WHERE "client_union_operations"."status" = 'confirmed';--> statement-breakpoint
CREATE UNIQUE INDEX "client_union_operations_open_superseded_unique" ON "client_union_operations" USING btree ("workspace_id","superseded_client_account_id") WHERE "client_union_operations"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "client_union_operations_identifier_lookup" ON "client_union_operations" USING btree ("workspace_id","normalized_identifier");