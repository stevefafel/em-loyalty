import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AuthProvider } from "@/context/auth-context";
import { ShopProvider } from "@/context/shop-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import type { Shop, User } from "@/types/database";

// Prisma returns Date objects; our manual types expect ISO strings
function serialize<T>(obj: Record<string, unknown>): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  if (!user) redirect("/login");

  // Fetch user's shops
  const userShops = await prisma.userShop.findMany({
    where: { user_id: user.id },
    select: { shop_id: true },
  });

  const shopIds = userShops.map((us) => us.shop_id);

  let shops: Shop[] = [];
  if (shopIds.length > 0) {
    const data = await prisma.shop.findMany({
      where: { id: { in: shopIds } },
    });
    shops = data.map((s) => serialize<Shop>(s as unknown as Record<string, unknown>));
  }

  // Shop users need an active shop. Both the Keycloak callback and the mock
  // login set one when the user has at least one shop, so reaching here without
  // a shopId means the user has no shop assigned at all. Render a terminal state
  // rather than redirecting to /login — under Keycloak that would re-authenticate
  // the same account and bounce straight back (an infinite loop).
  if (user.role === "user" && !session.shopId) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-exxon-charcoal">
        <div className="absolute top-0 left-0 right-0 h-1 bg-exxon-red" />
        <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-8 text-center shadow-2xl">
          <h1 className="text-2xl font-bold text-exxon-charcoal">No shop assigned</h1>
          <p className="text-sm text-exxon-gray">
            Your account isn&apos;t associated with any shop yet. Please contact
            your administrator to be added to a shop.
          </p>
          <a
            href="/api/auth/logout"
            className="inline-block w-full rounded-md bg-exxon-red px-4 py-2 text-white hover:bg-exxon-red-dark"
          >
            Sign out
          </a>
        </div>
      </div>
    );
  }

  // Get active shop
  let activeShop: Shop | null = null;
  if (session.shopId) {
    const data = await prisma.shop.findUnique({
      where: { id: session.shopId },
    });
    if (data) activeShop = serialize<Shop>(data as unknown as Record<string, unknown>);
  }

  // Project to the public session shape before crossing into the client
  // AuthProvider — never hand the sealed session's idToken (PII) to the browser.
  const clientSession = {
    userId: session.userId,
    role: session.role,
    shopId: session.shopId,
  };

  return (
    <AuthProvider
      initialSession={clientSession}
      initialUser={serialize<User>(user as unknown as Record<string, unknown>)}
    >
      <ShopProvider initialShop={activeShop} initialShops={shops}>
        <div className="flex h-screen flex-col">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-exxon-charcoal focus:px-4 focus:py-2 focus:text-white focus:outline-2 focus:outline-white"
          >
            Skip to main content
          </a>
          {/* Brand accent bar */}
          <div className="h-1 w-full bg-exxon-red shrink-0" />
          <div className="flex-1 overflow-y-auto">
            <div className="flex min-h-full flex-col">
              <div className="flex flex-1">
                <div className="sticky top-0 h-[calc(100vh-0.25rem)] shrink-0 self-start">
                  <Sidebar />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="sticky top-0 z-10 shrink-0">
                    <Header />
                  </div>
                  <main
                    id="main-content"
                    tabIndex={-1}
                    className="flex-1 bg-exxon-gray-lighter p-6 outline-none"
                  >
                    {children}
                  </main>
                </div>
              </div>
              {/* Full-width site footer */}
              <Footer />
            </div>
          </div>
        </div>
      </ShopProvider>
    </AuthProvider>
  );
}
