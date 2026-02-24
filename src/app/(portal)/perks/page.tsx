"use client";

import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import { useShop } from "@/context/shop-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy, Medal, Award } from "lucide-react";

const tiers = [
  {
    name: "Bronze",
    minChanges: 50,
    icon: Award,
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-300",
    rewards: [
      "5% discount on Mobil 1 products",
      "Branded shop signage",
      "Monthly newsletter",
    ],
  },
  {
    name: "Silver",
    minChanges: 100,
    icon: Medal,
    color: "text-gray-500",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-300",
    rewards: [
      "10% discount on Mobil 1 products",
      "Premium shop signage",
      "Priority technical support",
      "Quarterly performance bonus",
    ],
  },
  {
    name: "Gold",
    minChanges: 200,
    icon: Trophy,
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-400",
    rewards: [
      "15% discount on Mobil 1 products",
      "Premium shop signage & POS display",
      "Dedicated account manager",
      "Monthly performance bonus",
      "Exclusive events & training",
    ],
  },
];

export default function PerksPage() {
  const { isApproved, isLoading } = useEnrollmentGuard();
  const { activeShop } = useShop();

  if (isLoading || !isApproved) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">
        Performance Perks
      </h1>
      <p className="text-muted-foreground">
        Earn monthly rewards based on the volume of Mobil 1 oil changes
        completed at your shop.
      </p>

      <div className="grid gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
          <Card
            key={tier.name}
            className={`border-2 ${tier.borderColor}`}
          >
            <CardHeader className="text-center">
              <div
                className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${tier.bgColor}`}
              >
                <tier.icon className={`h-8 w-8 ${tier.color}`} />
              </div>
              <CardTitle className="text-2xl mt-4">{tier.name}</CardTitle>
              <CardDescription>
                {tier.minChanges}+ oil changes / month
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {tier.rewards.map((reward) => (
                  <li
                    key={reward}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span className={`mt-0.5 ${tier.color}`}>&#10003;</span>
                    {reward}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Month Performance</CardTitle>
          <CardDescription>
            {activeShop?.name} — February 2026
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Mobil 1 Oil Changes</TableCell>
                <TableCell className="font-semibold">--</TableCell>
                <TableCell>
                  <Badge variant="outline" className="border-gray-400">
                    Tracking
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Current Tier</TableCell>
                <TableCell className="font-semibold">--</TableCell>
                <TableCell>
                  <Badge variant="outline" className="border-gray-400">
                    POC
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
