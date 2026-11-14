-- Every Certificate carries its issue date, approved draft and independence
-- attestation (#1344). The table is immutable, so a row stored before launch
-- without them cannot be rewritten: refuse instead of inventing history.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "certification_certificates"
		WHERE "issued_on" IS NULL
			OR "approved_draft_version_id" IS NULL
			OR "independence_attested" IS NOT TRUE
	) THEN
		RAISE EXCEPTION 'certification_certificates holds a Certificate without an issue date, an approved draft or the independence attestation; the development database must be recreated.';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "certification_certificates" DROP CONSTRAINT "certification_certificates_release_check";--> statement-breakpoint
ALTER TABLE "certification_certificates" DROP CONSTRAINT "certification_certificates_values_check";--> statement-breakpoint
ALTER TABLE "certification_certificates" ALTER COLUMN "issued_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "certification_certificates" ALTER COLUMN "approved_draft_version_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "certification_certificates" ADD CONSTRAINT "certification_certificates_release_check" CHECK ("certification_certificates"."issued_on" >= "certification_certificates"."valid_from");--> statement-breakpoint
ALTER TABLE "certification_certificates" ADD CONSTRAINT "certification_certificates_values_check" CHECK (length(btrim("certification_certificates"."number")) BETWEEN 1 AND 64 AND "certification_certificates"."valid_from" < "certification_certificates"."valid_until" AND "certification_certificates"."valid_from" < "certification_certificates"."first_surveillance_by" AND "certification_certificates"."case_revision" > 1 AND jsonb_typeof("certification_certificates"."texts") = 'array' AND "certification_certificates"."independence_attested" = true);