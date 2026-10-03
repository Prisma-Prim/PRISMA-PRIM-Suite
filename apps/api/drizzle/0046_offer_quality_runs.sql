CREATE TABLE "offer_quality_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" integer GENERATED ALWAYS AS IDENTITY (sequence name "offer_quality_runs_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"offer_version_id" uuid NOT NULL,
	"rule_set" text DEFAULT 'OFFER_QUALITY_ILLUSTRATIVE' NOT NULL,
	"rule_set_version" integer DEFAULT 1 NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	"results" jsonb NOT NULL,
	CONSTRAINT "offer_quality_runs_rule_set_check" CHECK ("offer_quality_runs"."rule_set" = 'OFFER_QUALITY_ILLUSTRATIVE' AND "offer_quality_runs"."rule_set_version" = 1),
	CONSTRAINT "offer_quality_runs_results_check" CHECK ((CASE WHEN jsonb_typeof("offer_quality_runs"."results") <> 'array' THEN false ELSE
    jsonb_array_length("offer_quality_runs"."results") = 8
    AND "offer_quality_runs"."results"->0->>'code' = 'PRICING_SNAPSHOT_COHERENT' AND "offer_quality_runs"."results"->0->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->1->>'code' = 'CURRENCY_UNCHANGED' AND "offer_quality_runs"."results"->1->>'status' IN ('PASS','WARNING')
    AND "offer_quality_runs"."results"->2->>'code' = 'VALIDITY_OPEN' AND "offer_quality_runs"."results"->2->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->3->>'code' = 'RECIPIENT_AVAILABLE' AND "offer_quality_runs"."results"->3->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->4->>'code' = 'RECIPIENT_IDENTITY_CURRENT' AND "offer_quality_runs"."results"->4->>'status' IN ('PASS','WARNING')
    AND "offer_quality_runs"."results"->5->>'code' = 'RECIPIENT_TAX_ID_RECORDED' AND "offer_quality_runs"."results"->5->>'status' IN ('PASS','WARNING')
    AND "offer_quality_runs"."results"->6->>'code' = 'PRICING_CLIENT_CONTEXT_COHERENT' AND "offer_quality_runs"."results"->6->>'status' IN ('PASS','WARNING')
    AND "offer_quality_runs"."results"->7->>'code' = 'PROVISIONAL_MARKER_PRESENT' AND "offer_quality_runs"."results"->7->>'status' IN ('PASS','ERROR') END) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "offer_commands" ADD COLUMN "kind" text DEFAULT 'CREATE_OFFER' NOT NULL;--> statement-breakpoint
ALTER TABLE "offer_commands" ADD COLUMN "result_quality_run_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_versions_offer_id_unique" ON "offer_versions" USING btree ("workspace_id","company_id","offer_id","id");--> statement-breakpoint
ALTER TABLE "offer_quality_runs" ADD CONSTRAINT "offer_quality_runs_version_fk" FOREIGN KEY ("workspace_id","company_id","offer_id","offer_version_id") REFERENCES "public"."offer_versions"("workspace_id","company_id","offer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_quality_runs" ADD CONSTRAINT "offer_quality_runs_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_quality_runs_scope_id_unique" ON "offer_quality_runs" USING btree ("workspace_id","company_id","offer_id","id");--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_quality_result_fk" FOREIGN KEY ("workspace_id","company_id","result_offer_id","result_quality_run_id") REFERENCES "public"."offer_quality_runs"("workspace_id","company_id","offer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_kind_result_check" CHECK (("offer_commands"."kind" = 'CREATE_OFFER' AND "offer_commands"."result_quality_run_id" IS NULL) OR ("offer_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "offer_commands"."result_quality_run_id" IS NOT NULL));
--> statement-breakpoint
CREATE FUNCTION prevent_offer_quality_run_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Offer Quality Check runs are immutable.' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER offer_quality_runs_immutable BEFORE UPDATE OR DELETE ON offer_quality_runs
FOR EACH ROW EXECUTE FUNCTION prevent_offer_quality_run_change();
