-- Review gate for AI-extracted invoices (ExxonMobil VA finding 79513).
-- Existing rows get a fresh run_id, review_flags = '[]' and a null
-- checks_version, so every invoice extracted before this change reads as
-- unchecked and needs an admin confirmation (or a re-run) to be approved.
-- RLS is already enabled on invoice_extractions.

-- AlterTable
ALTER TABLE "invoice_extractions" ADD COLUMN     "approved_run_id" UUID,
ADD COLUMN     "checks_version" INTEGER,
ADD COLUMN     "confirmed_at" TIMESTAMPTZ,
ADD COLUMN     "confirmed_by" UUID,
ADD COLUMN     "confirmed_run_id" UUID,
ADD COLUMN     "content_sha256" TEXT,
ADD COLUMN     "review_flags" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "run_id" UUID NOT NULL DEFAULT gen_random_uuid();

-- AddForeignKey
ALTER TABLE "invoice_extractions" ADD CONSTRAINT "invoice_extractions_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity checks prisma migrate diff does not emit.
ALTER TABLE "invoice_extractions" ADD CONSTRAINT "invoice_extractions_review_flags_is_array"
  CHECK (jsonb_typeof("review_flags") = 'array');
ALTER TABLE "invoice_extractions" ADD CONSTRAINT "invoice_extractions_confirmation_complete"
  CHECK (("confirmed_run_id" IS NULL) = ("confirmed_at" IS NULL));
