ALTER TYPE "public"."activity_log_action" ADD VALUE 'workspace_invitation.accepted' BEFORE 'internal_user.provisioned';--> statement-breakpoint
CREATE TABLE "workspace_invitation_acceptances" (
	"invitation_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"internal_user_id" uuid NOT NULL,
	"workspace_membership_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_invitation_acceptances" ADD CONSTRAINT "workspace_invitation_acceptances_invitation_fk" FOREIGN KEY ("workspace_id","invitation_id") REFERENCES "public"."workspace_invitations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation_acceptances" ADD CONSTRAINT "workspace_invitation_acceptances_recipient_fk" FOREIGN KEY ("workspace_id","workspace_membership_id","internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitation_acceptances_key_unique" ON "workspace_invitation_acceptances" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE TABLE "workspace_invitation_proofs" (
	"invitation_id" uuid PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"sealed_token" text NOT NULL,
	CONSTRAINT "workspace_invitation_proofs_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_invitation_proofs" ADD CONSTRAINT "workspace_invitation_proofs_invitation_id_workspace_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."workspace_invitations"("id") ON DELETE no action ON UPDATE no action;