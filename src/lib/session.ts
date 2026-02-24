import { cookies } from "next/headers";
import type { MockSession } from "@/types/api";

export async function getSession(): Promise<MockSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("mock-session")?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MockSession;
  } catch {
    return null;
  }
}
