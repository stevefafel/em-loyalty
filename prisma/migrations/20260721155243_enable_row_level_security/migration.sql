-- Enable Row-Level Security on all public tables.
-- No policies are created: the anon/authenticated roles used by Supabase's
-- auto-generated REST API are denied all access by default. Prisma is
-- unaffected because it connects as the table owner (postgres), which
-- bypasses RLS.

ALTER TABLE "shops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_shops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_extractions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_line_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collateral" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collateral_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oil_change_counts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pegasus_awards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
