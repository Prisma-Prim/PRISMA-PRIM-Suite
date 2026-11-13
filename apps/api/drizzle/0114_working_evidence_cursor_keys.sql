CREATE TABLE "working_evidence_cursor_keys" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"key" text DEFAULT gen_random_uuid()::text || gen_random_uuid()::text NOT NULL,
	CONSTRAINT "working_evidence_cursor_keys_workspace_id_company_id_pk" PRIMARY KEY("workspace_id","company_id")
);
--> statement-breakpoint
ALTER TABLE "working_evidence_cursor_keys" ADD CONSTRAINT "working_evidence_cursor_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Infrastructure is provisioned with the Company, never during a paging read.
INSERT INTO working_evidence_cursor_keys(workspace_id,company_id) SELECT workspace_id,id FROM companies;
--> statement-breakpoint
CREATE FUNCTION working_evidence_company_cursor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO working_evidence_cursor_keys(workspace_id,company_id) VALUES(NEW.workspace_id,NEW.id); RETURN NEW; END $$;
--> statement-breakpoint
CREATE TRIGGER working_evidence_company_cursor AFTER INSERT ON companies FOR EACH ROW EXECUTE FUNCTION working_evidence_company_cursor();
--> statement-breakpoint
CREATE TRIGGER working_evidence_cursor_immutable BEFORE UPDATE OR DELETE ON working_evidence_cursor_keys FOR EACH ROW EXECUTE FUNCTION working_evidence_immutable();
