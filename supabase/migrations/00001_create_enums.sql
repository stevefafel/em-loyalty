CREATE TYPE program_status AS ENUM ('new', 'pending', 'approved', 'rejected');
CREATE TYPE invoice_status AS ENUM ('pending', 'approved');
CREATE TYPE user_role AS ENUM ('admin', 'user');
CREATE TYPE ledger_type AS ENUM ('credit', 'debit');
