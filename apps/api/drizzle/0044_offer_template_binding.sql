-- Existing O1 Offer Versions are explicitly bound to the first illustrative Template.
-- The backfill adds only the binding and preserves all immutable business inputs.
ALTER TABLE "offer_versions" ADD COLUMN "template_code" text;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "template_version" integer;--> statement-breakpoint
UPDATE "offer_versions"
SET "template_code" = 'OFFER_ILLUSTRATIVE', "template_version" = 1;--> statement-breakpoint
ALTER TABLE "offer_versions" ALTER COLUMN "template_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "offer_versions" ALTER COLUMN "template_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_template_check" CHECK ("offer_versions"."template_code" = 'OFFER_ILLUSTRATIVE'
        AND "offer_versions"."template_version" = 1);
