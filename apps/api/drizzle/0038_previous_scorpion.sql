ALTER TYPE "public"."activity_log_action" ADD VALUE 'client_legal_entity.registered';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'client_legal_entity.corrected';--> statement-breakpoint
CREATE TABLE "client_legal_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text,
	"legal_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	CONSTRAINT "client_legal_entities_legal_name_check" CHECK (char_length("client_legal_entities"."legal_name") BETWEEN 1 AND 200),
	CONSTRAINT "client_legal_entities_tax_id_check" CHECK ("client_legal_entities"."tax_id" IS NULL OR char_length("client_legal_entities"."tax_id") BETWEEN 1 AND 500),
	CONSTRAINT "client_legal_entities_legal_address_check" CHECK ("client_legal_entities"."legal_address" IS NULL OR char_length("client_legal_entities"."legal_address") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "client_legal_entity_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"action" text NOT NULL,
	"client_account_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"legal_entity_id" uuid,
	"expected_client_version" integer NOT NULL,
	"intent" jsonb NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_legal_entity_commands_action_check" CHECK (("client_legal_entity_commands"."action" = 'register' AND "client_legal_entity_commands"."legal_entity_id" IS NULL)
        OR ("client_legal_entity_commands"."action" = 'correct' AND "client_legal_entity_commands"."legal_entity_id" IS NOT NULL)),
	CONSTRAINT "client_legal_entity_commands_positive_version_check" CHECK ("client_legal_entity_commands"."expected_client_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "client_legal_entities_client_unique" ON "client_legal_entities" USING btree ("workspace_id","client_account_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_legal_entity_commands_actor_key_unique" ON "client_legal_entity_commands" USING btree ("workspace_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "client_legal_entities" ADD CONSTRAINT "client_legal_entities_client_fk" FOREIGN KEY ("workspace_id","client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_legal_entities" ADD CONSTRAINT "client_legal_entities_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_legal_entity_commands" ADD CONSTRAINT "client_legal_entity_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_legal_entity_commands" ADD CONSTRAINT "client_legal_entity_commands_client_fk" FOREIGN KEY ("workspace_id","client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_legal_entity_commands" ADD CONSTRAINT "client_legal_entity_commands_relationship_fk" FOREIGN KEY ("workspace_id","client_account_id","company_id") REFERENCES "public"."client_company_relationships"("workspace_id","client_account_id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_legal_entity_commands" ADD CONSTRAINT "client_legal_entity_commands_legal_entity_fk" FOREIGN KEY ("workspace_id","client_account_id","legal_entity_id") REFERENCES "public"."client_legal_entities"("workspace_id","client_account_id","id") ON DELETE no action ON UPDATE no action;
