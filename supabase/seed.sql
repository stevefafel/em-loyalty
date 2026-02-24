-- Admin user
INSERT INTO users (id, email, name, phone, role) VALUES
  ('a1000000-0000-4000-a000-000000000001', 'admin@mobil1.com', 'Admin User', '555-0100', 'admin');

-- Shop users
INSERT INTO users (id, email, name, phone, role) VALUES
  ('b2000000-0000-4000-a000-000000000001', 'owner@quicklube.com', 'John Quick', '555-0201', 'user'),
  ('b3000000-0000-4000-a000-000000000001', 'tech@quicklube.com', 'Jane Wrench', '555-0301', 'user');

-- Shops (one approved, one new)
INSERT INTO shops (id, name, address, phone, program_status, loyalty_points_balance) VALUES
  ('c1000000-0000-4000-a000-000000000001', 'Quick Lube Downtown', '123 Main St, Houston TX 77001', '555-1001', 'approved', 50),
  ('c2000000-0000-4000-a000-000000000001', 'Express Oil North', '456 Oak Ave, Houston TX 77002', '555-1002', 'new', 0);

-- User-Shop associations (John owns both, Jane works at Quick Lube only)
INSERT INTO user_shops (user_id, shop_id) VALUES
  ('b2000000-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000001'),
  ('b2000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000001'),
  ('b3000000-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000001');

-- Sample approved initial invoice for Quick Lube Downtown
INSERT INTO invoices (id, shop_id, user_id, file_path, amount, status, is_initial) VALUES
  ('d1000000-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000001',
   'b2000000-0000-4000-a000-000000000001',
   'c1000000-0000-4000-a000-000000000001/1700000000000_initial_invoice.pdf',
   3200.00, 'approved', true);

-- Ledger entry for the approved invoice (32 points for $3,200)
INSERT INTO loyalty_ledger (shop_id, invoice_id, points_delta, type, description) VALUES
  ('c1000000-0000-4000-a000-000000000001', 'd1000000-0000-4000-a000-000000000001',
   32, 'credit', 'Initial qualifying invoice approved');

-- Sample training modules
INSERT INTO training_modules (id, title, description, pdf_path, questions) VALUES
  ('e1000000-0000-4000-a000-000000000001',
   'Mobil 1 Product Knowledge',
   'Learn about the full Mobil 1 product lineup and recommended applications.',
   'training/mobil1_product_knowledge.pdf',
   '[
     {"question": "What is the recommended oil change interval for Mobil 1 Extended Performance?", "options": ["5,000 miles", "10,000 miles", "15,000 miles", "20,000 miles"], "correct_index": 3},
     {"question": "Which Mobil 1 product is designed for high-mileage vehicles?", "options": ["Mobil 1 FS", "Mobil 1 High Mileage", "Mobil 1 Truck & SUV", "Mobil 1 Racing"], "correct_index": 1},
     {"question": "What base oil technology does Mobil 1 use?", "options": ["Group II", "Group III", "Group IV (PAO)", "Group V"], "correct_index": 2},
     {"question": "Which viscosity is most commonly used in modern vehicles?", "options": ["10W-40", "5W-30", "0W-20", "20W-50"], "correct_index": 2},
     {"question": "What is a key benefit of synthetic oil vs conventional?", "options": ["Lower cost", "Better high-temp protection", "Thicker viscosity", "Faster drain intervals"], "correct_index": 1}
   ]'::jsonb),
  ('e2000000-0000-4000-a000-000000000001',
   'Shop Branding Guidelines',
   'How to properly display Mobil 1 branding and signage in your shop.',
   'training/branding_guidelines.pdf',
   '[
     {"question": "What is the minimum size for exterior Mobil 1 signage?", "options": ["12x12 inches", "24x24 inches", "36x36 inches", "48x48 inches"], "correct_index": 1},
     {"question": "Which colors are in the Mobil 1 brand palette?", "options": ["Red and Blue", "Red, White, and Blue", "Black and Gold", "Green and White"], "correct_index": 1},
     {"question": "Where should the Mobil 1 logo be placed in the service bay?", "options": ["Floor", "Visible wall near entrance", "Ceiling", "Restroom"], "correct_index": 1},
     {"question": "Can you modify the Mobil 1 logo for your shop?", "options": ["Yes, any way", "Yes, with approval", "No, never", "Only the colors"], "correct_index": 2},
     {"question": "How often should branding materials be replaced?", "options": ["Monthly", "Quarterly", "Annually", "When damaged or faded"], "correct_index": 3}
   ]'::jsonb);

-- Sample collateral
INSERT INTO collateral (id, title, description, file_path, category) VALUES
  ('f1000000-0000-4000-a000-000000000001', 'Mobil 1 Service Menu Flyer', 'Printable service menu for customer-facing display', 'collateral/service_menu_flyer.pdf', 'POS Materials'),
  ('f2000000-0000-4000-a000-000000000001', 'Oil Change Promotion Poster', 'Seasonal promotion poster template', 'collateral/promo_poster.pdf', 'Promotions'),
  ('f3000000-0000-4000-a000-000000000001', 'Mobil 1 Product Comparison Chart', 'Side-by-side product comparison for technicians', 'collateral/product_comparison.pdf', 'Technical');
