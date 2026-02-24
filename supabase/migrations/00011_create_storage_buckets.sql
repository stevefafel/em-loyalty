INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('training-pdfs', 'training-pdfs', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('collateral-pdfs', 'collateral-pdfs', true);

CREATE POLICY "Allow all operations on invoices" ON storage.objects
  FOR ALL USING (bucket_id = 'invoices');

CREATE POLICY "Allow all operations on training-pdfs" ON storage.objects
  FOR ALL USING (bucket_id = 'training-pdfs');

CREATE POLICY "Allow all operations on collateral-pdfs" ON storage.objects
  FOR ALL USING (bucket_id = 'collateral-pdfs');
