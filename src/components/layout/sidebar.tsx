"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useShop } from "@/context/shop-context";
import { PROGRAM_STATUS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Home,
  FileText,
  Gift,
  GraduationCap,
  FileDown,
  ClipboardCheck,
  Store,
  Upload,
  ExternalLink,
  Handshake,
} from "lucide-react";

const shopUserLinks = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/earn", label: "Earn & Track Points", icon: FileText },
  { href: "/rewards", label: "Rewards", icon: Gift },
  { href: "/training", label: "Training", icon: GraduationCap },
  { href: "/collateral", label: "Marketing Materials", icon: FileDown },
  { href: "/partners", label: "Technology Providers", icon: Handshake },
];

const adminLinks = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/admin/invoices", label: "Review Invoices", icon: ClipboardCheck },
  { href: "/admin/shops", label: "Manage Shops", icon: Store },
  { href: "/admin/training", label: "Training", icon: GraduationCap },
  { href: "/admin/collateral", label: "Marketing Materials", icon: FileDown },
];

const enrollmentLinks = [
  { href: "/enrollment", label: "Enrollment", icon: Upload },
];

const partnerLinks = [
  { label: "Log in to AutoOps", url: "https://dashboard.autoops.com", logo: "/partners/autoops-logo.png" },
  { label: "Log in to Steer", url: "https://app.steercrm.com", logo: "/partners/steer-logo.svg" },
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
      {/* Branding header — stacked M1 logo + program name with extra spacing */}
      <div className="flex flex-col items-center gap-5 border-b border-gray-200 px-5 py-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mobil1-logo-stacked.svg" alt="Mobil 1" className="h-20" />
        <span className="text-sm font-bold uppercase tracking-wider text-exxon-charcoal">
          Premium Growth
        </span>
      </div>

      {/* Main navigation */}
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

      {/* Partner login buttons + Pegasus footer */}
      <div className="border-t border-gray-200 px-3 py-3 space-y-2">
        {!isAdmin && isApproved && partnerLinks.map((partner) => (
          <a
            key={partner.label}
            href={partner.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-exxon-charcoal/70 hover:bg-gray-50 hover:text-exxon-charcoal transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={partner.logo} alt="" className="h-4 w-4 object-contain" />
            <span className="flex-1">{partner.label}</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-50" />
          </a>
        ))}

        {/* Pegasus logo — bigger and red */}
        <div className="flex justify-center pt-3 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Mobil_Pegasus_red_RGB-TM.png"
            alt="Mobil Pegasus"
            className="h-20"
          />
        </div>
      </div>
    </aside>
  );
}
