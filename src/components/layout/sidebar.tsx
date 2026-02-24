"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useShop } from "@/context/shop-context";
import { PROGRAM_STATUS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Award,
  ShoppingBag,
  GraduationCap,
  FileDown,
  Megaphone,
  Gift,
  ClipboardCheck,
  Store,
  Upload,
} from "lucide-react";

const shopUserLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/points", label: "Points & Rewards", icon: Award },
  { href: "/swag-shop", label: "Swag Shop", icon: ShoppingBag },
  { href: "/training", label: "Training", icon: GraduationCap },
  { href: "/collateral", label: "Marketing Materials", icon: FileDown },
  { href: "/ads", label: "Ads & Partners", icon: Megaphone },
  { href: "/perks", label: "Performance Perks", icon: Gift },
];

const adminLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/invoices", label: "Review Invoices", icon: ClipboardCheck },
  { href: "/admin/shops", label: "Manage Shops", icon: Store },
  { href: "/admin/training", label: "Training", icon: GraduationCap },
  { href: "/admin/collateral", label: "Marketing Materials", icon: FileDown },
];

const enrollmentLinks = [
  { href: "/enrollment", label: "Enrollment", icon: Upload },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const { activeShop } = useShop();

  const isApproved =
    activeShop?.program_status === PROGRAM_STATUS.APPROVED;

  let links;
  if (isAdmin) {
    links = adminLinks;
  } else if (isApproved) {
    links = shopUserLinks;
  } else {
    links = enrollmentLinks;
  }

  return (
    <aside className="flex w-60 flex-col border-r border-gray-200 bg-white shrink-0">
      <div className="flex h-14 items-center gap-3 border-b border-gray-200 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mobil1-logo.svg" alt="Mobil 1" className="h-6" />
        <div className="h-5 w-px bg-gray-300" />
        <span className="text-xs font-semibold uppercase tracking-wider text-exxon-gray">
          Loyalty
        </span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {links.map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-l-3 border-exxon-red bg-red-50 text-exxon-red"
                  : "text-exxon-charcoal/70 hover:bg-gray-50 hover:text-exxon-charcoal"
              )}
            >
              <link.icon className="h-4.5 w-4.5" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
