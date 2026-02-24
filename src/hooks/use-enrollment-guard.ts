"use client";

import { useShop } from "@/context/shop-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PROGRAM_STATUS } from "@/lib/constants";

export function useEnrollmentGuard(): {
  isApproved: boolean;
  isLoading: boolean;
} {
  const { activeShop } = useShop();
  const router = useRouter();

  const isApproved =
    activeShop?.program_status === PROGRAM_STATUS.APPROVED;

  useEffect(() => {
    if (activeShop && !isApproved) {
      router.replace("/enrollment");
    }
  }, [activeShop, isApproved, router]);

  return { isApproved, isLoading: !activeShop };
}
