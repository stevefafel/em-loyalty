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
  const [isLoading] = useState(false);

  const logout = async () => {
    setUser(null);
    setSession(null);
    // Full navigation to the server logout route, which clears the sealed
    // session cookie and (in Keycloak mode) ends the Keycloak SSO session.
    window.location.href = "/api/auth/logout";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAdmin: session?.role === "admin",
        isLoading,
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
