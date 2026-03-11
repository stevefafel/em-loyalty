"use client";

import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

const partners = [
  {
    name: "Steer CRM",
    logo: "/partners/steer-logo.svg",
    description:
      "Manage bookings, reviews, marketing, and customer retention all in one place. As a Premium Growth member, you get an exclusive 20% discount.",
    highlight: "20% off for Premium Growth members",
    loginUrl: "https://app.steercrm.com",
  },
  {
    name: "AutoOps",
    logo: "/partners/autoops-logo.png",
    description:
      "Streamline your shop operations with AutoOps. Track jobs, manage inventory, and optimize workflows to keep your business running smoothly.",
    highlight: "Integrated shop management",
    loginUrl: "https://dashboard.autoops.com",
  },
];

export default function PartnersPage() {
  const { isApproved, isLoading } = useEnrollmentGuard();

  if (isLoading || !isApproved) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">Partners</h1>
      <p className="text-muted-foreground">
        Access exclusive partner tools and discounts available to Premium Growth members.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        {partners.map((partner) => (
          <Card key={partner.name} className="flex flex-col">
            <CardHeader>
              <div className="flex h-20 items-center justify-center rounded-lg bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={partner.logo}
                  alt={partner.name}
                  className="h-10 object-contain"
                />
              </div>
              <CardTitle className="mt-4">{partner.name}</CardTitle>
              <CardDescription>{partner.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-end gap-4">
              <p className="text-sm font-medium text-exxon-red">
                {partner.highlight}
              </p>
              <Button
                className="w-full bg-exxon-blue text-white hover:bg-exxon-blue/90"
                onClick={() => window.open(partner.loginUrl, "_blank")}
              >
                Log in to {partner.name}
                <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* M1 branding footer */}
      <div className="flex justify-center pt-4 opacity-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mobil1-logo-stacked.svg" alt="" className="h-24" />
      </div>
    </div>
  );
}
