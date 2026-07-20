export const POINTS_RATE = 0.15; // 15% back on purchases
export const POINTS_PER_TRAINING = 10;
export const POINTS_PER_OIL_CHANGE = 1;
export const MIN_INITIAL_INVOICE = 2500;

// Admin dashboard "Shops that Require Attention" thresholds
export const ATTENTION_POINTS_THRESHOLD = 250; // balance strictly above this
export const ATTENTION_STREAK_MONTHS = 3; // full months before the current one

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
