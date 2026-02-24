import { prisma } from "@/lib/prisma";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true },
    orderBy: { role: "asc" },
  });

  const userShops = await prisma.userShop.findMany({
    include: {
      shop: { select: { id: true, name: true, program_status: true } },
    },
  });

  const shopsByUser: Record<
    string,
    { id: string; name: string; program_status: string }[]
  > = {};

  for (const us of userShops) {
    if (!shopsByUser[us.user_id]) shopsByUser[us.user_id] = [];
    if (us.shop) shopsByUser[us.user_id].push(us.shop);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-exxon-charcoal">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-2xl">
        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mobil1-logo.svg"
            alt="Mobil 1"
            className="h-12"
          />
          <h1 className="text-2xl font-bold text-exxon-charcoal">
            Loyalty Program Portal
          </h1>
          <p className="text-sm text-exxon-gray">
            Select a user to sign in (POC mock auth)
          </p>
        </div>
        <LoginForm users={users || []} shopsByUser={shopsByUser} />
      </div>
    </div>
  );
}
