ALTER TYPE "public"."client_account_status" ADD VALUE 'superseded';
--> statement-breakpointCREATE TABLE "client_identifier_reservations" (
	"workspace_id" uuid NOT NULL,
	"normalized_identifier" text NOT NULL,
	"source_client_id" uuid NOT NULL,
	CONSTRAINT "client_identifier_reservations_exact_identifier" CHECK (length("client_identifier_reservations"."normalized_identifier") > 0 AND "client_identifier_reservations"."normalized_identifier" = btrim("client_identifier_reservations"."normalized_identifier"))
);
--> statement-breakpointCREATE TABLE "client_union_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"review_reference" uuid NOT NULL,
	"canonical_client_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"reason" text NOT NULL,
	"intent" jsonb NOT NULL,
	"result_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_union_operations_reason_not_blank" CHECK (length(btrim("client_union_operations"."reason")) BETWEEN 1 AND 2000)
);
--> statement-breakpointCREATE TABLE "client_union_projections" (
	"reference" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"action" text NOT NULL,
	CONSTRAINT "client_union_projections_action_check" CHECK ("client_union_projections"."action" IN ('client.union_confirmed', 'client.union_reversed'))
);
--> statement-breakpointCREATE TABLE "client_union_reversals" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_union_reversals_reason_not_blank" CHECK (length(btrim("client_union_reversals"."reason")) BETWEEN 1 AND 2000)
);
--> statement-breakpointCREATE TABLE "client_union_reviews" (
	"reference" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"first_client_id" uuid NOT NULL,
	"second_client_id" uuid NOT NULL,
	"normalized_identifier" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_union_reviews_distinct_clients" CHECK ("client_union_reviews"."first_client_id" <> "client_union_reviews"."second_client_id"),
	CONSTRAINT "client_union_reviews_exact_identifier" CHECK (length("client_union_reviews"."normalized_identifier") > 0 AND "client_union_reviews"."normalized_identifier" = btrim("client_union_reviews"."normalized_identifier"))
);
--> statement-breakpointCREATE UNIQUE INDEX "client_identifier_reservations_key_source_unique" ON "client_identifier_reservations" USING btree ("workspace_id","normalized_identifier","source_client_id");
--> statement-breakpointCREATE UNIQUE INDEX "client_union_operations_workspace_id_unique" ON "client_union_operations" USING btree ("workspace_id","id");
--> statement-breakpointCREATE UNIQUE INDEX "client_union_operations_review_unique" ON "client_union_operations" USING btree ("workspace_id","review_reference");
--> statement-breakpointCREATE UNIQUE INDEX "client_union_operations_actor_command_unique" ON "client_union_operations" USING btree ("workspace_id","actor_workspace_membership_id","idempotency_key");
--> statement-breakpointCREATE UNIQUE INDEX "client_union_projections_operation_company_action_unique" ON "client_union_projections" USING btree ("workspace_id","operation_id","company_id","action");
--> statement-breakpointCREATE INDEX "client_union_projections_company_lookup" ON "client_union_projections" USING btree ("workspace_id","company_id","reference");
--> statement-breakpointCREATE UNIQUE INDEX "client_union_reversals_actor_command_unique" ON "client_union_reversals" USING btree ("workspace_id","actor_workspace_membership_id","idempotency_key");
--> statement-breakpointCREATE UNIQUE INDEX "client_union_reviews_workspace_reference_unique" ON "client_union_reviews" USING btree ("workspace_id","reference");
--> statement-breakpointALTER TABLE "client_identifier_reservations" ADD CONSTRAINT "client_identifier_reservations_source_fk" FOREIGN KEY ("workspace_id","source_client_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_operations" ADD CONSTRAINT "client_union_operations_review_fk" FOREIGN KEY ("workspace_id","review_reference") REFERENCES "public"."client_union_reviews"("workspace_id","reference") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_operations" ADD CONSTRAINT "client_union_operations_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_operations" ADD CONSTRAINT "client_union_operations_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_operations" ADD CONSTRAINT "client_union_operations_canonical_fk" FOREIGN KEY ("workspace_id","canonical_client_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_projections" ADD CONSTRAINT "client_union_projections_operation_fk" FOREIGN KEY ("workspace_id","operation_id") REFERENCES "public"."client_union_operations"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_projections" ADD CONSTRAINT "client_union_projections_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_reversals" ADD CONSTRAINT "client_union_reversals_operation_fk" FOREIGN KEY ("workspace_id","operation_id") REFERENCES "public"."client_union_operations"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_reversals" ADD CONSTRAINT "client_union_reversals_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_reversals" ADD CONSTRAINT "client_union_reversals_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_reviews" ADD CONSTRAINT "client_union_reviews_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_reviews" ADD CONSTRAINT "client_union_reviews_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_reviews" ADD CONSTRAINT "client_union_reviews_first_fk" FOREIGN KEY ("workspace_id","first_client_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpointALTER TABLE "client_union_reviews" ADD CONSTRAINT "client_union_reviews_second_fk" FOREIGN KEY ("workspace_id","second_client_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION reject_client_union_history_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Client union history is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER client_union_operations_immutable BEFORE UPDATE OR DELETE ON client_union_operations FOR EACH ROW EXECUTE FUNCTION reject_client_union_history_change();
--> statement-breakpoint
CREATE TRIGGER client_union_reversals_immutable BEFORE UPDATE OR DELETE ON client_union_reversals FOR EACH ROW EXECUTE FUNCTION reject_client_union_history_change();
--> statement-breakpoint
CREATE TRIGGER client_union_projections_immutable BEFORE UPDATE OR DELETE ON client_union_projections FOR EACH ROW EXECUTE FUNCTION reject_client_union_history_change();
--> statement-breakpoint
CREATE TRIGGER client_identifier_reservations_immutable BEFORE UPDATE OR DELETE ON client_identifier_reservations FOR EACH ROW EXECUTE FUNCTION reject_client_union_history_change();
--> statement-breakpoint
CREATE TRIGGER client_union_reviews_immutable BEFORE UPDATE OR DELETE ON client_union_reviews FOR EACH ROW EXECUTE FUNCTION reject_client_union_history_change();
