CREATE UNIQUE INDEX "contract_versions_contract_identity_unique" ON "contract_versions" USING btree ("workspace_id","company_id","contract_id","id");--> statement-breakpoint
CREATE TABLE "contract_quality_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" integer GENERATED ALWAYS AS IDENTITY (sequence name "contract_quality_runs_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"contract_version_id" uuid NOT NULL,
	"rule_set" text DEFAULT 'CONTRACT_QUALITY_ILLUSTRATIVE' NOT NULL,
	"rule_set_version" integer DEFAULT 1 NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	"results" jsonb NOT NULL,
	CONSTRAINT "contract_quality_runs_ruleset_check" CHECK ("contract_quality_runs"."rule_set" = 'CONTRACT_QUALITY_ILLUSTRATIVE' AND "contract_quality_runs"."rule_set_version" = 1 AND jsonb_typeof("contract_quality_runs"."results") = 'array')
);
--> statement-breakpoint
ALTER TABLE "contract_commands" ADD COLUMN "kind" text DEFAULT 'CREATE' NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_commands" ADD COLUMN "result_quality_run_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_quality_runs" ADD CONSTRAINT "contract_quality_runs_version_fk" FOREIGN KEY ("workspace_id","company_id","contract_id","contract_version_id") REFERENCES "public"."contract_versions"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_quality_runs" ADD CONSTRAINT "contract_quality_runs_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_quality_runs_scope_unique" ON "contract_quality_runs" USING btree ("workspace_id","company_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_run_fk" FOREIGN KEY ("workspace_id","company_id","result_contract_id","result_quality_run_id") REFERENCES "public"."contract_quality_runs"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_kind_check" CHECK (("contract_commands"."kind" = 'CREATE' AND "contract_commands"."result_quality_run_id" IS NULL) OR ("contract_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "contract_commands"."result_quality_run_id" IS NOT NULL));
--> statement-breakpoint
CREATE TRIGGER contract_quality_runs_immutable BEFORE UPDATE OR DELETE ON contract_quality_runs FOR EACH ROW EXECUTE FUNCTION guard_c1_immutable_record();
--> statement-breakpoint
CREATE FUNCTION guard_c3_quality_results() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE codes text[] := ARRAY['SOURCE_COMPANY_MATCHES','PARTY_AVAILABLE','PARTY_MATCHES_SOURCE','PARTY_IDENTITY_MATCHES_SOURCE','PARTY_IDENTITY_CURRENT','PARTY_TAX_ID_RECORDED','PRICE_MATCHES_ACCEPTED_OFFER','PRICING_SNAPSHOT_COHERENT','CONDITIONS_MATCH_ACCEPTED_OFFER','ADDED_CONDITIONS_CONFIRMED'];
 term_end date;
 item jsonb;
 code text;
 severity text;
 idx integer := 0;
BEGIN
 SELECT term_ends_on INTO term_end FROM contract_versions WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND contract_id=NEW.contract_id AND id=NEW.contract_version_id;
 IF term_end IS NOT NULL THEN codes := array_append(codes,'TERM_END_NOT_PASSED'); END IF;
 codes := array_append(codes,'PROVISIONAL_MARKER_PRESENT');
 IF jsonb_typeof(NEW.results) <> 'array' OR jsonb_array_length(NEW.results) <> cardinality(codes) THEN RAISE EXCEPTION 'Invalid Contract Quality Check results' USING ERRCODE='23514'; END IF;
 FOREACH code IN ARRAY codes LOOP
  item := NEW.results->idx;
  severity := CASE WHEN code IN ('PARTY_IDENTITY_MATCHES_SOURCE','PARTY_IDENTITY_CURRENT','ADDED_CONDITIONS_CONFIRMED','TERM_END_NOT_PASSED') THEN 'WARNING' ELSE 'ERROR' END;
  IF (jsonb_typeof(item)='object' AND (item-ARRAY['code','status']::text[])='{}'::jsonb AND item->>'code'=code AND item->>'status' IN ('PASS',severity)) IS NOT TRUE THEN RAISE EXCEPTION 'Invalid Contract Quality Check result' USING ERRCODE='23514'; END IF;
  idx := idx + 1;
 END LOOP;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contract_quality_results_valid BEFORE INSERT ON contract_quality_runs FOR EACH ROW EXECUTE FUNCTION guard_c3_quality_results();
