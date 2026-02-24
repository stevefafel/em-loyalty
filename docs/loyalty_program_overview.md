# Product Requirements Document (PRD): Mobil 1 Loyalty Program Portal (POC)

## 1. Executive Summary
[cite_start]**Background:** Exxon Mobil is launching a B2B loyalty program to incentivize auto repair shops to increase Mobil 1 product inventory and service volume[cite: 1, 2, 5]. [cite_start]The program focuses on rewarding high-volume purchasing, shop branding, and staff education[cite: 8, 10, 11].

[cite_start]**Purpose:** This portal provides a central hub for shops to manage participation, upload documentation, and access training[cite: 18, 22, 23]. [cite_start]This Proof of Concept (POC) demonstrates a flexible reward system that can operate independently of existing CRM platforms like Steer while maintaining future integration capabilities[cite: 16, 21].

[cite_start]**Context:** The platform serves Shop Users (Owners/Technicians) who earn rewards and Admins who verify eligibility[cite: 22, 28].

---

## 2. User Personas & Access Control

### 2.1 Roles
* [cite_start]**Loyalty Program Admin:** Oversees shop enrollment, verifies receipts, and manages the content library (Training/Marketing)[cite: 18, 24].
* [cite_start]**Shop User:** Associated with one or more shops; uploads invoices and participates in training[cite: 18, 22].

### 2.2 Multi-Shop Switching Logic

* **Shop Selection:** Upon login, users associated with multiple shops must land on a **Shop Selection Page**.
* **Session Context:** The selected `shop_id` must be stored in global state so all actions are attributed to the active shop.

---

## 3. Functional Requirements

### 3.1 Enrollment & Verification
* [cite_start]**Initial Qualification:** Shops must submit an initial invoice of **$2,500 or more** to qualify[cite: 18, 26].
* [cite_start]**Restricted Access:** All features (except the initial upload) are locked until an Admin manually sets the shop status to **"Approved"**[cite: 18].
* [cite_start]**Status Workflow:** `New` -> `Pending` (after upload) -> `Approved` (after Admin review)[cite: 18].

### 3.2 Loyalty Points & Receipt Engine
* [cite_start]**Submission:** Users upload receipts to Supabase Storage[cite: 18].
* **Point Calculation:**
    * **Rate:** 1 Loyalty Point for every $100 spent.
    * **Eligible Invoices:** Points are earned on the initial qualifying purchase and all subsequent approved receipts.
* **Ledger:** Every approved invoice generates a credit entry in a points ledger.
* **Redemption:** A "Swag Shop" tab displays items like hats, gloves, and shirts.

### 3.3 Training & Resources
* [cite_start]**Training Modules:** Modules consist of a PDF and a 5-question multiple-choice quiz[cite: 11, 22].
* [cite_start]**History Tracking:** Every completion is appended to a log to track history for both the User and the Shop[cite: 22].
* [cite_start]**Marketing Collateral:** A library of downloadable PDFs for flyers and POS materials[cite: 23].
* **Download Tracking:** Events are logged at the user and shop level.

### 3.4 Advertising & Perks
* [cite_start]**Product Ads:** A dedicated page featuring ads for `autoops.com` and `steer.io`[cite: 21].
* [cite_start]**Performance Perks:** Monthly rewards based on the volume of Mobil 1 oil changes completed[cite: 8, 38].

---

## 4. Technical Architecture (POC)

| Component | Technology |
| :--- | :--- |
| **Frontend/Backend** | Next.js (App Router) & Next.js API |
| **Database** | Supabase (PostgreSQL) |
| **Storage** | Supabase Storage (Invoices, Training PDFs, Marketing PDFs) |
| **Auth (Mock)** | Simplified role selection: Admin vs. Shop User (with Shop Switcher) |

---

## 5. Data Schema & Fields



### **5.1 Shops Table**
* `id` (UUID, PK)
* `name`, `address`, `phone` (String)
* `program_status` (Enum: `new`, `pending`, `approved`, `rejected`)
* `loyalty_points_balance` (Integer)

### **5.2 Users Table**
* `id` (UUID, PK)
* `email`, `name`, `phone` (String)
* `role` (Enum: `ADMIN`, `USER`)

### **5.3 User_Shops (Join Table)**
* `user_id` (FK to Users)
* `shop_id` (FK to Shops)

### **5.4 Invoices Table**
* `id` (UUID, PK)
* `shop_id` (FK to Shops)
* `user_id` (FK to Users)
* `file_path` (String - Supabase Storage URL)
* `amount` (Decimal)
* `status` (Enum: `pending`, `approved`)
* `is_initial` (Boolean)
* `created_at` (Timestamp)

### **5.5 Training_Modules Table**
* `id` (UUID, PK)
* `title`, `description` (String)
* `pdf_path` (String)
* `questions` (JSONB: Array of 5 questions, options, and answers)

### **5.6 Logs & Ledgers**
* **Training_Log:** `user_id`, `shop_id`, `module_id`, `completed_at`.
* **Collateral_Log:** `user_id`, `shop_id`, `collateral_id`, `downloaded_at`.
* **Loyalty_Ledger:** `shop_id`, `invoice_id`, `points_delta`, `type` (`credit`/`debit`), `created_at`.

---

## 6. Business Logic Rules for AI Implementation
1.  **File Naming:** Store files as `[shop_id]/[timestamp]_[original_name]` to prevent collisions.
2.  **Point Trigger:** Points are added to the ledger and shop balance ONLY when an Admin moves an invoice status to `approved`.
3.  **Phase Enforcement:** If `shop.program_status !== 'approved'`, the UI must block all pages except the **Initial $2,500 Invoice Upload**.
4.  **Training Log:** Do not update existing rows on retake; always **append** a new row to allow historical tracking.