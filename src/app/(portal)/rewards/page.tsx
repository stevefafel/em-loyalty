"use client";

import { useShop } from "@/context/shop-context";
import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Award, CreditCard, Monitor } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

const visaRewards = [
  {
    id: "visa-50",
    name: "$50 Visa Gift Card",
    description: "Digital Visa gift card delivered via email within 24 hours.",
    pointsCost: 50,
  },
  {
    id: "visa-100",
    name: "$100 Visa Gift Card",
    description: "Digital Visa gift card delivered via email within 24 hours.",
    pointsCost: 100,
  },
  {
    id: "visa-150",
    name: "$150 Visa Gift Card",
    description: "Digital Visa gift card delivered via email within 24 hours.",
    pointsCost: 150,
  },
];

const techProviderRebates = [
  {
    id: "autoops-50",
    name: "$50 AutoOps Rebate",
    description: "AutoOps technology provider rebate delivered via email within 24 hours.",
    pointsCost: 50,
    logo: "/partners/autoops_logo.webp",
  },
  {
    id: "autoops-100",
    name: "$100 AutoOps Rebate",
    description: "AutoOps technology provider rebate delivered via email within 24 hours.",
    pointsCost: 100,
    logo: "/partners/autoops_logo.webp",
  },
  {
    id: "autoops-150",
    name: "$150 AutoOps Rebate",
    description: "AutoOps technology provider rebate delivered via email within 24 hours.",
    pointsCost: 150,
    logo: "/partners/autoops_logo.webp",
  },
  {
    id: "steer-50",
    name: "$50 Steer Rebate",
    description: "Steer technology provider rebate delivered via email within 24 hours.",
    pointsCost: 50,
    logo: "/partners/steer-logo.svg",
  },
  {
    id: "steer-100",
    name: "$100 Steer Rebate",
    description: "Steer technology provider rebate delivered via email within 24 hours.",
    pointsCost: 100,
    logo: "/partners/steer-logo.svg",
  },
  {
    id: "steer-150",
    name: "$150 Steer Rebate",
    description: "Steer technology provider rebate delivered via email within 24 hours.",
    pointsCost: 150,
    logo: "/partners/steer-logo.svg",
  },
];

export default function RewardsPage() {
  const { activeShop } = useShop();
  const { isApproved, isLoading } = useEnrollmentGuard();

  if (isLoading || !isApproved) return null;

  const balance = activeShop?.loyalty_points_balance || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-exxon-charcoal">Rewards</h1>
        <div className="flex items-center gap-2 rounded-lg bg-exxon-red/10 px-4 py-2">
          <Award className="h-5 w-5 text-exxon-red" />
          <span className="font-bold text-exxon-charcoal">{balance}</span>
          <span className="text-sm text-muted-foreground">points</span>
        </div>
      </div>

      <Tabs defaultValue="tech-rebates">
        <TabsList>
          <TabsTrigger value="tech-rebates">
            <Monitor className="h-5 w-5 mr-1.5" />
            Technology Provider Rebates
          </TabsTrigger>
          <TabsTrigger value="visa">
            <CreditCard className="h-5 w-5 mr-1.5" />
            Visa Gift Cards
          </TabsTrigger>
        </TabsList>

        {/* Technology Provider Rebates */}
        <TabsContent value="tech-rebates">
          <div className="grid gap-6 md:grid-cols-3">
            {techProviderRebates.map((item) => {
              const canAfford = balance >= item.pointsCost;
              return (
                <Card key={item.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex h-24 items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 p-4">
                      <Image
                        src={item.logo}
                        alt={item.name}
                        width={120}
                        height={120}
                        className="h-16 w-auto object-contain"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <CardTitle className="text-lg">{item.name}</CardTitle>
                    <CardDescription className="mt-2">
                      {item.description}
                    </CardDescription>
                  </CardContent>
                  <CardFooter className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className="border-exxon-blue text-exxon-blue"
                    >
                      {item.pointsCost} points
                    </Badge>
                    <Button
                      size="sm"
                      disabled={!canAfford}
                      className="bg-exxon-blue text-white hover:bg-exxon-blue/90"
                      onClick={() =>
                        toast.success("Redemption coming soon!", {
                          description: `${item.name} will be available for redemption in the full release.`,
                        })
                      }
                    >
                      {canAfford ? "Redeem" : "Not enough points"}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Visa Gift Cards */}
        <TabsContent value="visa">
          <div className="grid gap-6 md:grid-cols-3">
            {visaRewards.map((item) => {
              const canAfford = balance >= item.pointsCost;
              return (
                <Card key={item.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex h-24 items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-blue-100">
                      <CreditCard className="h-12 w-12 text-exxon-blue" />
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <CardTitle className="text-lg">{item.name}</CardTitle>
                    <CardDescription className="mt-2">
                      {item.description}
                    </CardDescription>
                  </CardContent>
                  <CardFooter className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className="border-exxon-blue text-exxon-blue"
                    >
                      {item.pointsCost} points
                    </Badge>
                    <Button
                      size="sm"
                      disabled={!canAfford}
                      className="bg-exxon-blue text-white hover:bg-exxon-blue/90"
                      onClick={() =>
                        toast.success("Redemption coming soon!", {
                          description: `${item.name} will be available for redemption in the full release.`,
                        })
                      }
                    >
                      {canAfford ? "Redeem" : "Not enough points"}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

    </div>
  );
}
