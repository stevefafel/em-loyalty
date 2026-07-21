-- Lock down storage: remove all anon/authenticated access to buckets.
--
-- ⚠ Apply ONLY after deploying the app version that uploads via
-- /api/storage/upload-url (server-issued signed upload tokens). The prior
-- app version uploads directly with the anon key and breaks without these
-- policies.
--
-- After this migration:
--   - invoices, scorm-packages: private. Reads/writes only via server routes
--     (service role) and short-lived signed URLs / upload tokens.
--   - training-pdfs, collateral-pdfs: public READ only (embedded viewers use
--     public URLs); writes only via server-issued upload tokens.
--   - The anon key has no storage policies at all.

UPDATE storage.buckets SET public = false WHERE id IN ('invoices', 'scorm-packages');

-- Policies as originally scripted in 00011 (local/dev environments).
DROP POLICY IF EXISTS "Allow all operations on invoices" ON storage.objects;
DROP POLICY IF EXISTS "Allow all operations on training-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Allow all operations on collateral-pdfs" ON storage.objects;

-- Policies that exist in production (created via the dashboard).
DROP POLICY IF EXISTS "Allow public uploads to invoices" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from invoices" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to training-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from training-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to collateral-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from collateral-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "scorm_packages_select" ON storage.objects;
DROP POLICY IF EXISTS "scorm_packages_insert" ON storage.objects;
DROP POLICY IF EXISTS "scorm_packages_update" ON storage.objects;
DROP POLICY IF EXISTS "scorm_packages_delete" ON storage.objects;
