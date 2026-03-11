export const POINTS_RATE = 0.15; // 15% back on purchases
export const POINTS_PER_TRAINING = 10;
export const POINTS_PER_OIL_CHANGE = 1;
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
  SCORM_PACKAGES: "scorm-packages",
} as const;
