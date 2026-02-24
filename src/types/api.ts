import type { UserRole } from "./database";

export interface MockSession {
  userId: string;
  role: UserRole;
  shopId: string | null;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}
