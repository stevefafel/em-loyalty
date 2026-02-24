"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@/types/database";
import type { MockSession } from "@/types/api";

interface AuthState {
  user: User | null;
  session: MockSession | null;
  isAdmin: boolean;
  isLoading: boolean;
  login: (userId: string, shopId?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({
  children,
  initialSession,
  initialUser,
}: {
  children: ReactNode;
  initialSession: MockSession | null;
  initialUser: User | null;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [session, setSession] = useState<MockSession | null>(initialSession);
  const [isLoading, setIsLoading] = useState(false);

  const login = async (userId: string, shopId?: string) => {
    setIsLoading(true);
    const res = await fetch("/api/auth/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, shopId }),
    });
    const { data } = await res.json();
    setUser(data.user);
    setSession(data.session);
    setIsLoading(false);
  };

  const logout = async () => {
    await fetch("/api/auth/mock", { method: "DELETE" });
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAdmin: session?.role === "admin",
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
