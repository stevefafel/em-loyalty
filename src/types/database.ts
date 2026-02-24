export type ProgramStatus = "new" | "pending" | "approved" | "rejected";
export type InvoiceStatus = "pending" | "approved" | "rejected";
export type UserRole = "admin" | "user";
export type LedgerType = "credit" | "debit";

export interface Shop {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  program_status: ProgramStatus;
  loyalty_points_balance: number;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  created_at: string;
}

export interface UserShop {
  user_id: string;
  shop_id: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  shop_id: string;
  user_id: string;
  file_path: string;
  amount: number;
  status: InvoiceStatus;
  is_initial: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrainingModule {
  id: string;
  title: string;
  description: string | null;
  pdf_path: string | null;
  questions: QuizQuestion[];
  created_at: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
}

export interface TrainingLogEntry {
  id: string;
  user_id: string;
  shop_id: string;
  module_id: string;
  score: number;
  completed_at: string;
}

export interface Collateral {
  id: string;
  title: string;
  description: string | null;
  file_path: string;
  category: string | null;
  created_at: string;
}

export interface CollateralLogEntry {
  id: string;
  user_id: string;
  shop_id: string;
  collateral_id: string;
  downloaded_at: string;
}

export interface LoyaltyLedgerEntry {
  id: string;
  shop_id: string;
  invoice_id: string | null;
  points_delta: number;
  type: LedgerType;
  description: string | null;
  created_at: string;
}
