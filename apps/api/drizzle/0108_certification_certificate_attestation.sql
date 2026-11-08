-- Certificates recorded before the attestation was stored read as not attested; every new Certificate states it.
ALTER TABLE "certification_certificates" ADD COLUMN "independence_attested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "certification_certificates" ALTER COLUMN "independence_attested" DROP DEFAULT;
