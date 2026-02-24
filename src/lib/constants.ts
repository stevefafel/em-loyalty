export const POINTS_PER_DOLLAR = 1;
export const DOLLAR_UNIT = 100;
export const MIN_INITIAL_INVOICE = 2500;

export const PROGRAM_STATUS = {
  NEW: "new",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export const INVOICE_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export const USER_ROLE = {
  ADMIN: "admin",
  USER: "user",
} as const;

export const LEDGER_TYPE = {
  CREDIT: "credit",
  DEBIT: "debit",
} as const;

export const STORAGE_BUCKETS = {
  INVOICES: "invoices",
  TRAINING_PDFS: "training-pdfs",
  COLLATERAL_PDFS: "collateral-pdfs",
} as const;
