import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { authMode } from "@/lib/auth/config";
import { loginErrorMessage } from "@/lib/auth/login-errors";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const keycloak = authMode === "keycloak";

  // The OIDC routes bounce failures back here with ?error=. Without this the
  // user just sees the login screen again and cannot tell a failed sign-in from
  // never having started one.
  const { error } = await searchParams;
  const errorMessage = loginErrorMessage(error);

  // Only query users/shops for the mock picker; keycloak mode needs no DB.
  let users: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
  }[] = [];
  let shopsByUser: Record<
    string,
    { id: string; name: string; program_status: string }[]
  > = {};

  if (!keycloak) {
    users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
      },
      orderBy: { role: "asc" },
    });

    const userShops = await prisma.userShop.findMany({
      include: {
        shop: { select: { id: true, name: true, program_status: true } },
      },
    });

    shopsByUser = {};
    for (const us of userShops) {
      if (!shopsByUser[us.user_id]) shopsByUser[us.user_id] = [];
      if (us.shop) shopsByUser[us.user_id].push(us.shop);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-white overflow-hidden">
      {/* Red accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-exxon-red" />

      {/* Red Pegasus brand mark — offset to the right, kept fully in frame.
          Hidden on narrow screens where it would sit under the card. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/Mobil_Pegasus_red_RGB-TM.png"
        alt=""
        className="absolute right-10 bottom-10 hidden h-52 pointer-events-none lg:block"
      />

      {/* Card keeps a hairline border so it stays distinct from the white page. */}
      <div className="w-full max-w-md space-y-8 rounded-xl border border-exxon-charcoal/10 bg-white p-8 shadow-xl relative z-10">
        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mobil1-logo.svg" alt="Mobil 1" className="h-12" />
          {/* mt adds to the flex gap, widening only the logo-to-heading gap. */}
          <h1 className="mt-3 text-2xl font-bold text-exxon-charcoal">
            Premium Growth Program
          </h1>
          <p className="text-sm text-exxon-gray">
            {keycloak
              ? "Sign in with your Steer account to continue"
              : "Select a user to sign in (POC mock auth)"}
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-md border border-exxon-red/30 bg-exxon-red/5 px-4 py-3 text-sm text-exxon-charcoal"
          >
            {errorMessage}
          </div>
        )}

        {keycloak ? (
          <a
            href="/api/auth/login"
            className="block w-full rounded-md bg-exxon-red px-4 py-2 text-center font-semibold text-white hover:bg-exxon-red-dark"
          >
            Sign In
          </a>
        ) : (
          <LoginForm users={users} shopsByUser={shopsByUser} />
        )}

      </div>
    </div>
  );
}
